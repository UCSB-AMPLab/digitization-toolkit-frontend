// Keyboard trigger for capture (NEH-228). A USB digitization foot pedal acts
// as a keyboard that sends a single key, and the key differs from device to
// device, so the operator assigns it by pressing the pedal once and the
// browser stores it. The default (space bar) lets an ordinary keyboard work
// with no setup.
//
// No Svelte imports and no direct `window` references — everything comes in
// through arguments, so the Node test project can test the module without
// mounting a component.
//
// Two separate questions, answered separately:
//   - ownsEvent:     does the event belong to capture? (decides whether the
//                    caller calls preventDefault)
//   - shouldTrigger: should a capture start right now?
// Using only shouldTrigger would turn a held pedal into a navigation key: the
// first press is cancelled, but the repeats (repeat=true) reach the focused
// control.
//
// Version: 0.1.0-beta

import { browser } from '$app/environment';
import { STORAGE_KEYS, readStored, removeStored, writeStored } from '$lib/storage-keys';

export type CaptureChord = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
};

export const DEFAULT_CHORD: CaptureChord = {
  key: ' ',
  ctrl: false,
  alt: false,
  meta: false,
  shift: false
};

// What ownsEvent needs to decide whether the event belongs to capture,
// regardless of whether it should actually start one.
export interface OwnsEventContext {
  chord: CaptureChord;
  modalOpen: boolean;
  activeElement: Element | null;
}

// shouldTrigger adds what is specific to "start a capture now": the
// held-key latch, whether a capture is already in progress and whether the
// page is ready. Key repeat comes from the event itself.
export interface ShouldTriggerContext extends OwnsEventContext {
  keyHeld: boolean;
  capturing: boolean;
  ready: boolean;
}

export type LearnResult =
  | { ok: true; chord: CaptureChord }
  | { ok: false; reason: 'modifier-only'; modifier: 'Control' | 'Alt' | 'Shift' | 'Meta' }
  | { ok: false; reason: 'unbindable' };

export function chordFromEvent(event: KeyboardEvent): CaptureChord {
  return {
    key: event.key,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
    shift: event.shiftKey
  };
}

export function chordsMatch(a: CaptureChord, b: CaptureChord): boolean {
  return a.key === b.key && a.ctrl === b.ctrl && a.alt === b.alt && a.meta === b.meta && a.shift === b.shift;
}

// For display: a space is shown with the given label (default 'Space';
// printed as is it would be invisible), and modifiers are joined with "+" in
// a fixed order. Every other key is shown as the browser reports it —
// translating the space label but leaving F5 or Enter untranslated would be
// inconsistent.
export function describeChord(chord: CaptureChord, spaceLabel = 'Space'): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  if (chord.meta) parts.push('Meta');
  parts.push(chord.key === ' ' ? spaceLabel : chord.key);
  return parts.join('+');
}

// <input> types that accept typed text. checkbox/radio/range/button/submit
// are left out on purpose: with focus on those, the assigned key still has
// to trigger a capture.
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time'
]);

export function isTextEntry(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((element as HTMLElement).isContentEditable) return true;
  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type || 'text';
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

// Deliberately ignores repeat, the held-key latch and whether a capture is
// in progress: those decide whether to start a capture, not whether the
// event belongs to capture. The caller calls preventDefault whenever this
// returns true.
export function ownsEvent(event: KeyboardEvent, ctx: OwnsEventContext): boolean {
  return chordsMatch(chordFromEvent(event), ctx.chord) && !ctx.modalOpen && !isTextEntry(ctx.activeElement);
}

export function shouldTrigger(event: KeyboardEvent, ctx: ShouldTriggerContext): boolean {
  return ownsEvent(event, ctx) && !event.repeat && !ctx.keyHeld && !ctx.capturing && ctx.ready;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'] as const);

// `Dead` (a dead key mid-composition on some layouts) and `Unidentified`
// (the browser couldn't map the physical key) never name a real key either.
const UNBINDABLE_KEYS = new Set(['Dead', 'Unidentified']);

// An empty key, a modifier on its own (Control/Alt/Shift/Meta with no other
// key), or Dead/Unidentified can never trigger a capture — neither when
// newly assigned nor when read back from storage. learnFromEvent and
// readChord both use this one predicate so that the two paths cannot drift
// apart.
function isBindableKey(key: string): boolean {
  return key.length > 0 && !MODIFIER_KEYS.has(key as 'Control' | 'Alt' | 'Shift' | 'Meta') && !UNBINDABLE_KEYS.has(key);
}

function isBindableChord(chord: CaptureChord): boolean {
  return isBindableKey(chord.key);
}

export function learnFromEvent(event: KeyboardEvent): LearnResult {
  // Mid-composition does not depend on the value of `key`, so it is checked
  // separately.
  if (event.isComposing) {
    return { ok: false, reason: 'unbindable' };
  }
  // A lone modifier gets its own result (naming the modifier, so the
  // assignment control can say which); everything else isBindableKey
  // rejects (empty key, Dead, Unidentified) shares the generic
  // "unbindable".
  if (MODIFIER_KEYS.has(event.key as 'Control' | 'Alt' | 'Shift' | 'Meta')) {
    return { ok: false, reason: 'modifier-only', modifier: event.key as 'Control' | 'Alt' | 'Shift' | 'Meta' };
  }
  if (!isBindableKey(event.key)) {
    return { ok: false, reason: 'unbindable' };
  }
  return { ok: true, chord: chordFromEvent(event) };
}

// Persistence: a single localStorage key, following stores/token.ts —
// guarded by SvelteKit's `browser` flag and try/catch so that missing or
// throwing storage (private mode, quota) yields the default instead of
// breaking the page. A well-formed value whose key is not bindable
// (isBindableChord) falls back to the default just like a malformed one;
// otherwise no key could trigger a capture.

const STORAGE_KEY = STORAGE_KEYS.captureChord;

function isValidChord(value: unknown): value is CaptureChord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    typeof v.ctrl === 'boolean' &&
    typeof v.alt === 'boolean' &&
    typeof v.meta === 'boolean' &&
    typeof v.shift === 'boolean'
  );
}

export function readChord(): CaptureChord {
  if (!browser) return DEFAULT_CHORD;
  try {
    const raw = readStored(STORAGE_KEY);
    if (!raw) return DEFAULT_CHORD;
    const parsed = JSON.parse(raw);
    if (!isValidChord(parsed) || !isBindableChord(parsed)) return DEFAULT_CHORD;
    return parsed;
  } catch {
    return DEFAULT_CHORD;
  }
}

export function writeChord(chord: CaptureChord): void {
  if (!browser) return;
  // Storage may be unavailable (private mode, quota exceeded): the chord is
  // then kept only in memory for this session, without breaking the page.
  writeStored(STORAGE_KEY, JSON.stringify(chord));
}

export function clearChord(): void {
  if (!browser) return;
  removeStored(STORAGE_KEY);
}

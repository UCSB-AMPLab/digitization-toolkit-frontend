// Keyboard trigger for capture (NEH-228). A USB digitization foot pedal acts
// as a keyboard that sends a single key. Two keys work with no setup: the
// space bar, for an ordinary keyboard, and b, the key the project's foot
// pedal (RDing FootSwitch1F1) sends. An operator with another device assigns
// its key by pressing it once, and the browser stores it. From then on only
// that key triggers a capture. Letter case is ignored when keys are compared,
// so Caps Lock on the unit's keyboard does not disable the pedal.
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

// With nothing stored, either of these triggers a capture.
export const DEFAULT_CHORDS: readonly CaptureChord[] = [
  { key: ' ', ctrl: false, alt: false, meta: false, shift: false },
  { key: 'b', ctrl: false, alt: false, meta: false, shift: false }
];

// What ownsEvent needs to decide whether the event belongs to capture,
// regardless of whether it should actually start one.
export interface OwnsEventContext {
  chords: readonly CaptureChord[];
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

// Letter case is ignored in the key (with Caps Lock on, the browser reports
// 'B' for the pedal's b with shift false, and the pedal must still trigger).
// The four modifier flags are compared exactly, so Shift+b (key 'B', shift
// true) does not match b.
export function chordsMatch(a: CaptureChord, b: CaptureChord): boolean {
  return a.key.toLowerCase() === b.key.toLowerCase() && a.ctrl === b.ctrl && a.alt === b.alt && a.meta === b.meta && a.shift === b.shift;
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

// For display: the descriptions of every chord, joined with " / ".
export function describeChords(chords: readonly CaptureChord[], spaceLabel = 'Space'): string {
  return chords.map((chord) => describeChord(chord, spaceLabel)).join(' / ');
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

// True when the event matches any of the chords. Deliberately ignores
// repeat, the held-key latch and whether a capture is in progress: those decide whether to start a capture, not whether the
// event belongs to capture. The caller calls preventDefault whenever this
// returns true.
export function ownsEvent(event: KeyboardEvent, ctx: OwnsEventContext): boolean {
  const pressed = chordFromEvent(event);
  return ctx.chords.some((chord) => chordsMatch(pressed, chord)) && !ctx.modalOpen && !isTextEntry(ctx.activeElement);
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
// readChords both use this one predicate so that the two paths cannot drift
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

// Persistence: a single localStorage key, as stores/auth.ts keeps the user —
// guarded by SvelteKit's `browser` flag and try/catch so that missing or
// throwing storage (private mode, quota) yields the defaults instead of
// breaking the page. A well-formed value whose key is not bindable
// (isBindableChord) falls back to the defaults just like a malformed one;
// otherwise no key could trigger a capture. One chord is stored; with none
// stored, both default chords apply.

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

export function readChords(): readonly CaptureChord[] {
  if (!browser) return DEFAULT_CHORDS;
  try {
    const raw = readStored(STORAGE_KEY);
    if (!raw) return DEFAULT_CHORDS;
    const parsed = JSON.parse(raw);
    if (!isValidChord(parsed) || !isBindableChord(parsed)) return DEFAULT_CHORDS;
    return [parsed];
  } catch {
    return DEFAULT_CHORDS;
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

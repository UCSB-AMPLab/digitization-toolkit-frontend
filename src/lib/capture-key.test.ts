// NEH-228: a capture key the appliance can learn.
//
// This is the node-project test for the pure module — no Svelte, no real
// DOM. KeyboardEvent-shaped plain objects stand in for real events; a fake
// `localStorage` stands in for the browser's.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

import {
  chordFromEvent,
  chordsMatch,
  clearChord,
  DEFAULT_CHORD,
  describeChord,
  isTextEntry,
  learnFromEvent,
  ownsEvent,
  readChord,
  shouldTrigger,
  writeChord,
  type CaptureChord,
  type OwnsEventContext,
  type ShouldTriggerContext
} from './capture-key';

// A KeyboardEvent-shaped object. Only the fields the module reads are
// present, cast at the call site — there is no real KeyboardEvent in node.
function fakeEvent(overrides: Partial<{
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}> = {}): KeyboardEvent {
  return {
    key: ' ',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...overrides
  } as unknown as KeyboardEvent;
}

function fakeElement(overrides: Partial<{
  tagName: string;
  type: string;
  isContentEditable: boolean;
}> = {}): Element {
  return {
    tagName: 'DIV',
    isContentEditable: false,
    ...overrides
  } as unknown as Element;
}

const CHORD_A: CaptureChord = { key: 'a', ctrl: false, alt: false, meta: false, shift: false };

function baseOwnsCtx(overrides: Partial<OwnsEventContext> = {}): OwnsEventContext {
  return {
    chord: DEFAULT_CHORD,
    modalOpen: false,
    activeElement: null,
    ...overrides
  };
}

function baseTriggerCtx(overrides: Partial<ShouldTriggerContext> = {}): ShouldTriggerContext {
  return {
    ...baseOwnsCtx(),
    keyHeld: false,
    capturing: false,
    ready: true,
    ...overrides
  };
}

describe('chordFromEvent / chordsMatch', () => {
  it('builds a chord from an event', () => {
    const event = fakeEvent({ key: 'a', ctrlKey: true, shiftKey: true });
    expect(chordFromEvent(event)).toEqual({ key: 'a', ctrl: true, alt: false, meta: false, shift: true });
  });

  it('matches on key and all four modifier flags', () => {
    const a: CaptureChord = { key: 'a', ctrl: true, alt: false, meta: false, shift: false };
    const b: CaptureChord = { key: 'a', ctrl: true, alt: false, meta: false, shift: false };
    expect(chordsMatch(a, b)).toBe(true);
  });

  it.each([
    ['key', { key: 'b' }],
    ['ctrl', { ctrl: true }],
    ['alt', { alt: true }],
    ['meta', { meta: true }],
    ['shift', { shift: true }]
  ] as const)('does not match when %s differs', (_label, diff) => {
    const a: CaptureChord = { key: 'a', ctrl: false, alt: false, meta: false, shift: false };
    const b: CaptureChord = { ...a, ...diff };
    expect(chordsMatch(a, b)).toBe(false);
  });
});

describe('describeChord', () => {
  it('defaults the space label to "Space" when none is given', () => {
    expect(describeChord(DEFAULT_CHORD)).toBe('Space');
  });

  it('uses a given label for the space key instead of the default', () => {
    expect(describeChord(DEFAULT_CHORD, 'Espacio')).toBe('Espacio');
  });

  it('applies the space label inside a chord that combines it with modifiers', () => {
    const chord: CaptureChord = { ...DEFAULT_CHORD, ctrl: true };
    expect(describeChord(chord, 'Espacio')).toBe('Ctrl+Espacio');
  });

  it('does not apply the space label to a non-space key', () => {
    expect(describeChord(CHORD_A, 'Espacio')).toBe('a');
  });

  it('joins modifiers with a plus, in a fixed order, ending in the key', () => {
    const chord: CaptureChord = { key: 'a', ctrl: true, alt: true, meta: true, shift: true };
    expect(describeChord(chord)).toBe('Ctrl+Alt+Shift+Meta+a');
  });

  it('describes a plain key with no modifiers', () => {
    expect(describeChord(CHORD_A)).toBe('a');
  });
});

describe('isTextEntry', () => {
  it('is false for null', () => {
    expect(isTextEntry(null)).toBe(false);
  });

  it('is true for a textarea', () => {
    expect(isTextEntry(fakeElement({ tagName: 'TEXTAREA' }))).toBe(true);
  });

  it('is true for a select', () => {
    expect(isTextEntry(fakeElement({ tagName: 'SELECT' }))).toBe(true);
  });

  it('is true for a contenteditable element', () => {
    expect(isTextEntry(fakeElement({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
  });

  it.each(['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date'])(
    'is true for an input of type %s',
    (type) => {
      expect(isTextEntry(fakeElement({ tagName: 'INPUT', type }))).toBe(true);
    }
  );

  it.each(['checkbox', 'radio', 'range', 'button', 'submit'])(
    'is false for an input of type %s',
    (type) => {
      expect(isTextEntry(fakeElement({ tagName: 'INPUT', type }))).toBe(false);
    }
  );

  it('is false for a plain button element', () => {
    expect(isTextEntry(fakeElement({ tagName: 'BUTTON' }))).toBe(false);
  });
});

describe('ownsEvent', () => {
  it('is true when the chord matches, no modal is open, and focus is not text entry', () => {
    const event = fakeEvent({ key: ' ' });
    expect(ownsEvent(event, baseOwnsCtx())).toBe(true);
  });

  it('is false when the chord does not match', () => {
    const event = fakeEvent({ key: 'x' });
    expect(ownsEvent(event, baseOwnsCtx())).toBe(false);
  });

  it('is false when a modal is open', () => {
    const event = fakeEvent({ key: ' ' });
    expect(ownsEvent(event, baseOwnsCtx({ modalOpen: true }))).toBe(false);
  });

  it('is false when focus is in a text-entry element', () => {
    const event = fakeEvent({ key: ' ' });
    const ctx = baseOwnsCtx({ activeElement: fakeElement({ tagName: 'INPUT', type: 'text' }) });
    expect(ownsEvent(event, ctx)).toBe(false);
  });

  it('ignores the repeat flag — a held chord still owns the event', () => {
    const event = fakeEvent({ key: ' ', repeat: true });
    expect(ownsEvent(event, baseOwnsCtx())).toBe(true);
  });
});

describe('shouldTrigger', () => {
  it('is true when the event is owned, not a repeat, key not held, no capture in flight, and ready', () => {
    const event = fakeEvent({ key: ' ' });
    expect(shouldTrigger(event, baseTriggerCtx())).toBe(true);
  });

  it('is false on a repeat even though the event is owned (the case that separates it from ownsEvent)', () => {
    const event = fakeEvent({ key: ' ', repeat: true });
    expect(ownsEvent(event, baseTriggerCtx())).toBe(true);
    expect(shouldTrigger(event, baseTriggerCtx())).toBe(false);
  });

  it('is false when the key is already held', () => {
    const event = fakeEvent({ key: ' ' });
    expect(shouldTrigger(event, baseTriggerCtx({ keyHeld: true }))).toBe(false);
  });

  it('is false when a capture is already in flight', () => {
    const event = fakeEvent({ key: ' ' });
    expect(shouldTrigger(event, baseTriggerCtx({ capturing: true }))).toBe(false);
  });

  it('is false when the page is not ready', () => {
    const event = fakeEvent({ key: ' ' });
    expect(shouldTrigger(event, baseTriggerCtx({ ready: false }))).toBe(false);
  });

  it('is false when the event is not owned (modal open)', () => {
    const event = fakeEvent({ key: ' ' });
    expect(shouldTrigger(event, baseTriggerCtx({ modalOpen: true }))).toBe(false);
  });
});

describe('learnFromEvent', () => {
  it('accepts a plain key with no modifiers', () => {
    const result = learnFromEvent(fakeEvent({ key: 'a' }));
    expect(result).toEqual({ ok: true, chord: { key: 'a', ctrl: false, alt: false, meta: false, shift: false } });
  });

  it('accepts a chord (modifier held together with a real key)', () => {
    const result = learnFromEvent(fakeEvent({ key: 'a', ctrlKey: true }));
    expect(result).toEqual({ ok: true, chord: { key: 'a', ctrl: true, alt: false, meta: false, shift: false } });
  });

  it.each(['Control', 'Alt', 'Shift', 'Meta'])('reports %s alone as modifier-only, not a chord', (modifier) => {
    const result = learnFromEvent(fakeEvent({ key: modifier }));
    expect(result).toEqual({ ok: false, reason: 'modifier-only', modifier });
  });

  it('refuses Dead as unbindable', () => {
    const result = learnFromEvent(fakeEvent({ key: 'Dead' }));
    expect(result).toEqual({ ok: false, reason: 'unbindable' });
  });

  it('refuses Unidentified as unbindable', () => {
    const result = learnFromEvent(fakeEvent({ key: 'Unidentified' }));
    expect(result).toEqual({ ok: false, reason: 'unbindable' });
  });

  it('refuses an event mid-composition as unbindable', () => {
    const result = learnFromEvent(fakeEvent({ key: 'a', isComposing: true }));
    expect(result).toEqual({ ok: false, reason: 'unbindable' });
  });

  // Shares isBindableKey with readChord's storage validation below — an
  // empty key must be refused by both, or learning could silently replace
  // a working binding with one no keypress can ever match.
  it('refuses an empty key as unbindable', () => {
    const result = learnFromEvent(fakeEvent({ key: '' }));
    expect(result).toEqual({ ok: false, reason: 'unbindable' });
  });
});

describe('storage: readChord / writeChord / clearChord', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the default chord when nothing is stored', () => {
    expect(readChord()).toEqual(DEFAULT_CHORD);
  });

  it('round-trips a written chord', () => {
    writeChord(CHORD_A);
    expect(readChord()).toEqual(CHORD_A);
  });

  it('clears back to the default', () => {
    writeChord(CHORD_A);
    clearChord();
    expect(readChord()).toEqual(DEFAULT_CHORD);
  });

  it('falls back to the default on malformed JSON', () => {
    store['dtk_capture_chord'] = '{not json';
    expect(readChord()).toEqual(DEFAULT_CHORD);
  });

  it('falls back to the default on a well-formed but wrong-shaped value', () => {
    store['dtk_capture_chord'] = JSON.stringify({ foo: 'bar' });
    expect(readChord()).toEqual(DEFAULT_CHORD);
  });

  it('falls back to the default when the stored chord has an empty key', () => {
    store['dtk_capture_chord'] = JSON.stringify({ key: '', ctrl: false, alt: false, meta: false, shift: false });
    expect(readChord()).toEqual(DEFAULT_CHORD);
  });

  it.each(['Control', 'Alt', 'Shift', 'Meta'])(
    'falls back to the default when the stored chord is modifier-only: %s',
    (key) => {
      store['dtk_capture_chord'] = JSON.stringify({ key, ctrl: false, alt: false, meta: false, shift: false });
      expect(readChord()).toEqual(DEFAULT_CHORD);
    }
  );

  // The same shared predicate that makes learnFromEvent refuse Dead/
  // Unidentified must also keep them out of storage — before this, a
  // corrupted or hand-edited value with one of these keys passed validation.
  it.each(['Dead', 'Unidentified'])(
    'falls back to the default when the stored chord key is %s',
    (key) => {
      store['dtk_capture_chord'] = JSON.stringify({ key, ctrl: false, alt: false, meta: false, shift: false });
      expect(readChord()).toEqual(DEFAULT_CHORD);
    }
  );

  it('falls back to the default when storage throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
      removeItem: () => { throw new Error('storage disabled'); }
    });
    expect(readChord()).toEqual(DEFAULT_CHORD);
  });

  it('does not throw when storage throws on write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => { throw new Error('storage disabled'); }
    });
    expect(() => writeChord(CHORD_A)).not.toThrow();
    expect(() => clearChord()).not.toThrow();
  });
});

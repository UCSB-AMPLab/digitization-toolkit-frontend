// ============================================================================
// MÓDULO: capture-key.ts (NEH-228)
//
// La captura ya no depende solo del puntero: un pedal de digitalización USB
// se comporta como un teclado que emite una sola tecla, y esa tecla varía
// por dispositivo. En vez de exigir configuración manual, quien opera la
// asigna presionando el pedal una vez, y queda guardada en ese navegador.
// El valor predeterminado (barra espaciadora) deja que un teclado normal
// funcione sin tocar nada.
//
// Módulo puro: sin imports de Svelte, sin referencias directas a `window` —
// todo entra por argumentos, para poder probarlo íntegro en el proyecto de
// Node sin montar ningún componente.
//
// Dos preguntas distintas, respondidas por separado (ronda 55 de revisión):
//   - ownsEvent:    ¿el evento le pertenece a la captura? (para decidir si
//                    se llama a preventDefault)
//   - shouldTrigger: ¿debe arrancar una captura ahora mismo?
// Confundirlas convierte un pedal sostenido en un botón de navegación: si
// solo se usara shouldTrigger, la primera pulsación se cancela pero las
// repeticiones (evento repeat=true) pasan de largo hacia el control
// seleccionado.
// ============================================================================

import { browser } from '$app/environment';

// ---------------------------------------------------------------------------
// TIPOS
// ---------------------------------------------------------------------------

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

// Contexto para ownsEvent: lo que necesita saber si el evento pertenece a
// la captura, sin importar si de verdad debe disparar una.
export interface OwnsEventContext {
  chord: CaptureChord;
  modalOpen: boolean;
  activeElement: Element | null;
}

// shouldTrigger reutiliza el contexto anterior y agrega lo específico de
// "arrancar una captura ahora": la tecla repetida, el seguro de tecla
// sostenida, si ya hay una captura en curso y si la página está lista.
export interface ShouldTriggerContext extends OwnsEventContext {
  keyHeld: boolean;
  capturing: boolean;
  ready: boolean;
}

export type LearnResult =
  | { ok: true; chord: CaptureChord }
  | { ok: false; reason: 'modifier-only'; modifier: 'Control' | 'Alt' | 'Shift' | 'Meta' }
  | { ok: false; reason: 'unbindable' };

// ---------------------------------------------------------------------------
// COMBINACIÓN DE TECLAS: construcción, comparación, descripción
// ---------------------------------------------------------------------------

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

// Para mostrar en pantalla: un espacio se nombra con la etiqueta dada (por
// defecto 'Space'; imprimirlo tal cual sería invisible), y los modificadores
// se unen con "+" en un orden fijo. El resto de las teclas queda tal como
// las reporta el navegador — traducir 'Espacio' pero dejar F5 o Enter sin
// traducir sería peor que dejarlos todos así.
export function describeChord(chord: CaptureChord, spaceLabel = 'Space'): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push('Ctrl');
  if (chord.alt) parts.push('Alt');
  if (chord.shift) parts.push('Shift');
  if (chord.meta) parts.push('Meta');
  parts.push(chord.key === ' ' ? spaceLabel : chord.key);
  return parts.join('+');
}

// ---------------------------------------------------------------------------
// ELEMENTO ACTIVO: ¿es un campo de texto?
// ---------------------------------------------------------------------------

// Tipos de <input> que aceptan texto tecleado. checkbox/radio/range/
// button/submit quedan fuera a propósito: en esos, la tecla configurada
// tiene que seguir disparando la captura.
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

// ---------------------------------------------------------------------------
// OWNSEVENT / SHOULDTRIGGER
// ---------------------------------------------------------------------------

// ¿Le pertenece este evento a la captura? Deliberadamente ignora repeat, el
// seguro de tecla sostenida y si hay una captura en curso: esas tres
// cosas deciden si HAY QUE arrancar una captura, no si el evento es de la
// captura. El llamador hace preventDefault siempre que esto sea true.
export function ownsEvent(event: KeyboardEvent, ctx: OwnsEventContext): boolean {
  return chordsMatch(chordFromEvent(event), ctx.chord) && !ctx.modalOpen && !isTextEntry(ctx.activeElement);
}

export function shouldTrigger(event: KeyboardEvent, ctx: ShouldTriggerContext): boolean {
  return ownsEvent(event, ctx) && !event.repeat && !ctx.keyHeld && !ctx.capturing && ctx.ready;
}

// ---------------------------------------------------------------------------
// ASIGNAR LA TECLA: learnFromEvent
// ---------------------------------------------------------------------------

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'] as const);

// `Dead` (a dead key mid-composition on some layouts) and `Unidentified`
// (the browser couldn't map the physical key) never name a real key either.
const UNBINDABLE_KEYS = new Set(['Dead', 'Unidentified']);

// Una tecla vacía, uno de los modificadores solo (Control/Alt/Shift/Meta,
// sin ninguna otra tecla), o Dead/Unidentified, nunca puede ser el
// disparador de una captura — ni recién asignada ni recuperada del
// almacenamiento. Un solo predicado para los dos caminos: learnFromEvent
// y readChord lo llaman los dos, para que no puedan desalinearse con el
// tiempo (como pasó antes: learnFromEvent tenía su propia lista y readChord
// ninguna).
function isBindableKey(key: string): boolean {
  return key.length > 0 && !MODIFIER_KEYS.has(key as 'Control' | 'Alt' | 'Shift' | 'Meta') && !UNBINDABLE_KEYS.has(key);
}

function isBindableChord(chord: CaptureChord): boolean {
  return isBindableKey(chord.key);
}

export function learnFromEvent(event: KeyboardEvent): LearnResult {
  // Mid-composición no depende del valor de `key` — se revisa aparte.
  if (event.isComposing) {
    return { ok: false, reason: 'unbindable' };
  }
  // Un modificador solo tiene su propio diagnóstico (cuál modificador,
  // para que el control de asignación pueda decirlo); todo lo demás que
  // isBindableKey rechaza (tecla vacía, Dead, Unidentified) comparte el
  // mismo "unbindable" genérico que usa el almacenamiento.
  if (MODIFIER_KEYS.has(event.key as 'Control' | 'Alt' | 'Shift' | 'Meta')) {
    return { ok: false, reason: 'modifier-only', modifier: event.key as 'Control' | 'Alt' | 'Shift' | 'Meta' };
  }
  if (!isBindableKey(event.key)) {
    return { ok: false, reason: 'unbindable' };
  }
  return { ok: true, chord: chordFromEvent(event) };
}

// ---------------------------------------------------------------------------
// PERSISTENCIA: una sola clave en localStorage, siguiendo la forma de
// stores/token.ts — protegida por el flag `browser` de SvelteKit y try/catch
// para que un storage ausente o que lanza (modo privado, cuota) devuelva el
// valor por defecto en vez de romper la página. Un valor con la forma
// correcta pero con una tecla vacía o solo un modificador (isBindableChord)
// cae al valor por defecto igual que uno malformado — si no, la captura
// quedaría muerta sin ninguna tecla capaz de dispararla.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'dtk_capture_chord';

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
    const raw = localStorage.getItem(STORAGE_KEY);
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chord));
  } catch {
    // localStorage puede no estar disponible (modo privado, cuota agotada):
    // la combinación de teclas queda solo en memoria para esta sesión, sin
    // romper la página.
  }
}

export function clearChord(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ver writeChord
  }
}

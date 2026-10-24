// ============================================================================
// RECORRIDO GUIADO DE PRIMER ARRANQUE (NEH-95)
//
// El operador nuevo no sabe por dónde empezar y el equipo no está en el
// archivo para explicárselo. Este recorrido enseña el orden de las cosas:
// proyecto → volumen → captura → revisión → aprobación → exportación.
//
// ACOMPAÑA, NO CONDUCE. El recorrido no navega por el operador: explica el
// paso, espera a que lo haga de verdad, y reaparece en la pantalla siguiente
// donde iba. El criterio de aceptación del ticket es que el operador
// *complete* el flujo guiado, no que lo vea pasar — y en un equipo recién
// instalado no hay proyectos que mostrar, así que conducir significaría
// enseñar pantallas vacías.
//
// Cada paso declara en qué ruta vive. Si el operador no está ahí, el paso se
// muestra igual pero sin resaltado: sirve de indicación de a dónde ir.
// ============================================================================

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type TourStep = {
  /** Clave de i18n del título (tour_sN_title). */
  id: string;
  /** En qué ruta vive este paso. */
  match: RegExp;
  /**
   * Atributo data-tour del control que se resalta. null cuando el control
   * todavía no existe en la interfaz — el paso se explica sin señalar nada.
   */
  target: string | null;
  /** Dónde se coloca la caja respecto al objetivo, si cabe. */
  side: 'top' | 'bottom' | 'left' | 'right';
};

const PROJECTS    = /^\/dashboard\/projects\/?$/;
const PROJECT     = /^\/dashboard\/projects\/\d+\/?$/;
const COLLECTION  = /^\/dashboard\/projects\/\d+\/collections\/\d+/;

export const TOUR_STEPS: TourStep[] = [
  { id: 'tour_s1', match: PROJECTS,   target: 'nuevo-proyecto',  side: 'left'   },
  { id: 'tour_s2', match: PROJECT,    target: 'nuevo-volumen',   side: 'left'   },
  // Debajo: el botón de capturar vive en la barra superior, así que una
  // caja encima quedaría pegada al borde o tapando la propia barra.
  { id: 'tour_s3', match: COLLECTION, target: 'capturar',        side: 'bottom' },
  // Debajo, como el de capturar: ambos viven en la barra superior. El botón
  // sólo existe cuando hay capturas sin enviar, así que en un volumen vacío
  // el paso se explica sin resaltar nada — que es el respaldo previsto.
  { id: 'tour_s4', match: COLLECTION, target: 'entregar',        side: 'bottom' },
  { id: 'tour_s5', match: COLLECTION, target: 'aprobar',         side: 'top'    },
  { id: 'tour_s6', match: COLLECTION, target: 'exportar',        side: 'top'    },
];

// ── Persistencia ────────────────────────────────────────────────────────────
// Por cuenta y por navegador. En un aparato que vive en un archivo, con un
// solo navegador y los mismos operadores, eso es «por cuenta» en la práctica.
// No sigue al usuario a otra unidad; para eso haría falta una columna en el
// modelo User, que hoy no tiene dónde guardar preferencias.
//
// Falla de forma amable: si la marca se pierde, el recorrido sale otra vez.

const KEY = (userId: number | string) => `dtk_tour_visto:${userId}`;

export function tourSeen(userId: number | string | null | undefined): boolean {
  if (!browser || userId == null) return true; // sin usuario no se ofrece
  try {
    return localStorage.getItem(KEY(userId)) !== null;
  } catch {
    // localStorage puede no estar disponible (modo privado, cuota agotada).
    // Decir «ya lo vio» evita que el recorrido salte en cada carga.
    return true;
  }
}

function markSeen(userId: number | string | null | undefined) {
  if (!browser || userId == null) return;
  try {
    localStorage.setItem(KEY(userId), new Date().toISOString());
  } catch {
    // Sin marca el recorrido reaparecerá. Molesto, nada más.
  }
}

// ── Store ───────────────────────────────────────────────────────────────────

type TourState = {
  active: boolean;
  index: number;
};

function createTourStore() {
  const { subscribe, set, update } = writable<TourState>({ active: false, index: 0 });

  return {
    subscribe,

    /** Abrir desde el menú de ayuda. Siempre empieza en el primer paso. */
    start() {
      set({ active: true, index: 0 });
    },

    /**
     * Abrir la primera vez que esta cuenta entra, y sólo esa vez.
     * Marcar aquí y no al terminar es deliberado: alguien que lo cierra a
     * los dos segundos no quiere verlo otra vez en cada arranque, y el
     * botón de ayuda lo reabre cuando quiera.
     */
    startIfFirstTime(userId: number | string | null | undefined) {
      if (tourSeen(userId)) return;
      markSeen(userId);
      set({ active: true, index: 0 });
    },

    next() {
      update((s) =>
        s.index >= TOUR_STEPS.length - 1
          ? { active: false, index: 0 }
          : { ...s, index: s.index + 1 }
      );
    },

    prev() {
      update((s) => ({ ...s, index: Math.max(0, s.index - 1) }));
    },

    goTo(index: number) {
      update((s) => ({ ...s, index: Math.min(Math.max(0, index), TOUR_STEPS.length - 1) }));
    },

    stop() {
      set({ active: false, index: 0 });
    },
  };
}

export const tour = createTourStore();

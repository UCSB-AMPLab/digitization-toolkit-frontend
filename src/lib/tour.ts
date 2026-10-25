// First-run guided tour (NEH-95). A new operator does not know where to
// start, and the team is not at the archive to explain. The tour teaches the
// order of the work: project → volume → capture → review → approval → export.
//
// The tour accompanies; it does not drive. It never navigates for the
// operator: it explains the step, waits for the operator to do it, and picks
// up again on the next screen. The issue's acceptance criterion is that the
// operator *completes* the guided flow, not that they watch it — and a newly
// installed unit has no projects to show, so driving would mean showing
// empty screens.
//
// Each step declares the route it belongs to. When the operator is elsewhere,
// the step is still shown, without a highlight, as a pointer to where to go.

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type TourStep = {
  /** Prefix of the step's i18n keys (`<id>_title`, `<id>_body`, `<id>_where`). */
  id: string;
  /** The route this step belongs to. */
  match: RegExp;
  /**
   * data-tour attribute of the highlighted control. null when the interface
   * has no such control yet — the step is explained without pointing at
   * anything.
   */
  target: string | null;
  /** Where the box goes relative to the target, if it fits. */
  side: 'top' | 'bottom' | 'left' | 'right';
};

const PROJECTS    = /^\/dashboard\/projects\/?$/;
const PROJECT     = /^\/dashboard\/projects\/\d+\/?$/;
const COLLECTION  = /^\/dashboard\/projects\/\d+\/collections\/\d+/;

export const TOUR_STEPS: TourStep[] = [
  { id: 'tour_s1', match: PROJECTS,   target: 'nuevo-proyecto',  side: 'left'   },
  { id: 'tour_s2', match: PROJECT,    target: 'nuevo-volumen',   side: 'left'   },
  // Below: the capture button sits in the top bar, so a box above it would
  // be pressed against the edge or cover the bar itself.
  { id: 'tour_s3', match: COLLECTION, target: 'capturar',        side: 'bottom' },
  // Below, like capture: both sit in the top bar. The button exists only
  // when there are captures not yet sent, so in an empty volume the step is
  // explained without a highlight — the intended fallback.
  { id: 'tour_s4', match: COLLECTION, target: 'entregar',        side: 'bottom' },
  // The approve button sits in the annotations panel against the left edge,
  // and the export button in the toolbar against the right edge: the box
  // goes on the side with room. Approve exists only in book view with the
  // annotations panel open, for reviewers and admins, so the step text says
  // how to reach it.
  { id: 'tour_s5', match: COLLECTION, target: 'aprobar',         side: 'right'  },
  { id: 'tour_s6', match: COLLECTION, target: 'exportar',        side: 'left'   },
];

// ── Persistence ─────────────────────────────────────────────────────────────
// Per account and per browser. On an appliance that stays in one archive,
// with one browser and the same operators, that amounts to per account. It
// does not follow the user to another unit; that would need a column in the
// User model, which has nowhere to store preferences.
//
// If the mark is lost, the tour is shown again; nothing worse happens.

const KEY = (userId: number | string) => `dtk_tour_visto:${userId}`;

export function tourSeen(userId: number | string | null | undefined): boolean {
  if (!browser || userId == null) return true; // not offered without a user
  try {
    return localStorage.getItem(KEY(userId)) !== null;
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded).
    // Answering "already seen" keeps the tour from opening on every load.
    return true;
  }
}

function markSeen(userId: number | string | null | undefined) {
  if (!browser || userId == null) return;
  try {
    localStorage.setItem(KEY(userId), new Date().toISOString());
  } catch {
    // Without the mark the tour opens again next time; nothing else breaks.
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

    /** Opened from the help menu. Always starts at the first step. */
    start() {
      set({ active: true, index: 0 });
    },

    /**
     * Opens the tour the first time this account signs in, and only then.
     * Marking it seen here rather than on finishing is deliberate: someone
     * who closes it after two seconds does not want it again on every start,
     * and the help button reopens it at any time.
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

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
//
// The steps follow the unit's mode (NEH-318). Projects are shown only in
// Scanner only mode with projects on (NEH-311, NEH-313); otherwise the menu
// has Volúmenes instead of Proyectos and the project pages redirect there, so
// the project step is dropped, the volume step points at Nuevo volumen in
// Volúmenes, and every route starts from Volúmenes. In Fisqua mode volumes
// come from Fisqua's queue, so for whoever cannot create one there (the
// rule that shows or hides Nuevo volumen, canCreateVolumes) the volume step
// points at Cola in the side menu instead; an administrator, who still can,
// gets the Volúmenes steps. The steps are derived from the unit state the
// dashboard layout reads (unitState) and the signed-in user's role: while
// the state is unknown the tour is the one with projects, as every other
// gate takes an unknown state, and it changes to the unit's own as soon as
// the state arrives.
//
// Version: 0.1.0-beta

import { derived, get, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { STORAGE_KEYS, readStoredStrict } from '$lib/storage-keys';
import { canCreateVolumes, projectsShownIn, unitState, type UnitState } from '$lib/unit-mode';
import { userRole } from '$lib/stores/auth';

/**
 * What a step teaches, in the order of the work. Variants of one step share
 * a lesson (the volume step is `tour_s2`, `tour_s2_vol` or `tour_s2_fisqua`),
 * so the tour keeps its place by lesson when the steps change.
 */
export const TOUR_LESSONS = ['project', 'volume', 'capture', 'send', 'approve', 'export'] as const;
export type TourLesson = (typeof TOUR_LESSONS)[number];

export type TourStep = {
  /** What the step teaches. */
  lesson: TourLesson;
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
  /** The route hint's key, when it is not `<id>_where`. */
  where?: string;
};

/** The i18n keys of a step's title, body and route hint. */
export function tourKeys(step: TourStep): { title: string; body: string; where: string } {
  return { title: `${step.id}_title`, body: `${step.id}_body`, where: step.where ?? `${step.id}_where` };
}

const PROJECTS    = /^\/dashboard\/projects\/?$/;
const PROJECT     = /^\/dashboard\/projects\/\d+\/?$/;
const COLLECTION  = /^\/dashboard\/projects\/\d+\/collections\/\d+/;
const VOLUMES     = /^\/dashboard\/volumes\/?$/;
// Every dashboard screen with the side menu. The volume screen and the
// capture screen have their own layout, without it.
const WITH_MENU   = /^\/dashboard(?!\/projects\/\d+\/collections\/)(\/.*)?$/;

// Capture, send for review, approve and export: the same in every mode. The
// volume page keeps its route under the project while projects are hidden.
const VOLUME_STEPS: TourStep[] = [
  // Below: the capture button sits in the top bar, so a box above it would
  // be pressed against the edge or cover the bar itself.
  { lesson: 'capture', id: 'tour_s3', match: COLLECTION, target: 'capturar',        side: 'bottom' },
  // Below, like capture: both sit in the top bar. The button exists only
  // when there are captures not yet sent, so in an empty volume the step is
  // explained without a highlight — the intended fallback.
  { lesson: 'send',    id: 'tour_s4', match: COLLECTION, target: 'entregar',        side: 'bottom' },
  // The approve button sits in the annotations panel against the left edge,
  // and the export button in the toolbar against the right edge: the box
  // goes on the side with room. Approve exists only in book view with the
  // annotations panel open, for reviewers and admins, so the step text says
  // how to reach it.
  { lesson: 'approve', id: 'tour_s5', match: COLLECTION, target: 'aprobar',         side: 'right'  },
  { lesson: 'export',  id: 'tour_s6', match: COLLECTION, target: 'exportar',        side: 'left'   },
];

export const TOUR_STEPS: TourStep[] = [
  { lesson: 'project', id: 'tour_s1', match: PROJECTS,   target: 'nuevo-proyecto',  side: 'left'   },
  { lesson: 'volume',  id: 'tour_s2', match: PROJECT,    target: 'nuevo-volumen',   side: 'left'   },
  ...VOLUME_STEPS,
];

// Without projects, the later steps give their route from Volúmenes.
const FROM_VOLUMES: TourStep[] = VOLUME_STEPS.map((s) => ({ ...s, where: `${s.id}_where_vol` }));

const STEPS_WITHOUT_PROJECTS: TourStep[] = [
  { lesson: 'volume', id: 'tour_s2_vol', match: VOLUMES, target: 'nuevo-volumen', side: 'left' },
  ...FROM_VOLUMES,
];

// The side menu is on the left, so the box goes to its right.
const STEPS_FISQUA: TourStep[] = [
  { lesson: 'volume', id: 'tour_s2_fisqua', match: WITH_MENU, target: 'cola', side: 'right' },
  ...FROM_VOLUMES,
];

/** The tour's steps for the unit's state and the user's role; the full tour while the state is not known. */
export function tourSteps(state: UnitState | null, role: string | null | undefined = null): TourStep[] {
  if (state?.mode === 'fisqua' && !canCreateVolumes(role, state)) return STEPS_FISQUA;
  return projectsShownIn(state) ? TOUR_STEPS : STEPS_WITHOUT_PROJECTS;
}

/** The steps for the unit state last read and the signed-in user. */
export const currentTourSteps = derived([unitState, userRole], ([$state, $role]) => tourSteps($state, $role));

function lastIndex(): number {
  return get(currentTourSteps).length - 1;
}

/**
 * Where the tour stands in `next` when it stood at `index` in `prev`: the
 * same lesson, or, when that lesson was dropped (the project step once
 * projects are hidden), the first lesson after it that `next` has.
 */
export function reconcileTourIndex(prev: TourStep[], next: TourStep[], index: number): number {
  const was = prev[Math.min(Math.max(0, index), prev.length - 1)];
  if (!was || next.length === 0) return 0;
  const order = TOUR_LESSONS.indexOf(was.lesson);
  const found = next.findIndex((s) => TOUR_LESSONS.indexOf(s.lesson) >= order);
  return found === -1 ? next.length - 1 : found;
}

// ── Persistence ─────────────────────────────────────────────────────────────
// Per account and per browser. On an appliance that stays in one archive,
// with one browser and the same operators, that amounts to per account. It
// does not follow the user to another unit; that would need a column in the
// User model, which has nowhere to store preferences.
//
// If the mark is lost, the tour is shown again; nothing worse happens.

const KEY = STORAGE_KEYS.tourSeen;

export function tourSeen(userId: number | string | null | undefined): boolean {
  if (!browser || userId == null) return true; // not offered without a user
  try {
    return readStoredStrict(KEY(userId)) !== null;
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
  const store = writable<TourState>({ active: false, index: 0 });
  const { subscribe, set, update } = store;

  // The steps change with the tour open when the unit's state arrives after
  // the tour started, or the signed-in role changes. The stored index is
  // moved to the same lesson in the new steps, so the step shown and the
  // index Next and Previous work from never disagree.
  let known = get(currentTourSteps);
  currentTourSteps.subscribe((steps) => {
    const before = known;
    known = steps;
    if (steps === before) return;
    const s = get(store);
    if (!s.active) return;
    const index = reconcileTourIndex(before, steps, s.index);
    if (index !== s.index) set({ ...s, index });
  });

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
        s.index >= lastIndex()
          ? { active: false, index: 0 }
          : { ...s, index: s.index + 1 }
      );
    },

    prev() {
      update((s) => ({ ...s, index: Math.max(0, s.index - 1) }));
    },

    goTo(index: number) {
      update((s) => ({ ...s, index: Math.min(Math.max(0, index), lastIndex()) }));
    },

    stop() {
      set({ active: false, index: 0 });
    },
  };
}

export const tour = createTourStore();

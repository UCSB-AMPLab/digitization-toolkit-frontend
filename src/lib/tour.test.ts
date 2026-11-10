// The guided tour follows the unit's mode (NEH-318). Since NEH-311 projects
// are shown only in Scanner only mode with projects on; otherwise the menu
// shows Volúmenes and the project pages redirect there, and in Fisqua mode
// volumes come from Fisqua's queue for whoever cannot create them there
// (canCreateVolumes): an administrator still can, and gets the Volúmenes
// tour. The tour has to teach the screens the operator actually has.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { get } from 'svelte/store';
import { es } from './i18n/es';
import { en } from './i18n/en';
import { tour, tourKeys, tourSteps, currentTourSteps, type TourStep } from './tour';
import { unitState, type UnitState } from './unit-mode';
import { authStore } from './stores/auth';

function state(over: Partial<UnitState> = {}): UnitState {
	return {
		mode: 'offline',
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: null,
		prerequisites: { backup: [], fisqua: [] },
		keptVolumes: [],
		...over
	};
}

const SHOWN = state({ projectsEnabled: true, projectsShown: true });
const HIDDEN_OFFLINE = state();
const HIDDEN_BACKUP = state({ mode: 'backup', projectsEnabled: true });
const FISQUA = state({ mode: 'fisqua' });

const catalogs = { es: es as unknown as Record<string, unknown>, en: en as unknown as Record<string, unknown> };

function text(lang: 'es' | 'en', key: string): string {
	return catalogs[lang][key] as string;
}

function ids(steps: TourStep[]): string[] {
	return steps.map((s) => s.id);
}

afterEach(() => {
	tour.stop();
	unitState.set(null);
	authStore.clearSession();
});

describe('projects shown', () => {
	it('keeps the six steps, starting with the project', () => {
		for (const s of [SHOWN, null]) {
			const steps = tourSteps(s);
			expect(ids(steps)).toEqual(['tour_s1', 'tour_s2', 'tour_s3', 'tour_s4', 'tour_s5', 'tour_s6']);
			expect(steps[0].target).toBe('nuevo-proyecto');
			expect(steps[0].match.test('/dashboard/projects')).toBe(true);
			expect(steps[1].match.test('/dashboard/projects/4')).toBe(true);
			for (const step of steps) expect(tourKeys(step).where).toBe(`${step.id}_where`);
		}
	});
});

describe('projects hidden (Scanner only without projects, Offsite copy only)', () => {
	it('drops the project step and starts at Volúmenes', () => {
		for (const s of [HIDDEN_OFFLINE, HIDDEN_BACKUP]) {
			const steps = tourSteps(s);
			expect(steps).toHaveLength(5);
			expect(steps.some((step) => step.id === 'tour_s1')).toBe(false);
			const first = steps[0];
			expect(first.target).toBe('nuevo-volumen');
			expect(first.match.test('/dashboard/volumes')).toBe(true);
			expect(first.match.test('/dashboard/projects/4')).toBe(false);
			// The capture, send, approve and export steps stay on the volume page.
			expect(steps.slice(1).every((step) => step.match.test('/dashboard/projects/4/collections/9'))).toBe(true);
		}
	});

	it('gives every route from Volúmenes, never from Proyectos', () => {
		for (const step of tourSteps(HIDDEN_OFFLINE)) {
			const where = tourKeys(step).where;
			expect(text('es', where).startsWith('Ve a Volúmenes ›')).toBe(true);
			expect(text('en', where).startsWith('Go to Volumes ›')).toBe(true);
		}
	});

	it('does not say a volume belongs to a project', () => {
		for (const step of tourSteps(HIDDEN_OFFLINE)) {
			const k = tourKeys(step);
			for (const key of [k.title, k.body, k.where]) {
				expect(text('es', key)).not.toMatch(/proyecto/i);
				expect(text('en', key)).not.toMatch(/project/i);
			}
		}
	});
});

describe('Fisqua mode', () => {
	it('points to Cola instead of a new-volume button', () => {
		const steps = tourSteps(FISQUA, 'operator');
		expect(steps).toHaveLength(5);
		const first = steps[0];
		expect(first.target).toBe('cola');
		expect(ids(steps)).not.toContain('tour_s1');
		expect(ids(steps)).not.toContain('tour_s2');
		const k = tourKeys(first);
		expect(text('es', k.body)).toContain('cola de Fisqua');
		expect(text('es', k.where)).toBe('Ve a Cola.');
		expect(text('en', k.where)).toBe('Go to Queue.');
	});

	it('highlights Cola on every screen with the side menu, and not on the volume screen', () => {
		const first = tourSteps(FISQUA, 'operator')[0];
		for (const path of ['/dashboard', '/dashboard/', '/dashboard/volumes', '/dashboard/queue', '/dashboard/retakes']) {
			expect(first.match.test(path)).toBe(true);
		}
		expect(first.match.test('/dashboard/projects/4/collections/9')).toBe(false);
		expect(first.match.test('/live-preview')).toBe(false);
	});

	// Capturar beside the volume in Cola opens the capture screen directly
	// (captureUrl in $lib/queue), without the volume page.
	it('teaches capture from Cola, on the Cola screen, without a highlight', () => {
		const capture = tourSteps(FISQUA, 'operator')[1];
		expect(capture.lesson).toBe('capture');
		expect(capture.id).toBe('tour_s3_fisqua');
		expect(capture.target).toBeNull();
		expect(capture.match.test('/dashboard/queue')).toBe(true);
		expect(capture.match.test('/dashboard/volumes')).toBe(false);
		expect(capture.match.test('/dashboard/projects/4/collections/9')).toBe(false);
		const k = tourKeys(capture);
		expect(text('es', k.title)).toBe(es.tour_s3_title);
		expect(text('es', k.where)).toBe('Ve a Cola.');
		expect(text('en', k.where)).toBe('Go to Queue.');
		expect(text('es', k.body)).toContain(es.nav_queue);
		expect(text('es', k.body)).toContain(es.col_live_preview);
		expect(text('en', k.body)).toContain(en.nav_queue);
		expect(text('en', k.body)).toContain(en.col_live_preview);
	});

	it('keeps the send step on the volume page, from Volúmenes', () => {
		const send = tourSteps(FISQUA, 'operator')[2];
		expect(send.lesson).toBe('send');
		expect(send.id).toBe('tour_s4');
		expect(send.target).toBe('entregar');
		expect(tourKeys(send).where).toBe('tour_s4_where_vol');
	});

	// Fisqua reviews the volume; the operator follows its status in the
	// volume's top bar (VolumeFisquaLine), and approves nothing.
	it('replaces approve with following the review, on the volume page', () => {
		const follow = tourSteps(FISQUA, 'operator')[3];
		expect(follow.lesson).toBe('follow');
		expect(follow.id).toBe('tour_s5_fisqua');
		expect(follow.match.test('/dashboard/projects/4/collections/9')).toBe(true);
		// The Fisqua line in the volume's top bar (VolumeFisquaLine); the box goes below it.
		expect(follow.target).toBe('fisqua-estado');
		expect(follow.side).toBe('bottom');
		const k = tourKeys(follow);
		expect(k.where).toBe('tour_s5_where_vol');
		expect(text('es', k.body)).toContain(es.fisqua_st_in_capture_qc);
		expect(text('en', k.body)).toContain(en.fisqua_st_in_capture_qc);
		expect(text('es', k.body)).toContain(es.nav_retakes);
		expect(text('en', k.body)).toContain(en.nav_retakes);
		expect(text('es', k.body)).not.toMatch(/aprueba/i);
	});

	it('follows the review in place of approving, and keeps export from Volúmenes', () => {
		const steps = tourSteps(FISQUA, 'operator');
		expect(steps.map((s) => s.lesson)).toEqual(['volume', 'capture', 'send', 'follow', 'export']);
		expect(ids(steps)).toEqual(['tour_s2_fisqua', 'tour_s3_fisqua', 'tour_s4', 'tour_s5_fisqua', 'tour_s6']);
		const exp = steps[4];
		expect(exp.target).toBe('exportar');
		expect(exp.where).toBe('tour_s6_where_vol');
	});

	it('gives an administrator, who can still create volumes, the Volúmenes tour', () => {
		const steps = tourSteps(FISQUA, 'admin');
		expect(ids(steps)).toEqual(ids(tourSteps(HIDDEN_OFFLINE, 'admin')));
		expect(ids(steps)).toEqual(['tour_s2_vol', 'tour_s3', 'tour_s4', 'tour_s5', 'tour_s6']);
		expect(steps[0].target).toBe('nuevo-volumen');
	});

	it('gives Cola to a reviewer too, who cannot create volumes', () => {
		expect(tourSteps(FISQUA, 'reviewer')[0].target).toBe('cola');
	});
});

describe('the catalogues', () => {
	it('have every title, body and route of every variant, in both languages', () => {
		for (const s of [SHOWN, HIDDEN_OFFLINE, FISQUA]) {
			for (const step of tourSteps(s, 'operator')) {
				const k = tourKeys(step);
				for (const key of [k.title, k.body, k.where]) {
					expect(typeof catalogs.es[key], key).toBe('string');
					expect(typeof catalogs.en[key], key).toBe('string');
					expect(text('es', key).length, key).toBeGreaterThan(0);
				}
			}
		}
	});
});

describe('the store follows the unit state', () => {
	it('counts the steps of the current variant', () => {
		unitState.set(SHOWN);
		expect(get(currentTourSteps)).toHaveLength(6);
		unitState.set(HIDDEN_OFFLINE);
		expect(get(currentTourSteps)).toHaveLength(5);
		unitState.set(null);
		expect(get(currentTourSteps)).toHaveLength(6);
	});

	it('finishes after the last step of five when a step is dropped', () => {
		unitState.set(HIDDEN_OFFLINE);
		tour.start();
		for (let i = 0; i < 4; i++) tour.next();
		expect(get(tour)).toEqual({ active: true, index: 4 });
		tour.next();
		expect(get(tour).active).toBe(false);
	});

	it('reads the role of the signed-in user', () => {
		unitState.set(FISQUA);
		authStore.setSession({ id: 1, username: 'op', email: null, role: 'operator', is_active: true });
		expect(get(currentTourSteps)[0].target).toBe('cola');
		authStore.setSession({ id: 2, username: 'admin', email: null, role: 'admin', is_active: true });
		expect(get(currentTourSteps)[0].target).toBe('nuevo-volumen');
	});

	it('keeps goTo within the steps there are', () => {
		unitState.set(FISQUA);
		tour.start();
		tour.goTo(9);
		expect(get(tour).index).toBe(4);
	});

	it('finishes after the fifth step in Fisqua mode for an operator', () => {
		unitState.set(FISQUA);
		authStore.setSession({ id: 1, username: 'op', email: null, role: 'operator', is_active: true });
		tour.start();
		for (let i = 0; i < 4; i++) tour.next();
		expect(get(tour)).toEqual({ active: true, index: 4 });
		tour.next();
		expect(get(tour).active).toBe(false);
	});
});

// The position is kept by lesson, not by number (NEH-318): the steps can
// change with the tour open, when the unit's state arrives after the tour
// started or the signed-in role changes.
describe('the position when the steps change mid-tour', () => {
	function current(): string {
		return get(currentTourSteps)[get(tour).index].id;
	}

	it('stays on the volume lesson when the hidden state arrives', () => {
		unitState.set(null);
		tour.start();
		tour.next();
		expect(current()).toBe('tour_s2');
		unitState.set(HIDDEN_OFFLINE);
		expect(get(tour).index).toBe(0);
		expect(current()).toBe('tour_s2_vol');
	});

	it('moves from the dropped project lesson to the next one there is', () => {
		unitState.set(null);
		tour.start();
		expect(current()).toBe('tour_s1');
		unitState.set(HIDDEN_OFFLINE);
		expect(get(tour)).toEqual({ active: true, index: 0 });
		expect(current()).toBe('tour_s2_vol');
	});

	it('keeps the last lesson when the list shrinks, with the stored index in range', () => {
		unitState.set(SHOWN);
		tour.start();
		tour.goTo(5);
		expect(current()).toBe('tour_s6');
		unitState.set(HIDDEN_OFFLINE);
		expect(get(tour).index).toBe(4);
		expect(current()).toBe('tour_s6');
	});

	it('goes back one lesson on Previous after a switch', () => {
		unitState.set(SHOWN);
		tour.start();
		tour.goTo(5);
		unitState.set(HIDDEN_OFFLINE);
		tour.prev();
		expect(current()).toBe('tour_s5');
	});

	it('keeps the volume lesson when the role changes in Fisqua mode', () => {
		authStore.setSession({ id: 2, username: 'admin', email: null, role: 'admin', is_active: true });
		unitState.set(FISQUA);
		tour.start();
		expect(current()).toBe('tour_s2_vol');
		tour.next();
		expect(current()).toBe('tour_s3');
		authStore.setSession({ id: 1, username: 'op', email: null, role: 'operator', is_active: true });
		expect(current()).toBe('tour_s3_fisqua');
		tour.prev();
		expect(current()).toBe('tour_s2_fisqua');
	});

	function signInAs(role: 'admin' | 'operator') {
		authStore.setSession({ id: role === 'admin' ? 2 : 1, username: role, email: null, role, is_active: true });
	}

	it('moves from approve to following the review when the operator signs in', () => {
		signInAs('admin');
		unitState.set(FISQUA);
		tour.start();
		tour.goTo(3);
		expect(current()).toBe('tour_s5');
		signInAs('operator');
		expect(get(tour).index).toBe(3);
		expect(current()).toBe('tour_s5_fisqua');
	});

	it('keeps the export step when the operator signs in', () => {
		signInAs('admin');
		unitState.set(FISQUA);
		tour.start();
		tour.goTo(4);
		expect(current()).toBe('tour_s6');
		signInAs('operator');
		expect(get(tour).index).toBe(4);
		expect(current()).toBe('tour_s6');
		tour.prev();
		expect(current()).toBe('tour_s5_fisqua');
	});

	it('moves from following the review to approve when the administrator signs in', () => {
		signInAs('operator');
		unitState.set(FISQUA);
		tour.start();
		tour.goTo(3);
		expect(current()).toBe('tour_s5_fisqua');
		signInAs('admin');
		expect(current()).toBe('tour_s5');
		tour.next();
		expect(current()).toBe('tour_s6');
	});

	it('moves from following the review to approve when the unit leaves Fisqua mode', () => {
		signInAs('operator');
		unitState.set(FISQUA);
		tour.start();
		tour.goTo(3);
		unitState.set(HIDDEN_BACKUP);
		expect(current()).toBe('tour_s5');
	});

	it('keeps the capture lesson across a switch into Fisqua mode', () => {
		signInAs('operator');
		unitState.set(HIDDEN_OFFLINE);
		tour.start();
		tour.goTo(1);
		expect(current()).toBe('tour_s3');
		unitState.set(FISQUA);
		expect(current()).toBe('tour_s3_fisqua');
	});
});

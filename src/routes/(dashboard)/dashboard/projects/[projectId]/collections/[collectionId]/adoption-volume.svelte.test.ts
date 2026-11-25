// NEH-419 and NEH-420 on a volume's page: the administrator's action on a
// hand-made volume with its explanation under the bar; a volume whose
// captures were moved into another says so and offers no capture; a volume
// an unsettled move names shows the notice to an administrator and one line
// to an operator, who never asks GET /system/adoption.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';

const nav = vi.hoisted(() => ({ data: {} as { [k: string]: unknown } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			params: { projectId: '1', collectionId: '7' },
			url: new URL('http://localhost/dashboard/projects/1/collections/7'),
			get data() {
				return nav.data;
			}
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import Layout from './+layout@.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>volume</p>' }));

const OFFSITE = {
	collection_id: 7,
	filename_stem: 'src',
	uploadable: true,
	total: 4,
	verified: 4,
	pending: 0,
	refused: 0,
	last_verified_at: null,
	received: true,
	refusals: [],
	freed_files: 0,
	freed_bytes: 0,
	kept_on_unit: false
};

const REPORT = {
	unfinished: {
		source: { id: 7, name: 'Ensayo', filename_stem: 'src' },
		target: { id: 8, name: 'Volumen 007', filename_stem: 'tgt' },
		state: 'blocked',
		reason: 'files_at_neither',
		missing: [],
		repair_available: false,
		repair_refusal: 'no_read_remote'
	}
};

let asked: string[] = [];
let reportAnswer: unknown = REPORT;

function stubFetch() {
	asked = [];
	reportAnswer = REPORT;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost');
		asked.push(url.pathname);
		const json = (body: unknown) =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		if (url.pathname.endsWith('/collections/7/offsite')) return json(OFFSITE);
		if (url.pathname.endsWith('/records/count')) return json({ count: 3 });
		if (url.pathname.endsWith('/system/adoption')) return json(reportAnswer);
		if (url.pathname.endsWith('/system/unit')) return json({ mode: 'fisqua' });
		return json({});
	});
}

const signIn = (role: UserRole) =>
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
const camera = () =>
	[...document.querySelectorAll('button')].find((b) =>
		b.textContent?.includes(es.col_live_preview)
	);
const bodyText = () => document.body.textContent ?? '';

beforeEach(() => {
	locale.set('es');
	resetUnit();
	nav.data = {
		projectName: 'Proyecto',
		collectionName: 'Ensayo',
		collectionAdoption: {
			external_id: null,
			captures_adopted_at: null,
			adoption_unfinished: false,
			testing: false
		}
	};
	stubFetch();
});
afterEach(() => {
	// A move left unresolved keeps its id in the session (VolumeAdoptActions).
	sessionStorage.clear();
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('volume page and the move of captures', () => {
	it('an administrator on a hand-made volume with records gets the action and its explanation', async () => {
		signIn('admin');
		render(Layout, { children });
		await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
		expect(bodyText()).toContain(es.adopt_action_desc);
	});

	it('an operator gets neither', async () => {
		signIn('operator');
		render(Layout, { children });
		await expect.poll(camera).toBeTruthy();
		await expect.poll(() => asked.some((p) => p.endsWith('/collections/7/offsite'))).toBe(true);
		expect(document.querySelector('button.adopt-btn')).toBeNull();
		expect(bodyText()).not.toContain(es.adopt_action_desc);
	});

	for (const role of ['admin', 'operator'] as const) {
		it(`a volume whose captures were moved says so and offers no capture (${role})`, async () => {
			signIn(role);
			nav.data = {
				...nav.data,
				collectionAdoption: {
					external_id: null,
					captures_adopted_at: '2026-11-24T10:00:00',
					adoption_unfinished: false,
					testing: false
				}
			};
			render(Layout, { children });
			await expect.poll(bodyText).toContain(es.adopt_closed_refusal);
			expect(camera()).toBeUndefined();
			expect(document.querySelector('button.adopt-btn')).toBeNull();
		});
	}

	it('an administrator on a volume an unsettled move names sees the notice', async () => {
		signIn('admin');
		nav.data = {
			...nav.data,
			collectionAdoption: {
				external_id: 'co-1',
				captures_adopted_at: null,
				adoption_unfinished: true,
				testing: false
			}
		};
		render(Layout, { children });
		await expect.poll(bodyText).toContain(es.unsettled_heading);
		expect(bodyText()).toContain(es.unsettled_no_repair);
	});

	it('an operator on that volume reads one line and asks nothing of the route', async () => {
		signIn('operator');
		nav.data = {
			...nav.data,
			collectionAdoption: {
				external_id: 'co-1',
				captures_adopted_at: null,
				adoption_unfinished: true,
				testing: false
			}
		};
		render(Layout, { children });
		await expect.poll(bodyText).toContain(es.unsettled_operator);
		expect(bodyText()).not.toContain(es.unsettled_heading);
		expect(asked.some((p) => p.endsWith('/system/adoption'))).toBe(false);
	});

	it('an administrator on a volume a running move names sees the working row, with no unfinished move', async () => {
		signIn('admin');
		nav.data = {
			...nav.data,
			collectionAdoption: {
				external_id: 'co-1',
				captures_adopted_at: null,
				adoption_unfinished: false,
				testing: false
			}
		};
		reportAnswer = {
			unfinished: null,
			running: {
				request_id: 'abc',
				kind: 'adoption',
				started_at: '2026-11-24T10:00:00',
				source: { id: 7, name: 'Ensayo', filename_stem: 'src' },
				target: { id: 8, name: 'Volumen 007', filename_stem: 'tgt' }
			}
		};
		render(Layout, { children });
		await expect.poll(bodyText).toContain(`${es.adopt_action} ${es.common_loading_ellipsis}`);
		expect(bodyText()).not.toContain(es.unsettled_heading);
	});

	// A move whose answer was lost leaves its id in the session; another
	// administrator may then delete the emptied source, so the volume's own
	// reads answer 404 while the unit still knows the request (applied).
	const ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
	const STORED = 'captua-adoption-request:7';
	const keepId = () =>
		sessionStorage.setItem(
			STORED,
			JSON.stringify({ requestId: ID, targetId: 20, targetName: 'Volumen 007' })
		);
	const APPLIED = {
		source_id: 7,
		target_id: 20,
		started_at: '2026-11-24T10:00:00',
		ended_at: '2026-11-24T10:01:00',
		state: 'applied',
		result: {
			source_id: 7,
			target_id: 20,
			records: 7,
			images: 14,
			files_renamed: 40,
			colour_card_sets: 2,
			colour_card_shots: 4,
			target_lines_pending: false,
			recovery_pending: false
		}
	};
	const goneVolume = () => {
		nav.data = {
			projectName: 'Proyecto',
			collectionName: '—',
			collectionAdoption: {
				external_id: null,
				captures_adopted_at: null,
				adoption_unfinished: false,
				testing: false
			}
		};
		reportAnswer = { unfinished: null, running: null };
	};
	// The offsite line's read: 404, or no answer at all.
	function offsiteAnswers(answer: 404 | 'never') {
		const others = vi.mocked(globalThis.fetch).getMockImplementation()!;
		vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
			const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost');
			if (url.pathname.endsWith('/collections/7/offsite')) {
				asked.push(url.pathname);
				if (answer === 'never') return new Promise<Response>(() => {});
				return new Response(JSON.stringify({ detail: 'Collection 7 not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			if (url.pathname.endsWith(`/system/adoption/requests/${ID}`)) {
				asked.push(url.pathname);
				return new Response(JSON.stringify(APPLIED), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			return others(input, init);
		});
	}

	for (const answer of [404, 'never'] as const) {
		it(`a stored id is looked up and settled when the offsite read answers ${answer}`, async () => {
			signIn('admin');
			goneVolume();
			keepId();
			offsiteAnswers(answer);
			render(Layout, { children });
			await expect
				.poll(() => asked.some((p) => p.endsWith(`/system/adoption/requests/${ID}`)))
				.toBe(true);
			await expect.poll(bodyText).toContain(es.adopt_closed_line('Volumen 007'));
			expect(sessionStorage.getItem(STORED)).toBeNull();
			expect(document.querySelector('button.adopt-btn')).toBeNull();
			expect(asked.some((p) => p.endsWith('/records/count'))).toBe(false);
		});
	}

	it('with no stored id and no offsite answer nothing is offered and nothing is asked', async () => {
		signIn('admin');
		goneVolume();
		offsiteAnswers('never');
		render(Layout, { children });
		await expect.poll(() => asked.some((p) => p.endsWith('/collections/7/offsite'))).toBe(true);
		await expect.poll(() => asked.some((p) => p.endsWith('/system/adoption'))).toBe(true);
		expect(document.querySelector('button.adopt-btn')).toBeNull();
		expect(bodyText()).not.toContain(es.adopt_action_desc);
		expect(asked.some((p) => p.endsWith('/records/count'))).toBe(false);
		expect(asked.some((p) => p.includes('/system/adoption/requests/'))).toBe(false);
	});
});

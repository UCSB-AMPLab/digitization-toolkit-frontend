// NEH-419 and NEH-420 across a navigation between two volumes: the notice
// is read again for the volume now shown, and the answer of a move started
// on volume A that arrives once the page shows volume B changes nothing on B.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';

const nav = vi.hoisted(() => ({
	set: null as unknown as (v: { collectionId: string; data: Record<string, unknown> }) => void
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { writable, derived } = await import('svelte/store');
	const state = writable({ collectionId: '7', data: {} as Record<string, unknown> });
	nav.set = (v) => state.set(v);
	return {
		page: derived(state, (s) => ({
			params: { projectId: '1', collectionId: s.collectionId },
			url: new URL(`http://localhost/dashboard/projects/1/collections/${s.collectionId}`),
			data: s.data
		}))
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { systemApi } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import Layout from './+layout@.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>volume</p>' }));

const offsite = (id: number) => ({
	collection_id: id,
	filename_stem: `v${id}`,
	uploadable: true,
	total: 0,
	verified: 0,
	pending: 0,
	refused: 0,
	last_verified_at: null,
	received: false,
	refusals: [],
	freed_files: 0,
	freed_bytes: 0,
	kept_on_unit: false
});

const fields = (over: Record<string, unknown> = {}) => ({
	external_id: null,
	captures_adopted_at: null,
	adoption_unfinished: false,
	testing: false,
	...over
});

let asked: string[] = [];
let postAnswer: Promise<Response>;
let releasePost: (r: Response) => void;

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch() {
	asked = [];
	postAnswer = new Promise((r) => (releasePost = r));
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost');
		const method = (init?.method ?? 'GET').toUpperCase();
		asked.push(`${method} ${url.pathname}`);
		const m = url.pathname.match(/\/collections\/(\d+)\/offsite$/);
		if (m) return json(offsite(Number(m[1])));
		if (url.pathname.endsWith('/records/count')) return json({ count: 3 });
		if (url.pathname.endsWith('/system/adoption'))
			return json({
				unfinished: {
					source: { id: 7, name: 'A', filename_stem: 'a' },
					target: { id: 9, name: 'B', filename_stem: 'b' },
					state: 'blocked',
					reason: 'x',
					missing: [],
					repair_available: false,
					repair_refusal: 'no_read_remote'
				}
			});
		if (url.pathname.endsWith('/adopt-into/20') && method === 'POST') return postAnswer;
		if (url.pathname.endsWith('/adopt-into/20'))
			return json({
				source_id: 7,
				target_id: 20,
				may_adopt: true,
				refusals: [],
				details: {},
				project_changes: false,
				records: 3,
				images_current: 6,
				images_superseded: 0,
				renames_count: 6,
				renames_truncated: false,
				renames: [],
				colour_card_set_ids: [],
				shot_renames: []
			});
		if (url.pathname.endsWith('/collections/'))
			return json([
				{
					id: 20,
					name: 'Destino',
					created_at: '2026-11-01T00:00:00',
					external_id: 'co-20',
					queue_hidden_at: null,
					kept_on_unit: false,
					record_count: 0
				}
			]);
		if (url.pathname.endsWith('/system/unit')) return json({ mode: 'fisqua' });
		return json({});
	});
}

const signIn = () =>
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
const bodyText = () => document.body.textContent ?? '';
const camera = () =>
	[...document.querySelectorAll('button')].find((b) =>
		b.textContent?.includes(es.col_live_preview)
	);
const buttonNamed = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('button')].find(
		(b) => b.textContent?.trim() === name
	);

beforeEach(() => {
	locale.set('es');
	resetUnit();
	signIn();
	stubFetch();
});
afterEach(() => {
	// A move left unresolved keeps its id in the session (VolumeAdoptActions).
	sessionStorage.clear();
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('moving between volumes', () => {
	it('reads the notice again for the volume shown after a navigation', async () => {
		nav.set({
			collectionId: '7',
			data: { collectionName: 'A', collectionAdoption: fields({ adoption_unfinished: true }) }
		});
		render(Layout, { children });
		await expect.poll(bodyText).toContain(es.unsettled_heading);
		const reads = () => asked.filter((a) => a === 'GET /system/adoption').length;
		expect(reads()).toBe(1);
		nav.set({
			collectionId: '9',
			data: { collectionName: 'B', collectionAdoption: fields({ adoption_unfinished: true }) }
		});
		await expect.poll(reads).toBe(2);
	});

	it('an answer of a move started on A that arrives on B changes nothing on B', async () => {
		nav.set({ collectionId: '7', data: { collectionName: 'A', collectionAdoption: fields() } });
		render(Layout, { children });
		await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
		document.querySelector<HTMLButtonElement>('button.adopt-btn')!.click();
		await expect.poll(() => document.querySelector('input[type="radio"]')).not.toBeNull();
		document.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
		await expect.poll(() => buttonNamed(es.focus_continue)?.disabled).toBe(false);
		buttonNamed(es.focus_continue)!.click();
		await expect.poll(() => buttonNamed(es.adopt_plan_confirm)?.disabled).toBe(false);
		buttonNamed(es.adopt_plan_confirm)!.click();
		await expect
			.poll(() =>
				asked.some((a) => a.startsWith('POST') && a.endsWith('/collections/7/adopt-into/20'))
			)
			.toBe(true);
		nav.set({ collectionId: '9', data: { collectionName: 'B', collectionAdoption: fields() } });
		await expect.poll(() => asked.some((a) => a.endsWith('/collections/9/offsite'))).toBe(true);
		releasePost(
			json({
				source_id: 7,
				target_id: 20,
				records: 3,
				images: 6,
				files_renamed: 12,
				colour_card_sets: 0,
				colour_card_shots: 0,
				target_lines_pending: false,
				recovery_pending: false
			})
		);
		await postAnswer;
		// A later round trip on B: by its end the answer for A has been handled.
		await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
		document.querySelector<HTMLButtonElement>('button.adopt-btn')!.click();
		await expect.poll(() => document.querySelector('input[type="radio"]')).not.toBeNull();
		expect(camera()).toBeTruthy();
		expect(bodyText()).not.toContain(es.adopt_closed_line('Destino'));
		expect(bodyText()).not.toContain(es.adopt_closed_refusal);
		expect(bodyText()).not.toContain(es.adopt_done_heading);
	});

	for (const outcome of ['restored: false', 'interrupted lookup'] as const) {
		it(`an initially idle notice shows Repair after the local move ends with ${outcome} and Close`, async () => {
			const report = vi
				.spyOn(systemApi, 'getUnfinishedAdoption')
				.mockResolvedValue({ unfinished: null, running: null });
			vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue({
				state: 'interrupted',
				source_id: 7,
				target_id: 20
			});
			nav.set({ collectionId: '7', data: { collectionName: 'A', collectionAdoption: fields() } });
			render(Layout, { children });
			await expect.poll(() => report.mock.settledResults.length).toBe(1);
			expect(document.querySelector('[data-adoption-notice]')).toBeNull();
			await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
			document.querySelector<HTMLButtonElement>('button.adopt-btn')!.click();
			await expect.poll(() => document.querySelector('input[type="radio"]')).not.toBeNull();
			document.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
			await expect.poll(() => buttonNamed(es.focus_continue)?.disabled).toBe(false);
			buttonNamed(es.focus_continue)!.click();
			await expect.poll(() => buttonNamed(es.adopt_plan_confirm)?.disabled).toBe(false);
			buttonNamed(es.adopt_plan_confirm)!.click();
			await expect
				.poll(() =>
					asked.some((a) => a.startsWith('POST ') && a.endsWith('/collections/7/adopt-into/20'))
				)
				.toBe(true);
			// The local move has begun, but no journal or lock was visible in that read.
			await expect.poll(() => report.mock.settledResults.length).toBe(2);
			report.mockResolvedValue({
				unfinished: {
					run_id: 'local-interruption',
					source: { id: 7, name: 'A', filename_stem: 'a' },
					target: { id: 20, name: 'Destino', filename_stem: 't' },
					state: 'blocked',
					reason: 'files_at_neither',
					missing: [],
					repair_available: true,
					repair_refusal: null
				},
				running: null
			});
			releasePost(
				outcome === 'restored: false'
					? json({ detail: { restored: false } }, 500)
					: json({ detail: 'Lost answer' }, 502)
			);
			await expect
				.poll(() => document.querySelector('[role="dialog"]')?.textContent)
				.toContain(es.adopt_failed_pending);
			await expect.poll(() => buttonNamed(es.common_close)).toBeTruthy();
			buttonNamed(es.common_close)!.click();
			await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
			await expect.poll(() => buttonNamed(es.unsettled_repair)).toBeTruthy();
			expect(bodyText()).toContain(es.unsettled_heading);
			expect(report.mock.calls.length).toBeGreaterThan(2);
		});
	}
});

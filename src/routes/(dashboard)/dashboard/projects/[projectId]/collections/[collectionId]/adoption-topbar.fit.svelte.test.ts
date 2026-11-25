// NEH-419: the volume page's real top bar and the strip under it, at the
// unit's 800x480 screen and at 1280x800, in both languages, for an
// administrator on a hand-made volume with records: the bar holds every
// control that can be there at once (the colour card flag, Keep or the
// space-on-the-card button, the send-for-review control, Capture, the user
// menu), and the move's explanation and button sit in the strip. No control
// overlaps another, none is clipped, and nothing leaves the screen's width.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

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

import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../../../../../../app.css';
import VolumePageHost from '$lib/test-support/VolumePageHost.svelte';

const records = [1, 2, 3].map((id) => ({
	id,
	title: `Folio ${id}`,
	status: 'captured',
	sequence: id,
	collection_id: 7,
	images: [{ id: id * 10, record_id: id, filename: `p${id}.jpg`, format: 'jpg', is_current: true }]
}));

function offsite(received: boolean) {
	return {
		collection_id: 7,
		filename_stem: 'volumen-prueba-12',
		uploadable: true,
		total: 6,
		verified: received ? 6 : 0,
		pending: received ? 0 : 6,
		refused: 0,
		last_verified_at: null,
		received,
		refusals: [],
		freed_files: 0,
		freed_bytes: 0,
		kept_on_unit: false
	};
}

function stubFetch(received: boolean) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost');
		const json = (body: unknown) =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		const p = url.pathname;
		if (p.endsWith('/collections/7/offsite')) return json(offsite(received));
		if (p.endsWith('/records/count')) return json({ count: 3 });
		if (p.endsWith('/records/')) return json(records);
		if (p.includes('/annotations')) return json([]);
		if (p.includes('/records/images/'))
			return new Response(new Blob(['jpeg']), {
				status: 200,
				headers: { 'Content-Type': 'image/jpeg' }
			});
		if (p.endsWith('/system/unit')) return json({ mode: 'fisqua' });
		return json({});
	});
}

const box = (el: Element) => el.getBoundingClientRect();
const visible = (el: Element) => {
	const r = box(el);
	return r.width > 0 && r.height > 0;
};
const overlap = (a: DOMRect, b: DOMRect) =>
	Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
	Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

function controlsOf(root: Element): HTMLElement[] {
	const all = [
		...root.querySelectorAll<HTMLElement>('button, a[href], .bc-item, .offsite-indicator')
	].filter(visible);
	// The outermost of nested controls only.
	return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

beforeEach(() => {
	resetUnit();
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
	nav.data = {
		projectName: 'Proyecto',
		collectionName: 'Volumen de prueba',
		collectionColourCard: { enabled: true, status: 'present', sets: 1 },
		collectionAdoption: {
			external_id: null,
			captures_adopted_at: null,
			adoption_unfinished: false,
			testing: false
		}
	};
});
afterEach(() => {
	// A move left unresolved keeps its id in the session (VolumeAdoptActions).
	sessionStorage.clear();
	vi.restoreAllMocks();
	authStore.clearSession();
});

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		for (const received of [false, true]) {
			it(`at ${w}x${h}, ${lang}, ${received ? 'received offsite' : 'not yet copied'}: the bar and the strip fit`, async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
				stubFetch(received);
				render(VolumePageHost);
				const bar = () => document.querySelector<HTMLElement>('.topbar');
				// Everything that can be in the bar has arrived.
				await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
				await expect
					.poll(() =>
						[...bar()!.querySelectorAll('button')].some((b) =>
							b.textContent?.includes(msgs.col_live_preview)
						)
					)
					.toBe(true);
				if (!received)
					await expect
						.poll(() =>
							[...bar()!.querySelectorAll('button')].some(
								(b) => b.textContent?.trim() === msgs.kept_keep_action
							)
						)
						.toBe(true);
				else await expect.poll(() => bar()!.querySelector('.offsite-manage-btn')).not.toBeNull();
				await expect.poll(() => bar()!.querySelector('.handover-btn')).not.toBeNull();

				const b = bar()!;
				expect(b.scrollWidth).toBeLessThanOrEqual(b.clientWidth + 1);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
				// The move's button is not in the bar.
				expect(b.querySelector('button.adopt-btn')).toBeNull();

				const controls = controlsOf(b);
				const barBox = box(b);
				for (const c of controls) {
					const r = box(c);
					expect(r.left, c.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(barBox.left - 0.5);
					expect(r.right, c.outerHTML.slice(0, 80)).toBeLessThanOrEqual(barBox.right + 0.5);
					if (c.tagName === 'BUTTON')
						expect(c.scrollWidth, c.outerHTML.slice(0, 80)).toBeLessThanOrEqual(c.clientWidth + 1);
				}
				for (let i = 0; i < controls.length; i++)
					for (let j = i + 1; j < controls.length; j++)
						expect(
							overlap(box(controls[i]), box(controls[j])),
							`${controls[i].outerHTML.slice(0, 60)} / ${controls[j].outerHTML.slice(0, 60)}`
						).toBe(false);

				const strip = document.querySelector<HTMLElement>('.volume-notices')!;
				const button = strip.querySelector<HTMLButtonElement>('button.adopt-btn')!;
				const desc = strip.querySelector<HTMLElement>('.adopt-row-desc')!;
				expect(desc.textContent).toBe(msgs.adopt_action_desc);
				expect(box(strip).right).toBeLessThanOrEqual(w + 0.5);
				expect(box(button).right).toBeLessThanOrEqual(box(strip).right + 0.5);
				expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
				expect(box(button).height).toBeGreaterThanOrEqual(44);
				expect(overlap(box(button), box(desc))).toBe(false);
				expect(strip.scrollHeight).toBeLessThanOrEqual(strip.clientHeight + 1);
			});
		}
	}
}

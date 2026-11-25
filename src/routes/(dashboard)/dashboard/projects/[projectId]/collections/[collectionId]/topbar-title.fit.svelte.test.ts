// NEH-421: in the volume page's top bar the title column is the only part
// that gives way. At 800x480 and 1280x800, in both languages, with every
// control that can be in the bar at once (the colour card button, Keep or
// the space-on-the-card button, the send-for-review control, Capture, the
// user menu) and titles of 1, 9, 18, 36 and 70 characters: no control
// overlaps another or is clipped, each is at least 44 px tall, nothing
// wraps to a second line, the title keeps at least its minimum width when
// it is shortened, and the full title stays in the element (its text, its
// `title`) and the element can take keyboard focus.
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
const overlap = (a: DOMRect, b: DOMRect) =>
	Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
	Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

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

// Neutral titles of a given length.
function titleOf(n: number): string {
	const t = 'Volumen de prueba '.repeat(5).slice(0, n);
	return t.endsWith(' ') ? t.slice(0, -1) + 'x' : t;
}

// The shortest the volume title gets (`.bc-collection` in +layout@.svelte).
const TITLE_MIN_PX = 48;

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		for (const received of [false, true]) {
			for (const n of [1, 9, 18, 36, 70]) {
				it(`at ${w}x${h}, ${lang}, ${received ? 'received offsite' : 'not yet copied'}, a title of ${n}`, async () => {
					await browserPage.viewport(w, h);
					locale.set(lang as Locale);
					nav.data = { ...nav.data, collectionName: titleOf(n) };
					stubFetch(received);
					render(VolumePageHost);
					const bar = () => document.querySelector<HTMLElement>('.topbar')!;
					await expect.poll(() => document.querySelector('.topbar .handover-btn')).not.toBeNull();
					await expect
						.poll(() =>
							[...bar().querySelectorAll('button')].some((b) =>
								b.textContent?.includes(msgs.col_live_preview)
							)
						)
						.toBe(true);
					await expect
						.poll(() => bar().querySelector(received ? '.offsite-manage-btn' : '.kept-btn'))
						.not.toBeNull();
					await expect.poll(() => bar().querySelector('.vcc-open')).not.toBeNull();

					const b = bar();
					const barBox = box(b);
					expect(b.scrollWidth).toBeLessThanOrEqual(b.clientWidth + 1);
					expect(b.scrollHeight).toBeLessThanOrEqual(b.clientHeight + 1);
					expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);

					const fixed = [
						'.vcc-open',
						received ? '.offsite-manage-btn' : '.kept-btn',
						'.handover-btn',
						'.btn-camera',
						'.user-avatar'
					].map((sel) => b.querySelector<HTMLElement>(sel)!);
					const widths = fixed.map(
						(c) => `${c.className.split(' ')[0]}=${box(c).width.toFixed(1)}`
					);
					for (const c of fixed) {
						const r = box(c);
						const what = `${c.className} ${widths.join(' ')}`;
						expect(r.height, what).toBeGreaterThanOrEqual(44);
						expect(r.left, what).toBeGreaterThanOrEqual(barBox.left - 0.5);
						expect(r.right, what).toBeLessThanOrEqual(barBox.right + 0.5);
						expect(c.scrollWidth, what).toBeLessThanOrEqual(c.clientWidth + 1);
					}

					const title = b.querySelector<HTMLElement>('.bc-collection')!;
					const sep = b.querySelector<HTMLElement>('.bc-sep')!;
					const parts = [
						...fixed,
						b.querySelector<HTMLElement>('.btn-back')!,
						b.querySelector<HTMLElement>('.bc-project')!,
						sep,
						title
					];
					for (let i = 0; i < parts.length; i++)
						for (let j = i + 1; j < parts.length; j++)
							expect(
								overlap(box(parts[i]), box(parts[j])),
								`${parts[i].className} / ${parts[j].className} ${widths.join(' ')}`
							).toBe(false);

					// One line: the title is as tall as the separator beside it.
					expect(box(title).height).toBeLessThanOrEqual(box(sep).height + 1);
					// The full title, for pointer, keyboard and assistive technology.
					expect(title.textContent).toBe(titleOf(n));
					expect(title.getAttribute('title')).toBe(titleOf(n));
					expect(title.tabIndex).toBe(0);
					// Shortened, it still shows a few characters and the ellipsis.
					if (title.scrollWidth > title.clientWidth + 1) {
						expect(getComputedStyle(title).textOverflow).toBe('ellipsis');
						expect(box(title).width).toBeGreaterThanOrEqual(TITLE_MIN_PX - 0.5);
					}
				});
			}
		}
	}
}

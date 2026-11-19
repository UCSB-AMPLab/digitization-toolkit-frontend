// The camera-and-page label under each picture of the spread view. It names
// the camera and the page in words where the picture is wide enough for them
// on one line, and in the badge form (camera symbol, camera letter, page
// term) where it is not; the words stay its accessible name and title. Role
// `left` is the even/verso page, photographed by the right camera; role
// `right` the odd/recto page, by the left camera.
//
// The viewer is rendered in the width the review page leaves it: at the
// unit's 800x480 screen, 400px with the left panel open (800 less the 320px
// panel and the 80px toolbar) and 660px with it closed; on a 1920px screen,
// 1520px.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord, type RecordImage } from '$lib/api';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../../../../../../app.css';
import ImageViewer from './ImageViewer.svelte';

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const text = (el: HTMLElement) => el.innerText.replace(/\s+/g, ' ').trim();

const image = (id: number, role: 'left' | 'right'): RecordImage =>
	({ id, record_id: 1, filename: `co-ahr-6-000${id}.jpg`, file_path: '/x', format: 'jpeg', is_current: true, role }) as RecordImage;
const record = { id: 1, title: 'Folio 1', status: 'in_review', capture_mode: 'dual', images: [image(1, 'left'), image(2, 'right')] } as ApiRecord;

async function open(viewport: [number, number], width: number) {
	await browserPage.viewport(...viewport);
	const c = document.createElement('canvas');
	c.width = 1200;
	c.height = 1800;
	vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(c.toDataURL('image/png'));
	const host = document.createElement('div');
	host.style.cssText = `width: ${width}px; height: ${viewport[1] - 120}px; display: flex; flex-direction: column;`;
	document.body.appendChild(host);
	render(ImageViewer, {
		target: host,
		props: { viewMode: 'spread', records: [record], selectedRecordId: 1, zoom: 1, rotation: 0, onPrev: vi.fn(), onNext: vi.fn() }
	});
	await settle();
	const pages = [...host.querySelectorAll<HTMLElement>('.spread-page')];
	return {
		host,
		sides: (['left', 'right'] as const).map((role, i) => ({ role, page: pages[i], label: pages[i].querySelector('.spread-side') as HTMLElement }))
	};
}

// One line, inside its page's column, clear of the other page's caption.
function fits(sides: Awaited<ReturnType<typeof open>>['sides']) {
	const captions = sides.map((s) => s.page.querySelector('.spread-label') as HTMLElement);
	sides.forEach(({ role, page, label }, i) => {
		const l = label.getBoundingClientRect();
		const p = page.getBoundingClientRect();
		console.log(`[spread labels] ${role}: page ${p.width.toFixed(0)}px, label ${l.width.toFixed(0)}x${l.height.toFixed(0)}px`);
		expect(l.height, `${role} height`).toBeLessThan(20);
		expect(l.left, `${role} left`).toBeGreaterThanOrEqual(p.left);
		expect(l.right, `${role} right`).toBeLessThanOrEqual(p.right);
		expect(hit(l, captions[1 - i].getBoundingClientRect()), `${role} over the other caption`).toBe(false);
	});
}

let host: HTMLElement | undefined;
afterEach(() => {
	vi.restoreAllMocks();
	host?.remove();
	locale.set('en');
});

for (const [lang, t] of [
	['en', en],
	['es', es]
] as const) {
	describe(`spread labels, ${lang}`, () => {
		for (const width of [400, 660]) {
			it(`at 800x480 in ${width}px: the badge form, one line, inside its page`, async () => {
				locale.set(lang as Locale);
				const opened = await open([800, 480], width);
				host = opened.host;
				fits(opened.sides);
				for (const { role, label } of opened.sides) {
					const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
					const letter = role === 'left' ? t.badge_cam_right : t.badge_cam_left;
					const term = role === 'left' ? t.page_term_even : t.page_term_odd;
					expect(text(label)).toContain(`${letter} · ${term}`);
					expect(text(label)).not.toContain(words);
					expect(label.querySelector('.material-symbols-outlined')?.getAttribute('aria-hidden')).toBe('true');
					expect(label.getAttribute('role')).toBe('img');
					expect(label.getAttribute('aria-label')).toBe(words);
					expect(label.getAttribute('title')).toBe(words);
				}
			});
		}

		it('at 1920x1080: the words', async () => {
			locale.set(lang as Locale);
			const opened = await open([1920, 1080], 1520);
			host = opened.host;
			fits(opened.sides);
			for (const { role, label } of opened.sides) {
				const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
				expect(text(label)).toBe(words);
				expect(label.getAttribute('title')).toBe(words);
			}
		});
	});
}

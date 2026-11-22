// NEH-379: every thumbnail of a two-camera capture names the camera and the
// page. Role `right` is the odd/recto page, photographed by the left camera;
// role `left` is the even/verso page, photographed by the right camera. The
// badge carries a camera symbol and the camera letter, the page term sits
// on the picture, and the full label is the badge's title and part of the
// picture's alt. The letter is printed from the stored role, so the
// position class follows the role, not the letter.
//
// Version: 0.3.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import type { Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import ThumbnailStrip from './ThumbnailStrip.svelte';
import GridView from './GridView.svelte';
import ListView from './ListView.svelte';
import LeftSidebar from './LeftSidebar.svelte';

function pairRecord(): ApiRecord {
	return {
		id: 2,
		title: 'Folio 12',
		status: 'in_review',
		capture_mode: 'dual',
		images: [
			{
				id: 21,
				record_id: 2,
				filename: 'right.jpg',
				file_path: '/r',
				format: 'jpg',
				role: 'right',
				is_current: true
			},
			{
				id: 20,
				record_id: 2,
				filename: 'left.jpg',
				file_path: '/l',
				format: 'jpg',
				role: 'left',
				is_current: true
			}
		]
	} as ApiRecord;
}

function singleRecord(): ApiRecord {
	return {
		id: 3,
		title: 'Folio 13',
		status: 'in_review',
		capture_mode: 'single',
		images: [
			{
				id: 30,
				record_id: 3,
				filename: 'one.jpg',
				file_path: '/o',
				format: 'jpg',
				role: 'single',
				is_current: true
			}
		]
	} as ApiRecord;
}

type Catalogue = typeof en;
const langs: [string, Catalogue][] = [
	['en', en],
	['es', es as unknown as Catalogue]
];

// The badges in DOM order (the even/verso picture first, on the left).
function badges(root: HTMLElement, selector: string) {
	return [...root.querySelectorAll<HTMLElement>(selector)].map((b) => ({
		letter: b.querySelector('.badge-letter')?.textContent?.trim() ?? null,
		icon: b.querySelector('.material-symbols-outlined')?.textContent?.trim() ?? null,
		iconHidden: b.querySelector('.material-symbols-outlined')?.getAttribute('aria-hidden') ?? null,
		title: b.getAttribute('title'),
		right: b.classList.contains('right')
	}));
}

function expectPair(found: ReturnType<typeof badges>, msgs: Catalogue) {
	expect(found).toEqual([
		{
			letter: msgs.badge_cam_right,
			icon: 'photo_camera',
			iconHidden: 'true',
			title: msgs.cam_page_even,
			right: false
		},
		{
			letter: msgs.badge_cam_left,
			icon: 'photo_camera',
			iconHidden: 'true',
			title: msgs.cam_page_odd,
			right: true
		}
	]);
}

const terms = (root: HTMLElement) =>
	[...root.querySelectorAll('.page-term')].map((t) => t.textContent?.trim());

afterEach(() => locale.set('es'));

for (const [lang, msgs] of langs) {
	describe(`role badges (${lang})`, () => {
		it('gallery strip: camera letter and symbol from the role, the page term, both facts as the title', async () => {
			locale.set(lang as 'en' | 'es');
			const screen = render(ThumbnailStrip, {
				records: [pairRecord()],
				selectedRecordId: null,
				viewMode: 'spread',
				onSelect: vi.fn()
			});
			expectPair(badges(screen.container as HTMLElement, '.role-badge'), msgs);
			expect(terms(screen.container as HTMLElement)).toEqual([
				msgs.page_term_even,
				msgs.page_term_odd
			]);
			const alts = [...screen.container.querySelectorAll('img')].map((i) => i.getAttribute('alt'));
			expect(alts).toEqual([`Folio 12 · ${msgs.cam_page_even}`, `Folio 12 · ${msgs.cam_page_odd}`]);
		});

		it('grid tile: the same, and the alt names the record, the camera and the page', async () => {
			locale.set(lang as 'en' | 'es');
			const screen = render(GridView, {
				records: [pairRecord()],
				collectionId: 1,
				onRecordsUpdate: vi.fn(),
				onRecordClick: vi.fn()
			});
			expectPair(badges(screen.container as HTMLElement, '.role-badge'), msgs);
			expect(terms(screen.container as HTMLElement)).toEqual([
				msgs.page_term_even,
				msgs.page_term_odd
			]);
			const alts = [...screen.container.querySelectorAll('img.card-image')].map((i) =>
				i.getAttribute('alt')
			);
			expect(alts).toEqual([`Folio 12 · ${msgs.cam_page_even}`, `Folio 12 · ${msgs.cam_page_odd}`]);
		});

		it('list view: the same', async () => {
			locale.set(lang as 'en' | 'es');
			const screen = render(ListView, {
				records: [pairRecord()],
				collectionId: 1,
				onRecordClick: vi.fn()
			});
			expectPair(badges(screen.container as HTMLElement, '.role-badge'), msgs);
			expect(terms(screen.container as HTMLElement)).toEqual([
				msgs.page_term_even,
				msgs.page_term_odd
			]);
			const alts = [...screen.container.querySelectorAll('img.row-thumb')].map((i) =>
				i.getAttribute('alt')
			);
			expect(alts).toEqual([`Folio 12 · ${msgs.cam_page_even}`, `Folio 12 · ${msgs.cam_page_odd}`]);
		});

		it('side panel: the pill prints the camera letter with the symbol, and the title names the page', async () => {
			locale.set(lang as 'en' | 'es');
			const screen = render(LeftSidebar, {
				viewMode: 'spread',
				currentIndex: 1,
				totalRecords: 1,
				onRotateLeft: vi.fn(),
				onRotateRight: vi.fn(),
				onRecordUpdated: vi.fn(),
				onRecapture: vi.fn(),
				currentRecord: pairRecord(),
				userRole: 'reviewer'
			});
			await screen.getByRole('button', { name: msgs.col_tab_info }).click();
			const pills = [...screen.container.querySelectorAll<HTMLElement>('.role-pill')].map((p) => ({
				letter: p.querySelector('.badge-letter')?.textContent?.trim(),
				icon: p.querySelector('.material-symbols-outlined')?.textContent?.trim(),
				title: p.getAttribute('title'),
				right: p.classList.contains('role-right')
			}));
			expect(pills).toEqual([
				{
					letter: msgs.badge_cam_right,
					icon: 'photo_camera',
					title: msgs.cam_page_even,
					right: false
				},
				{ letter: msgs.badge_cam_left, icon: 'photo_camera', title: msgs.cam_page_odd, right: true }
			]);
			const titles = [...screen.container.querySelectorAll('.img-section-title')].map((t) =>
				t.textContent?.trim()
			);
			expect(titles).toEqual([msgs.col_role_left, msgs.col_role_right]);
			// The pill is the one announcement of camera and page; the section title beside it is hidden from assistive technology.
			const pillEls = [...screen.container.querySelectorAll<HTMLElement>('.role-pill')];
			expect(pillEls.map((p) => [p.getAttribute('role'), p.getAttribute('aria-label')])).toEqual([
				['img', msgs.cam_page_even],
				['img', msgs.cam_page_odd]
			]);
			for (const p of pillEls) {
				expect(p.querySelector('.badge-letter')?.getAttribute('aria-hidden')).toBe('true');
				expect(
					p.parentElement?.querySelector('.img-section-title')?.getAttribute('aria-hidden')
				).toBe('true');
			}
		});
	});
}

describe('role badges: a single-camera capture', () => {
	it('shows neither a camera nor a page term', async () => {
		locale.set('en');
		const strip = render(ThumbnailStrip, {
			records: [singleRecord()],
			selectedRecordId: null,
			viewMode: 'spread',
			onSelect: vi.fn()
		});
		const grid = render(GridView, {
			records: [singleRecord()],
			collectionId: 1,
			onRecordsUpdate: vi.fn(),
			onRecordClick: vi.fn()
		});
		const list = render(ListView, {
			records: [singleRecord()],
			collectionId: 1,
			onRecordClick: vi.fn()
		});
		for (const s of [strip, grid, list]) {
			expect(s.container.querySelector('.role-badge')).toBeNull();
			expect(s.container.querySelector('.page-term')).toBeNull();
		}
	});
});

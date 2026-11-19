// NEH-379: the capture screen's strip names the camera and the page of each
// picture of a two-camera capture: a camera symbol and the camera letter
// from the stored role (role `right`, the odd/recto page, is the left
// camera), the page term, and both facts as the badge's title and in the
// picture's alt. In single-camera mode it names neither.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import type { Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import ThumbnailStrip from './ThumbnailStrip.svelte';

function pairRecord(): ApiRecord {
	return {
		id: 2,
		title: 'Folio 12',
		status: 'captured',
		capture_mode: 'dual',
		images: [
			{ id: 21, record_id: 2, filename: 'r.jpg', file_path: '/r', format: 'jpg', role: 'right', is_current: true },
			{ id: 20, record_id: 2, filename: 'l.jpg', file_path: '/l', format: 'jpg', role: 'left', is_current: true }
		]
	} as ApiRecord;
}

afterEach(() => locale.set('es'));

for (const [lang, msgs] of [['en', en], ['es', es]] as const) {
	it(`double mode (${lang}): camera letter and symbol from the role, the page term, both facts`, async () => {
		locale.set(lang);
		const screen = render(ThumbnailStrip, { records: [pairRecord()], selectedRecordId: null, cameraMode: 'double', onSelect: vi.fn() });
		const found = [...screen.container.querySelectorAll<HTMLElement>('.thumb-badge')].map((b) => ({
			letter: b.querySelector('.badge-letter')?.textContent?.trim(),
			icon: b.querySelector('.material-symbols-outlined')?.textContent?.trim(),
			title: b.getAttribute('title'),
			right: b.classList.contains('right')
		}));
		expect(found).toEqual([
			{ letter: msgs.badge_cam_right, icon: 'photo_camera', title: msgs.cam_page_even, right: false },
			{ letter: msgs.badge_cam_left, icon: 'photo_camera', title: msgs.cam_page_odd, right: true }
		]);
		expect([...screen.container.querySelectorAll('.page-term')].map((t) => t.textContent?.trim())).toEqual([msgs.page_term_even, msgs.page_term_odd]);
		expect([...screen.container.querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual([
			`Folio 12 · ${msgs.cam_page_even}`,
			`Folio 12 · ${msgs.cam_page_odd}`
		]);
	});
}

describe('single mode', () => {
	it('names neither a camera nor a page', async () => {
		locale.set('en');
		const screen = render(ThumbnailStrip, { records: [pairRecord()], selectedRecordId: null, cameraMode: 'single', onSelect: vi.fn() });
		expect(screen.container.querySelector('.thumb-badge')).toBeNull();
		expect(screen.container.querySelector('.page-term')).toBeNull();
		expect(screen.container.querySelector('img')?.getAttribute('alt')).toBe('Folio 12');
	});
});

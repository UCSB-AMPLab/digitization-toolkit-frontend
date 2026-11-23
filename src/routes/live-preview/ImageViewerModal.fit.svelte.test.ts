// NEH-388: the image window at the unit's 800x480 screen, with app.css, a
// guide bar and a long rejection note: the middle (images, guide bar,
// rejection, notes) scrolls, while the header and the footer with Retake
// stay in view, and the image frames keep their minimum height, inside the
// box that holds them, instead of being clipped.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { createRawSnippet } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../app.css';
import ImageViewerModal from './ImageViewerModal.svelte';

const THUMB = (() => {
	const c = document.createElement('canvas');
	c.width = 600;
	c.height = 900;
	return c.toDataURL('image/png');
})();

const LONG_NOTE = Array.from(
	{ length: 12 },
	(_, i) => `Folio ${i + 20}r: la página quedó movida y el texto no se lee en el margen.`
).join(' ');

function record(): ApiRecord {
	return {
		id: 7,
		title: 'Folio 7',
		status: 'rejected',
		capture_mode: 'dual',
		images: [1, 2].map((id) => ({
			id,
			record_id: 7,
			filename: `IMG_000${id}.jpg`,
			file_path: '/x',
			format: 'jpg',
			role: id === 1 ? 'left' : 'right',
			is_current: true
		}))
	} as ApiRecord;
}

// The guided retake's bar, at the height the page's bar takes at 800 px wide
// (a title line, the progress bar and a row with "Skip for now").
const guide = createRawSnippet(() => ({
	render: () =>
		'<div data-guide style="flex-shrink:0;height:110px;border-bottom:2px solid;">Recaptura 1 de 3</div>'
}));

beforeEach(async () => {
	locale.set('es');
	await browserPage.viewport(800, 480);
	vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB);
	vi.spyOn(recordsApi, 'listRejections').mockResolvedValue([
		{
			id: 2,
			record_id: 7,
			predefined_reason: 'blur',
			comment: LONG_NOTE,
			rejected_by: 'Ana',
			rejected_at: '2026-10-27T15:30:00',
			images: []
		}
	]);
});

afterEach(() => vi.restoreAllMocks());

describe('the image window at 800x480 (NEH-388)', () => {
	it('with the guide bar and a long rejection note, Retake is in view and the frames are not clipped', async () => {
		const screen = render(ImageViewerModal, {
			record: record(),
			cameraMode: 'double',
			onClose: vi.fn(),
			onRetake: vi.fn(),
			guide
		});
		await expect.element(screen.getByText(LONG_NOTE)).toBeInTheDocument();
		const retake = screen.getByRole('button', { name: es.lvm_retake, exact: true });
		await expect.element(retake).toBeVisible();

		const r = (retake.element() as HTMLElement).getBoundingClientRect();
		expect(r.top).toBeGreaterThanOrEqual(0);
		expect(r.bottom).toBeLessThanOrEqual(480);
		const header = document.querySelector('.img-viewer-header')!.getBoundingClientRect();
		expect(header.top).toBeGreaterThanOrEqual(0);

		const holder = document.querySelector('.img-viewer-images') as HTMLElement;
		const box = holder.getBoundingClientRect();
		const frames = [...holder.querySelectorAll<HTMLElement>('.img-viewer-frame')];
		expect(frames).toHaveLength(2);
		for (const frame of frames) {
			const f = frame.getBoundingClientRect();
			expect(f.height).toBeGreaterThanOrEqual(200);
			expect(f.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
		}

		// The middle scrolls: its end, with the frames, can be brought into view.
		const middle = document.querySelector('.img-viewer-middle') as HTMLElement;
		expect(middle).not.toBeNull();
		expect(middle.scrollHeight).toBeGreaterThan(middle.clientHeight);
		middle.scrollTop = middle.scrollHeight;
		await expect.poll(() => middle.scrollTop).toBeGreaterThan(0);
		const last = frames[0].getBoundingClientRect();
		const view = middle.getBoundingClientRect();
		expect(last.bottom).toBeLessThanOrEqual(view.bottom + 0.5);
		expect(r.bottom).toBeLessThanOrEqual(480);
	});
});

// NEH-256: every button in the live preview has an accessible name. A button
// with no text, no aria-label and no aria-labelledby is announced as just
// "button". The test renders each component in the states that add buttons
// (single and double mode, panels and dropdowns open, modals open, a record
// selected) and lists any button whose name is empty.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { camerasApi, recordsApi, type CameraDevice, type Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { cameraStatus } from '$lib/stores/cameras';
import CameraControls from './CameraControls.svelte';
import LiveViewport from './LiveViewport.svelte';
import ImageViewerModal from './ImageViewerModal.svelte';
import TopBar from './TopBar.svelte';
import ThumbnailStrip from './ThumbnailStrip.svelte';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function accessibleName(el: Element): string {
	const by = el.getAttribute('aria-labelledby');
	if (by) {
		const text = by
			.split(/\s+/)
			.map((id) => document.getElementById(id)?.textContent ?? '')
			.join(' ')
			.trim();
		if (text) return text;
	}
	const label = el.getAttribute('aria-label')?.trim();
	if (label) return label;
	// Images inside the button count through their alt text.
	const clone = el.cloneNode(true) as Element;
	clone.querySelectorAll('img').forEach((img) => img.replaceWith(img.getAttribute('alt') ?? ''));
	clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
	return (clone.textContent ?? '').trim();
}

function unnamed(root: ParentNode = document.body): string[] {
	return [...root.querySelectorAll('button')]
		.filter((b) => accessibleName(b) === '')
		.map((b) => `<button class="${b.className}">`);
}

// Icon-font glyphs are ligature text ("close", "refresh"); unless hidden from
// assistive technology they leak into the button's name ("close Cerrar").
function exposedIcons(root: ParentNode = document.body): string[] {
	return [...root.querySelectorAll('button .material-symbols-outlined, button .material-symbols')]
		.filter((i) => !i.closest('[aria-hidden="true"]'))
		.map((i) => `${i.closest('button')?.className}: ${(i.textContent ?? '').trim()}`);
}

function audit(label: string, seen: { total: number }) {
	const all = document.body.querySelectorAll('button');
	seen.total = Math.max(seen.total, all.length);
	expect(unnamed(), `${label}: buttons with no accessible name`).toEqual([]);
	expect(exposedIcons(), `${label}: icon glyphs not aria-hidden inside buttons`).toEqual([]);
}

const camera = (index: number, extra: Partial<CameraDevice> = {}): CameraDevice => ({
	index,
	model: `Camera ${index}`,
	hardware_id: `hw-${index}`,
	calibrated: true,
	orientation: 0,
	has_aperture_control: true,
	...extra
});

const record = (id: number, images = 1): ApiRecord =>
	({
		id,
		title: `Folio ${id}`,
		status: 'captured',
		capture_mode: images > 1 ? 'double' : 'single',
		images: Array.from({ length: images }, (_, i) => ({
			id: id * 10 + i,
			record_id: id,
			filename: `IMG_${id}_${i}.jpg`,
			file_path: '/x',
			format: 'jpg',
			is_current: true,
			role: i === 0 ? 'left' : 'right'
		}))
	}) as unknown as ApiRecord;

async function click(selector: string) {
	const el = document.body.querySelector(selector) as HTMLElement | null;
	expect(el, `missing ${selector}`).not.toBeNull();
	el!.click();
	await tick();
	await wait(30);
}

beforeEach(() => {
	locale.set('es');
	vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([camera(0), camera(1)]);
	vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue({
		backend: 'picamera2',
		live_preview: true,
		focus_control: true,
		live_controls: true,
		zoom: true,
		autofocus_calibration: true,
		dslr_settings: false
	});
	vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue('data:image/gif;base64,R0lGODlhAQABAAAAACw=');
	vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue('data:image/gif;base64,R0lGODlhAQABAAAAACw=');
	vi.spyOn(recordsApi, 'listRejections').mockResolvedValue([]);
});

afterEach(() => {
	vi.restoreAllMocks();
	cameraStatus.reportSuccess();
});

describe('live-preview buttons have accessible names (NEH-256)', () => {
	for (const lang of ['es', 'en'] as const) {
		it(`CameraControls, ${lang}: collapsed strip, open panel, sections, dropdowns, camera list`, async () => {
			locale.set(lang);
			const seen = { total: 0 };
			for (const cameraMode of ['single', 'double'] as const) {
				const screen = render(CameraControls, {
					cameraMode,
					shutterSpeed: '1/125s',
					iso: '100',
					aperture: '5.6',
					onCameraModeChange: vi.fn(),
					onShutterSpeedChange: vi.fn(),
					onIsoChange: vi.fn(),
					onApertureChange: vi.fn(),
					onDevicesChange: vi.fn(),
					onRotateDegChange: vi.fn(),
					rotateDeg: { 0: 90, 1: 0 }
				});
				await wait(100);
				audit(`${cameraMode} collapsed`, seen);
				await click('.strip-btn.toggle');
				await wait(100);
				audit(`${cameraMode} open`, seen);
				// Open every section that is not already open.
				for (const t of document.body.querySelectorAll<HTMLElement>('.accordion-trigger')) {
					if (t.querySelector('.chevron.rotated')) continue;
					t.click();
					await tick();
				}
				await wait(100);
				audit(`${cameraMode} sections open`, seen);
				expect(document.body.querySelector('.control-btn'), 'basic controls').not.toBeNull();
				expect(document.body.querySelector('.wb-pipette'), 'white balance buttons').not.toBeNull();
				if (cameraMode === 'double') {
					await click('.camera-selector');
					audit('camera list', seen);
					await click('.fixed-backdrop');
				}
				for (const sel of ['shutter', 'iso', 'aperture', 'format']) {
					const btn = [...document.body.querySelectorAll<HTMLElement>('.control-btn')];
					for (const b of btn) {
						b.click();
						await tick();
						await wait(20);
						audit(`dropdown`, seen);
						(document.body.querySelector('.fixed-backdrop') as HTMLElement | null)?.click();
						await tick();
					}
					void sel;
					break;
				}
				screen.unmount();
			}
			// The states below must have been reached, or the audit proves nothing.
			expect(seen.total).toBeGreaterThan(12);
		});
	}

	it('CameraControls with a DSLR: format picker and its dropdown, white balance picker active', async () => {
		vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue({
			backend: 'gphoto2',
			live_preview: true,
			focus_control: true,
			live_controls: true,
			zoom: true,
			autofocus_calibration: false,
			dslr_settings: true
		});
		const seen = { total: 0 };
		render(CameraControls, {
			cameraMode: 'single',
			shutterSpeed: '1/125',
			iso: '100',
			aperture: '5.6',
			onCameraModeChange: vi.fn(),
			onShutterSpeedChange: vi.fn(),
			onIsoChange: vi.fn(),
			onApertureChange: vi.fn(),
			onDevicesChange: vi.fn(),
			onRotateDegChange: vi.fn(),
			rotateDeg: { 0: 0 }
		});
		await wait(100);
		await click('.strip-btn.toggle');
		await wait(100);
		for (const t of document.body.querySelectorAll<HTMLElement>('.accordion-trigger')) {
			if (t.querySelector('.chevron.rotated')) continue;
			t.click();
			await tick();
		}
		await wait(100);
		audit('dslr sections open', seen);
		const controls = [...document.body.querySelectorAll<HTMLElement>('.control-btn')];
		expect(controls.length, 'shutter, iso, aperture and format').toBe(4);
		for (const b of controls) {
			b.click();
			await tick();
			await wait(20);
			audit('dslr dropdown', seen);
			(document.body.querySelector('.fixed-backdrop') as HTMLElement | null)?.click();
			await tick();
		}
		await click('.wb-picker-btn');
		expect(document.body.querySelector('.wb-picker-cancel'), 'picker cancel').not.toBeNull();
		audit('wb picker active', seen);
	});

	it('LiveViewport: single and double, floating panel, both modals', async () => {
		const seen = { total: 0 };
		for (const cameraMode of ['single', 'double'] as const) {
			const screen = render(LiveViewport, {
				cameraMode,
				shutterSpeed: '1/125s',
				iso: '100',
				aperture: '5.6',
				projectId: 1,
				projectName: 'P',
				collectionId: 1,
				onCaptureDone: vi.fn(),
				devices: [camera(0), camera(1)],
				rotateDeg: { 0: 0, 1: 0 },
				onRotateDegChange: vi.fn()
			});
			await wait(150);
			audit(`${cameraMode} viewport`, seen);
			// Open the floating panel, then each of its buttons in turn: the grid
			// and capture-key buttons open the two modals.
			if (document.body.querySelector('.float-btn-toggle')?.getAttribute('aria-expanded') !== 'true') {
				await click('.float-btn-toggle');
			}
			const floats = [...document.body.querySelectorAll<HTMLElement>('.float-btn')];
			expect(floats.length).toBeGreaterThan(5);
			let modals = 0;
			for (const f of floats) {
				if (f.classList.contains('float-btn-toggle')) continue;
				f.click();
				await tick();
				await wait(30);
				audit(`${cameraMode} after float button`, seen);
				for (const close of document.body.querySelectorAll<HTMLElement>('.modal-btn.confirm')) {
					modals++;
					close.click();
					await tick();
				}
			}
			expect(modals, 'both modals were opened').toBe(2);
			screen.unmount();
		}
		expect(seen.total).toBeGreaterThan(10);
	});

	for (const [mode, images] of [['single', 1], ['double', 2]] as const) {
		it(`ImageViewerModal, ${mode}: thumbnails, full size, retake confirmation`, async () => {
			const seen = { total: 0 };
			render(ImageViewerModal, {
				record: record(7, images),
				cameraMode: mode,
				onClose: vi.fn(),
				onRetake: vi.fn()
			});
			await wait(100);
			audit('thumbnails', seen);
			await click('[data-view-toggle]');
			await wait(100);
			audit('full size', seen);
			const retake = document.body.querySelector<HTMLElement>('.btn-danger');
			retake?.click();
			await tick();
			await wait(30);
			audit('retake confirmation', seen);
			expect(seen.total).toBeGreaterThan(3);
		});
	}

	it('TopBar', async () => {
		const seen = { total: 0 };
		render(TopBar, { onBack: vi.fn(), onGoToReview: vi.fn(), projectName: 'P', collectionName: 'C' });
		await wait(50);
		audit('topbar', seen);
		expect(seen.total).toBeGreaterThanOrEqual(2);
	});

	it('ThumbnailStrip, single and double', async () => {
		const seen = { total: 0 };
		for (const cameraMode of ['single', 'double'] as const) {
			const screen = render(ThumbnailStrip, {
				records: [record(1, cameraMode === 'double' ? 2 : 1), { ...record(2, 0), title: '' } as ApiRecord],
				selectedRecordId: 1,
				cameraMode,
				onSelect: vi.fn()
			});
			await wait(50);
			audit(`strip ${cameraMode}`, seen);
			screen.unmount();
		}
		expect(seen.total).toBeGreaterThanOrEqual(2);
	});
});

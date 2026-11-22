// The label on each of the camera check's two test pictures. It names the
// camera and the page in words where the picture is wide enough for them on
// one line, and in the badge form (camera symbol, camera letter, page term)
// where it is not; the words stay its accessible name and title. The frame
// for role `left` is the even/verso page, photographed by the right camera;
// the frame for role `right` the odd/recto page, by the left camera. At the
// unit's 800x480 screen and at 1920x1080, with app.css, in both languages.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	camerasApi,
	type CameraCapabilities,
	type CameraDevice,
	type TestCaptureResult
} from '$lib/api';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../app.css';
import CameraCheck from './CameraCheck.svelte';

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

async function jpeg(w: number, h: number): Promise<Blob> {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.5));
}

const caps: CameraCapabilities = {
	backend: 'gphoto2',
	live_preview: true,
	focus_control: false,
	live_controls: false,
	zoom: false,
	autofocus_calibration: false,
	dslr_settings: false
};
const hit = (a: DOMRect, b: DOMRect) =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const text = (el: HTMLElement) => el.innerText.replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

async function open(w: number, h: number, t: typeof en) {
	await browserPage.viewport(w, h);
	vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps);
	vi.spyOn(camerasApi, 'listDevices').mockResolvedValue(
		[0, 1].map((i) => ({
			index: i,
			hardware_id: `h${i}`,
			model: 'Canon PowerShot A2500',
			calibrated: false,
			location: `usb:001,00${i + 4}`
		})) as CameraDevice[]
	);
	vi.spyOn(camerasApi, 'testCapture').mockImplementation(
		async () =>
			({
				blob: await jpeg(1200, 1800),
				seconds: 1,
				bytes: 1,
				focalLength: null
			}) as TestCaptureResult
	);
	render(CameraCheck, {
		leftIndex: 0,
		projectName: 'Rionegro',
		collectionName: 'Tomo 6',
		rotateDeg: { 0: 90, 1: 270 },
		onClose: vi.fn()
	});
	await settle();
	[...document.querySelectorAll<HTMLButtonElement>('[data-camera-check] .sf-foot button')]
		.find((b) => b.textContent?.includes(t.camcheck_take))!
		.click();
	await expect.poll(() => document.querySelectorAll('[data-frame] img').length).toBe(2);
	await settle();
	return (['left', 'right'] as const).map((role) => {
		const frame = document.querySelector(`[data-frame="${role}"]`) as HTMLElement;
		return { role, frame, label: frame.querySelector('.feed-label') as HTMLElement };
	});
}

// One line, inside its picture with a margin, clear of the other label and
// of every button on either picture.
function fits(frames: Awaited<ReturnType<typeof open>>) {
	const buttons = [...document.querySelectorAll('[data-frame] button')];
	frames.forEach(({ role, frame, label }) => {
		const l = label.getBoundingClientRect();
		const f = frame.getBoundingClientRect();
		console.log(
			`[camcheck labels] ${role}: picture ${f.width.toFixed(0)}px, label ${l.width.toFixed(0)}x${l.height.toFixed(0)}px`
		);
		expect(l.height, `${role} height`).toBeLessThan(28);
		expect(l.left - f.left, `${role} left margin`).toBeGreaterThanOrEqual(4);
		expect(f.right - l.right, `${role} right margin`).toBeGreaterThanOrEqual(4);
		expect(l.top - f.top, `${role} top margin`).toBeGreaterThanOrEqual(4);
		for (const b of buttons)
			expect(hit(l, b.getBoundingClientRect()), `${role} over a button`).toBe(false);
		for (const other of frames)
			if (other.label !== label) expect(hit(l, other.label.getBoundingClientRect())).toBe(false);
	});
}

afterEach(() => vi.restoreAllMocks());

for (const [lang, t] of [
	['en', en],
	['es', es]
] as const) {
	describe(`test-picture labels, ${lang}`, () => {
		beforeEach(() => locale.set(lang as Locale));

		it('at 800x480: the badge form, inside each picture', async () => {
			const frames = await open(800, 480, t);
			fits(frames);
			for (const { role, label } of frames) {
				const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
				const letter = role === 'left' ? t.badge_cam_right : t.badge_cam_left;
				const term = role === 'left' ? t.page_term_even : t.page_term_odd;
				expect(text(label)).toContain(`${letter} · ${term}`);
				expect(text(label)).not.toContain(words);
				expect(label.querySelector('.material-symbols-outlined')?.getAttribute('aria-hidden')).toBe(
					'true'
				);
				expect(label.getAttribute('role')).toBe('img');
				expect(label.getAttribute('aria-label')).toBe(words);
				expect(label.getAttribute('title')).toBe(words);
			}
		});

		it('at 1920x1080: the words, inside each picture', async () => {
			const frames = await open(1920, 1080, t);
			fits(frames);
			for (const { role, label } of frames) {
				const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
				expect(text(label)).toBe(words);
				expect(label.getAttribute('title')).toMatch(new RegExp(`^${escape(words)}`));
			}
		});
	});
}

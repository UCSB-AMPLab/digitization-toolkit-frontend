// NEH-339: the camera check at the unit's 800x480 screen, with app.css, in
// both languages. Nothing scrolls the page; the top bar keeps the name, both
// chips and the way back on one row; the foot keeps the note and the button
// on one row; the captures are turned 90° and 270°; the check column fits in
// the fullest state of each unit (a CHDK pair adjusted separately with the
// steps apart, a DSLR pair whose focal lengths differ); every button is at
// least 44px tall. At 1280x800 the same.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraCapabilities, type CameraDevice, type TestCaptureResult } from '$lib/api';
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

function caps(over: Partial<CameraCapabilities>): CameraCapabilities {
	return { backend: 'gphoto2', live_preview: true, focus_control: false, live_controls: false, zoom: false, autofocus_calibration: false, dslr_settings: false, ...over };
}

const box = (el: Element) => el.getBoundingClientRect();
const q = (sel: string) => document.querySelector(sel)!;

// A button's name: its aria-label, or its text without the icon ligatures.
function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}

function button(name: string) {
	return [...document.querySelectorAll<HTMLButtonElement>('[data-camera-check] button')].find((b) => nameOf(b) === name)!;
}

function measure(w: number, h: number) {
	const root = q('[data-camera-check]') as HTMLElement;
	const r = box(root);
	expect(r.width).toBeLessThanOrEqual(w);
	expect(r.height).toBeLessThanOrEqual(h);
	expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);

	const bar = q('[data-camera-check] .topbar') as HTMLElement;
	const tops = new Set([...bar.querySelectorAll('button')].map((b) => Math.round(box(b).top + box(b).height / 2)));
	expect(tops.size).toBe(1);
	expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);

	const foot = q('[data-camera-check] .sf-foot') as HTMLElement;
	expect(box(foot).bottom).toBeLessThanOrEqual(h + 0.5);
	expect(new Set([...foot.children].map((c) => Math.round(box(c).top + box(c).height / 2))).size).toBe(1);

	const col = q('[data-camera-check] .ck-col') as HTMLElement;
	expect(col.scrollHeight).toBeLessThanOrEqual(col.clientHeight + 1);

	for (const b of root.querySelectorAll('button')) expect(box(b).height, b.textContent ?? '').toBeGreaterThanOrEqual(44);
	const frames = [...root.querySelectorAll('[data-frame]')].map((f) => box(f));
	return { col: `${col.scrollHeight}/${col.clientHeight}`, frame: `${frames[0].width.toFixed(0)}x${frames[0].height.toFixed(0)}` };
}

afterEach(() => vi.restoreAllMocks());

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['en', en],
		['es', es]
	] as const) {
		describe(`at ${w}x${h}, ${lang}`, () => {
			beforeEach(async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
			});

			it('a CHDK pair adjusted separately, the steps apart, with a zoom failure', async () => {
				const devices: CameraDevice[] = [0, 1].map((i) => ({
					index: i,
					hardware_id: `h${i}`,
					model: 'Canon PowerShot A2500',
					calibrated: false,
					location: `usb:001,00${i + 4}`,
					zoom_steps: 64,
					zoom_step: i === 0 ? 24 : 26
				}));
				vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps({ zoom_steps: true }));
				vi.spyOn(camerasApi, 'listDevices').mockImplementation(async () => devices);
				vi.spyOn(camerasApi, 'testCapture').mockImplementation(async () => ({ blob: await jpeg(1200, 1800), seconds: 1, bytes: 1, focalLength: null }) as TestCaptureResult);
				vi.spyOn(camerasApi, 'setZoomStep').mockRejectedValue(
					Object.assign(new Error('The camera on usb:001,005 did not move the lens'), { status: 502 })
				);
				render(CameraCheck, { leftIndex: 0, projectName: 'Rionegro', collectionName: 'Tomo 6', rotateDeg: { 0: 90, 1: 270 }, onClose: vi.fn() });
				await settle();
				button(msgs.camcheck_take).click();
				await expect.poll(() => document.querySelectorAll('[data-frame] img').length).toBe(2);
				await settle();
				(q('[data-zoom="right"] button[data-dir="in"]') as HTMLButtonElement).click();
				await settle();
				expect(document.querySelector('.ck-sec [role="alert"]')).not.toBeNull();
				const m = measure(w, h);
				console.log(`[camcheck fit ${w}x${h} ${lang}] CHDK separate + failure: column ${m.col}px, frame ${m.frame}px`);
			});

			it('a DSLR pair whose focal lengths differ, with a camera missing', async () => {
				vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps({ dslr_settings: true }));
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([
					{ index: 0, hardware_id: 'h0', model: 'Canon EOS Rebel T7', calibrated: false, location: 'usb:001,004' }
				]);
				vi.spyOn(camerasApi, 'testCapture').mockImplementation(async (i: number) => {
					if (i === 1) throw Object.assign(new Error('Camera 1 is not connected'), { status: 404 });
					return { blob: await jpeg(1200, 1800), seconds: 1, bytes: 1, focalLength: 27 };
				});
				render(CameraCheck, { leftIndex: 0, projectName: 'Rionegro', collectionName: 'Tomo 6', rotateDeg: { 0: 90, 1: 270 }, onClose: vi.fn() });
				await settle();
				button(msgs.camcheck_take).click();
				await expect.poll(() => document.querySelectorAll('[data-frame] img').length).toBe(1);
				await settle();
				const m = measure(w, h);
				console.log(`[camcheck fit ${w}x${h} ${lang}] DSLR, one camera missing: column ${m.col}px, frame ${m.frame}px`);
			});

			it('a DSLR pair whose focal lengths differ', async () => {
				vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps({ dslr_settings: true }));
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue(
					[0, 1].map((i) => ({ index: i, hardware_id: `h${i}`, model: 'Canon EOS Rebel T7', calibrated: false, location: `usb:001,00${i + 4}` }))
				);
				vi.spyOn(camerasApi, 'testCapture').mockImplementation(async (i: number) => ({
					blob: await jpeg(1200, 1800),
					seconds: 1,
					bytes: 1,
					focalLength: i === 0 ? 27 : 35
				}));
				render(CameraCheck, { leftIndex: 0, projectName: 'Rionegro', collectionName: 'Tomo 6', rotateDeg: { 0: 90, 1: 270 }, onClose: vi.fn() });
				await settle();
				button(msgs.camcheck_take).click();
				await expect.poll(() => document.querySelectorAll('[data-frame] img').length).toBe(2);
				await settle();
				expect(document.body.textContent).toContain(msgs.camcheck_focal_differ_title);
				const m = measure(w, h);
				console.log(`[camcheck fit ${w}x${h} ${lang}] DSLR focal mismatch: column ${m.col}px, frame ${m.frame}px`);
			});
		});
	}
}

// NEH-343: "Which camera is this?" at the unit's 800x480 screen, with
// app.css, in both languages, and at 1280x800. Nothing scrolls; the top bar
// keeps its buttons on one row and the foot its note and actions on one
// row; both images and their captions are inside the body; every button is
// at least 44px tall. The fullest states: a choice made with a refusal
// under the question and a guess on one camera; the socket question; a
// camera Captua cannot identify; opened by hand, with Cancel.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraDevice, type CameraSetup, type CameraSetupCode } from '$lib/api';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../app.css';
import WhichCamera from './WhichCamera.svelte';

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

function setup(codes: CameraSetupCode[], needs = codes.length > 0): CameraSetup {
	return { needs_setup: needs, reasons: codes.map((code) => ({ code, message: 'English', hardware_ids: [] })), confirmed_pair: null };
}

const box = (el: Element) => el.getBoundingClientRect();
const q = (sel: string) => document.querySelector(sel)!;

function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}

function button(name: string) {
	return [...document.querySelectorAll<HTMLButtonElement>('[data-which-camera] button')].find((b) => nameOf(b) === name)!;
}

function measure(w: number, h: number) {
	const root = q('[data-which-camera]') as HTMLElement;
	const r = box(root);
	expect(r.width).toBeLessThanOrEqual(w);
	expect(r.height).toBeLessThanOrEqual(h);
	expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);

	const bar = q('[data-which-camera] .topbar') as HTMLElement;
	expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);

	const body = q('[data-which-camera] .sf-body') as HTMLElement;
	expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
	const inner = box(body);
	for (const c of root.querySelectorAll('[data-card]')) {
		const b = box(c);
		expect(b.top).toBeGreaterThanOrEqual(inner.top - 0.5);
		expect(b.bottom).toBeLessThanOrEqual(inner.bottom + 0.5);
		expect(b.left).toBeGreaterThanOrEqual(inner.left - 0.5);
		expect(b.right).toBeLessThanOrEqual(inner.right + 0.5);
		const cap = c.querySelector('.id-cap') as HTMLElement;
		expect(cap.scrollWidth).toBeLessThanOrEqual(cap.clientWidth + 1);
	}

	const foot = q('[data-which-camera] .sf-foot') as HTMLElement;
	expect(box(foot).bottom).toBeLessThanOrEqual(h + 0.5);
	expect(new Set([...foot.children].map((c) => Math.round(box(c).top + box(c).height / 2))).size).toBe(1);
	expect(foot.scrollWidth).toBeLessThanOrEqual(foot.clientWidth + 1);

	for (const b of root.querySelectorAll('button')) expect(box(b).height, nameOf(b)).toBeGreaterThanOrEqual(44);
	const pick = root.querySelector('[data-card] .id-pick');
	return { body: `${body.scrollHeight}/${body.clientHeight}`, pick: pick ? `${box(pick).width.toFixed(0)}x${box(pick).height.toFixed(0)}` : '-' };
}

const device = (i: number, over: Partial<CameraDevice> = {}): CameraDevice => ({
	index: i,
	hardware_id: `h${i}`,
	model: 'Canon EOS Rebel T7',
	calibrated: false,
	location: `usb:001,00${i + 4}`,
	role: null,
	role_confirmed: false,
	role_guess: null,
	...over
});

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
				vi.spyOn(camerasApi, 'previewFrame').mockImplementation(() => jpeg(1800, 1200));
			});

			const props = (s: CameraSetup, cancellable = false) => ({
				setup: s,
				cancellable,
				projectName: 'Rionegro',
				collectionName: 'Tomo 6',
				rotateDeg: { 0: 90, 1: 270 },
				onSaved: vi.fn(),
				onCancel: vi.fn(),
				onReread: vi.fn(async () => {})
			});

			it('another pair, a choice made, a guess, and a refusal', async () => {
				vi.spyOn(console, 'error').mockImplementation(() => {});
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0, { role_guess: 'left' }), device(1)]);
				vi.spyOn(camerasApi, 'setRoles').mockRejectedValue(Object.assign(new Error('x'), { status: 503 }));
				render(WhichCamera, props(setup(['pair_changed'])));
				await settle();
				(q('[data-card="1"] button[data-pick]') as HTMLButtonElement).click();
				await settle();
				button(msgs.camwhich_confirm).click();
				await settle();
				expect(document.body.textContent).toContain(msgs.camwhich_err_unavailable);
				const m = measure(w, h);
				console.log(`[camwhich fit ${w}x${h} ${lang}] ask + refusal: body ${m.body}px, image ${m.pick}px`);
			});

			it('another pair, with the longest refusal (a camera no longer connected)', async () => {
				vi.spyOn(console, 'error').mockImplementation(() => {});
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0, { role_guess: 'left' }), device(1)]);
				vi.spyOn(camerasApi, 'setRoles').mockRejectedValue(
					Object.assign(new Error('x'), { status: 409, detail: { code: 'camera_not_connected', message: 'x' } })
				);
				render(WhichCamera, props(setup(['pair_changed'])));
				await settle();
				(q('[data-card="1"] button[data-pick]') as HTMLButtonElement).click();
				await settle();
				button(msgs.camwhich_confirm).click();
				await settle();
				expect(document.body.textContent).toContain(msgs.camwhich_err_not_connected);
				const m = measure(w, h);
				console.log(`[camwhich fit ${w}x${h} ${lang}] ask + not connected: body ${m.body}px, image ${m.pick}px`);
			});

			it('one camera, after a reconnection that failed', async () => {
				vi.spyOn(console, 'error').mockImplementation(() => {});
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0)]);
				vi.spyOn(camerasApi, 'rescan').mockRejectedValue(Object.assign(new Error('x'), { status: 500 }));
				render(WhichCamera, props(setup(['role_unconfirmed'])));
				await settle();
				button(msgs.camwhich_check_again).click();
				await settle();
				expect(document.body.textContent).toContain(msgs.camwhich_rescan_failed);
				measure(w, h);
			});

			it('a camera on another socket', async () => {
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0, { role: 'right', role_confirmed: true }), device(1, { role: 'left', role_confirmed: true })]);
				render(WhichCamera, props(setup(['port_changed'])));
				await settle();
				const m = measure(w, h);
				console.log(`[camwhich fit ${w}x${h} ${lang}] port: body ${m.body}px, image ${m.pick}px`);
			});

			it('a camera Captua cannot identify', async () => {
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0), device(1)]);
				render(WhichCamera, props(setup(['identity_ambiguous'])));
				await settle();
				expect(document.body.textContent).toContain(msgs.camwhich_identity_title);
				measure(w, h);
			});

			it('opened by hand, with Cancel', async () => {
				vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0), device(1)]);
				render(WhichCamera, props(setup([]), true));
				await settle();
				expect(button(msgs.common_cancel)).toBeTruthy();
				const m = measure(w, h);
				console.log(`[camwhich fit ${w}x${h} ${lang}] by hand: body ${m.body}px, image ${m.pick}px`);
			});
		});
	}
}

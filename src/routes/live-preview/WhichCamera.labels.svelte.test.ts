// The role label on each image of "Which camera is this?". It names the
// camera and the page in words where the image is wide enough for them on
// one line, and in the badge form (camera symbol, camera letter, page term)
// where it is not; the words stay its accessible name and title. On the
// ask screen the labels show once an image is pressed: the pressed image is
// the odd/recto page (role `right`, the left camera), the other the
// even/verso page (role `left`, the right camera). On the USB-socket screen
// they show from the start, the even/verso page's image first. At the
// unit's 800x480 screen and at 1920x1080, with app.css, in both languages.
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

function setup(codes: CameraSetupCode[]): CameraSetup {
	return { needs_setup: true, reasons: codes.map((code) => ({ code, message: 'English', hardware_ids: [] })), confirmed_pair: null };
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

const props = (s: CameraSetup) => ({
	setup: s,
	projectName: 'Rionegro',
	collectionName: 'Tomo 6',
	rotateDeg: { 0: 90, 1: 270 },
	onSaved: vi.fn(),
	onReread: vi.fn(async () => {})
});

const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const text = (el: HTMLElement) => el.innerText.replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// The two cards in screen order, each with its label, its image and its
// turn button.
function cards() {
	return [...document.querySelectorAll<HTMLElement>('[data-which-camera] [data-card]')].map((card) => ({
		card,
		pick: card.querySelector('.id-pick') as HTMLElement,
		label: card.querySelector('.feed-label') as HTMLElement,
		turn: card.querySelector('[data-turn]') as HTMLElement
	}));
}

// Every label is one line, inside its image with a margin, and clear of the
// other label, both turn buttons and the other card.
function fits() {
	const all = cards();
	all.forEach(({ pick, label }, i) => {
		const l = label.getBoundingClientRect();
		const p = pick.getBoundingClientRect();
		console.log(`[which labels] card ${i}: image ${p.width.toFixed(0)}px, label ${l.width.toFixed(0)}x${l.height.toFixed(0)}px`);
		expect(l.height, `card ${i} height`).toBeLessThan(28);
		expect(l.left - p.left, `card ${i} left margin`).toBeGreaterThanOrEqual(4);
		expect(p.right - l.right, `card ${i} right margin`).toBeGreaterThanOrEqual(4);
		expect(l.top - p.top, `card ${i} top margin`).toBeGreaterThanOrEqual(4);
		for (const [j, other] of all.entries()) {
			expect(hit(l, other.turn.getBoundingClientRect()), `card ${i} over turn ${j}`).toBe(false);
			if (j !== i) {
				expect(hit(l, other.label.getBoundingClientRect()), `card ${i} over label ${j}`).toBe(false);
				expect(hit(l, other.card.getBoundingClientRect()), `card ${i} over card ${j}`).toBe(false);
			}
		}
	});
}

function badge(label: HTMLElement, role: 'left' | 'right', t: typeof en) {
	const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
	const letter = role === 'left' ? t.badge_cam_right : t.badge_cam_left;
	const term = role === 'left' ? t.page_term_even : t.page_term_odd;
	expect(text(label)).toContain(`${letter} · ${term}`);
	expect(text(label)).not.toContain(words);
	expect(label.querySelector('.material-symbols-outlined')?.getAttribute('aria-hidden')).toBe('true');
	expect(label.getAttribute('role')).toBe('img');
	expect(label.getAttribute('aria-label')).toBe(words);
	expect(label.getAttribute('title')).toMatch(new RegExp(`^${escape(words)}`));
}

function inWords(label: HTMLElement, role: 'left' | 'right', t: typeof en) {
	const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
	expect(text(label)).toBe(words);
	expect(label.getAttribute('title')).toMatch(new RegExp(`^${escape(words)}`));
}

// The pick's description is the label's words in either form.
function described(pick: HTMLElement, role: 'left' | 'right', t: typeof en) {
	const words = role === 'left' ? t.cam_page_even : t.cam_page_odd;
	const button = pick as HTMLButtonElement;
	const target = document.getElementById(button.getAttribute('aria-describedby') ?? '');
	expect(target?.getAttribute('aria-label') ?? text(target as HTMLElement)).toBe(words);
}

afterEach(() => vi.restoreAllMocks());

for (const [lang, t] of [
	['en', en],
	['es', es]
] as const) {
	describe(`role labels, ${lang}`, () => {
		beforeEach(() => {
			locale.set(lang as Locale);
			vi.spyOn(camerasApi, 'previewFrame').mockImplementation(() => jpeg(1800, 1200));
		});

		async function ask(w: number, h: number) {
			await browserPage.viewport(w, h);
			vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0), device(1)]);
			render(WhichCamera, props(setup(['pair_changed'])));
			await settle();
			(document.querySelector('[data-card="1"] button[data-pick]') as HTMLButtonElement).click();
			await settle();
			return cards();
		}

		async function port(w: number, h: number) {
			await browserPage.viewport(w, h);
			vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([
				device(0, { role: 'right', role_confirmed: true }),
				device(1, { role: 'left', role_confirmed: true })
			]);
			render(WhichCamera, props(setup(['port_changed'])));
			await settle();
			return cards();
		}

		it('at 800x480, after an image is pressed: the badge form, inside each image', async () => {
			const [first, second] = await ask(800, 480);
			fits();
			badge(first.label, 'left', t);
			badge(second.label, 'right', t);
			described(first.pick, 'left', t);
			described(second.pick, 'right', t);
		});

		it('at 800x480, on the USB-socket screen: the badge form from the start', async () => {
			const [first, second] = await port(800, 480);
			fits();
			badge(first.label, 'left', t);
			badge(second.label, 'right', t);
			described(first.pick, 'left', t);
			described(second.pick, 'right', t);
		});

		it('at 1920x1080: the words, inside each image', async () => {
			const [first, second] = await ask(1920, 1080);
			fits();
			inWords(first.label, 'left', t);
			inWords(second.label, 'right', t);
		});

		it('at 1920x1080, on the USB-socket screen: the words', async () => {
			const [first, second] = await port(1920, 1080);
			fits();
			inWords(first.label, 'left', t);
			inWords(second.label, 'right', t);
		});
	});
}

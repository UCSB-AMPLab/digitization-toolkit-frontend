// NEH-340: the colour card step at the unit's 800x480 screen and at
// 1280x800, with app.css, in both languages. Nothing scrolls; the foot keeps
// its buttons on one row inside the screen; both camera cards, their images
// and their buttons are inside the body; every button is at least 44px
// tall. The fullest states: both shots on screen under the longest refusal
// with the longest reason; one RAW shot and one camera still to take; the
// skip confirmation; a volume deleted meanwhile.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, colourCardApi } from '$lib/api';
import { readColourCardSet } from '$lib/colour-card';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { authStore } from '$lib/stores/auth';
import '../../app.css';
import ColourCardStep from './ColourCardStep.svelte';

async function jpegUrl(w: number, h: number): Promise<string> {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#888';
	ctx.fillRect(0, 0, w, h);
	const blob = await new Promise<Blob>((resolve) =>
		c.toBlob((b) => resolve(b!), 'image/jpeg', 0.5)
	);
	return URL.createObjectURL(blob);
}

const rawShot = (camera_index: number, over: Record<string, unknown> = {}) => ({
	id: 10 + camera_index,
	camera_index,
	capture_id: `c-${camera_index}`,
	filename: `co-x-cal_01_c${camera_index}.jpg`,
	preview: true,
	captured_at: null,
	captured_by: 'operator',
	url: `/collections/9/colour-card/shots/${10 + camera_index}/preview`,
	...over
});
const set = (shots: unknown[]) =>
	readColourCardSet({
		id: 5,
		number: 1,
		outcome: null,
		capture_mode: 'dual',
		cameras: [{ camera_index: 0 }, { camera_index: 1 }],
		shots
	})!;

const box = (el: Element) => el.getBoundingClientRect();
const q = (sel: string) => document.querySelector(sel)!;

function nameOf(b: Element): string {
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (b.getAttribute('aria-label') ?? copy.textContent ?? '').trim();
}

function measure(w: number, h: number) {
	const root = q('[data-colour-card]') as HTMLElement;
	const r = box(root);
	expect(r.width).toBeLessThanOrEqual(w);
	expect(r.height).toBeLessThanOrEqual(h);
	expect(root.scrollHeight).toBeLessThanOrEqual(root.clientHeight + 1);
	expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);

	const bar = q('[data-colour-card] .topbar') as HTMLElement;
	expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);

	const body = q('[data-colour-card] .sf-body') as HTMLElement;
	expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
	const inner = box(body);
	for (const c of root.querySelectorAll('[data-cc-camera]')) {
		const b = box(c);
		expect(b.top).toBeGreaterThanOrEqual(inner.top - 0.5);
		expect(b.bottom).toBeLessThanOrEqual(inner.bottom + 0.5);
		expect(b.left).toBeGreaterThanOrEqual(inner.left - 0.5);
		expect(b.right).toBeLessThanOrEqual(inner.right + 0.5);
		const frame = c.querySelector('.cc-frame') as HTMLElement;
		// Room enough for the shot to be judged.
		expect(box(frame).height).toBeGreaterThanOrEqual(80);
		expect(frame.scrollHeight).toBeLessThanOrEqual(frame.clientHeight + 1);
		const take = c.querySelector('[data-cc-take]') as HTMLElement;
		expect(take.scrollWidth).toBeLessThanOrEqual(take.clientWidth + 1);
	}

	const foot = q('[data-colour-card] .sf-foot') as HTMLElement;
	expect(box(foot).bottom).toBeLessThanOrEqual(h + 0.5);
	expect(
		new Set([...foot.children].map((c) => Math.round(box(c).top + box(c).height / 2))).size
	).toBe(1);
	expect(foot.scrollWidth).toBeLessThanOrEqual(foot.clientWidth + 1);

	for (const b of document.querySelectorAll('[data-colour-card] button, .cc-confirm button'))
		expect(box(b).height, nameOf(b)).toBeGreaterThanOrEqual(44);
	const frame = root.querySelector('.cc-frame');
	return frame ? `${box(frame).width.toFixed(0)}x${box(frame).height.toFixed(0)}` : '-';
}

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	document.querySelectorAll('[data-colour-card], .cc-backdrop').forEach((n) => n.remove());
});

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['en', en],
		['es', es]
	] as const) {
		describe(`at ${w}x${h}, ${lang}`, () => {
			let url: string;
			beforeEach(async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
				authStore.setSession({
					id: 1,
					username: 'operator',
					email: null,
					role: 'operator',
					is_active: true
				});
				url = await jpegUrl(1800, 1200);
				vi.spyOn(colourCardApi, 'shotImageUrl').mockImplementation(() => url);
			});

			const props = (reason: 'start' | 'begun_without' | 'settings_changed') => ({
				collectionId: 9,
				captureMode: 'dual' as const,
				leftIndex: 0,
				reason,
				cameraName: (cam: number) =>
					msgs.lv_camera_in_sentence({ role: cam === 0 ? 'right' : 'left' }),
				projectName: 'Archivo Histórico de Rionegro',
				collectionName: 'Notaría primera, tomo 1834-1836',
				stamp: () => 0,
				onEvidence: vi.fn(() => true),
				need: () => true,
				onLeave: vi.fn()
			});

			it('both shots, under the longest refusal, with the longest reason', async () => {
				vi.spyOn(console, 'error').mockImplementation(() => {});
				vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(set([rawShot(0), rawShot(1)]));
				vi.spyOn(colourCardApi, 'complete').mockRejectedValue(
					new ApiError('x', { code: 'storage_reserve' }, 507)
				);
				authStore.setSession({
					id: 1,
					username: 'admin',
					email: null,
					role: 'admin',
					is_active: true
				});
				render(ColourCardStep, props('settings_changed'));
				await expect
					.element(browserPage.getByRole('button', { name: msgs.cc_continue }))
					.toBeEnabled();
				await browserPage.getByRole('button', { name: msgs.cc_continue }).click();
				await expect.element(browserPage.getByText(msgs.lv_err_storage_reserve_free)).toBeVisible();
				await expect
					.poll(() => document.querySelectorAll('[data-colour-card] img.cc-img').length)
					.toBe(2);
				const frame = measure(w, h);
				console.log(`[cc fit ${w}x${h} ${lang}] two shots + refusal: frame ${frame}px`);
			});

			it('one RAW shot, one camera still to take', async () => {
				vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(
					set([rawShot(0, { preview: false, filename: 'co-x-cal_01_c0.cr2' })])
				);
				render(ColourCardStep, props('begun_without'));
				await expect.element(browserPage.getByText(msgs.cc_shot_raw)).toBeVisible();
				const frame = measure(w, h);
				console.log(`[cc fit ${w}x${h} ${lang}] raw + to take: frame ${frame}px`);
			});

			it('the skip confirmation', async () => {
				vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(set([]));
				render(ColourCardStep, props('start'));
				await browserPage.getByRole('button', { name: msgs.cc_skip, exact: true }).click();
				await expect.element(browserPage.getByText(msgs.cc_skip_body)).toBeVisible();
				measure(w, h);
				const card = q('.cc-confirm') as HTMLElement;
				expect(box(card).bottom).toBeLessThanOrEqual(h);
				expect(card.scrollHeight).toBeLessThanOrEqual(card.clientHeight + 1);
			});

			it('a volume deleted meanwhile', async () => {
				vi.spyOn(console, 'error').mockImplementation(() => {});
				vi.spyOn(colourCardApi, 'openSet').mockRejectedValue(new ApiError('x', undefined, 404));
				render(ColourCardStep, props('start'));
				await expect.element(browserPage.getByText(msgs.cc_err_volume_gone)).toBeVisible();
				measure(w, h);
			});
		});
	}
}

// NEH-339: the focus check at the unit's 800x480 screen, with app.css. The
// test-pictures stage fits without the body scrolling before, during and
// after a capture, in both languages; the status line does not change the
// panes' height; the zoom buttons are 44px and lie over no picture; and no
// text in the dialog is smaller than --text-sm (12px).
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type DSLRSettings, type TestCaptureResult } from '$lib/api';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../app.css';
import RefocusModal from './RefocusModal.svelte';

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

const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function button(name: string) {
	return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
		(b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name
	)!;
}

// Elements that hold text of their own, outside the lens drawing.
function smallText(): string[] {
	const dialog = document.querySelector('[role="dialog"]')!;
	return [...dialog.querySelectorAll<HTMLElement>('*')]
		.filter((el) => !el.closest('svg'))
		.filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
		.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
		.map((el) => `${el.className}: ${el.textContent?.trim()}`);
}

// The failure message of a pane lies wholly inside its frame, and the
// "could not focus" one is a list of four.
function messageInFrame(side: 'left' | 'right') {
	const frame = document.querySelector(`[data-pane="${side}"] .rf-frame`) as HTMLElement;
	const el = frame.querySelector('.rf-pane-error') as HTMLElement;
	const message = el.getBoundingClientRect();
	const r = frame.getBoundingClientRect();
	expect(el.querySelectorAll('ul li')).toHaveLength(4);
	expect(message.top).toBeGreaterThanOrEqual(r.top);
	expect(message.bottom).toBeLessThanOrEqual(r.bottom);
	expect(message.left).toBeGreaterThanOrEqual(r.left);
	expect(message.right).toBeLessThanOrEqual(r.right);
	return { frame: r.height, message: message.height };
}

// The footer's buttons on one row, and how wide that row is.
function footerRow() {
	const footer = document.querySelector('.img-viewer-footer') as HTMLElement;
	const buttons = [...footer.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
	const tops = new Set(buttons.map((r) => Math.round(r.top)));
	const used = buttons.reduce((sum, r) => sum + r.width, 0);
	return { rows: tops.size, height: footer.getBoundingClientRect().height, used, width: footer.clientWidth };
}

function bodyFits() {
	const body = document.querySelector('.rf-body') as HTMLElement;
	const card = box('[role="dialog"]');
	return { scroll: body.scrollHeight, client: body.clientHeight, cardBottom: card.bottom, cardHeight: card.height };
}

beforeEach(async () => {
	await browserPage.viewport(800, 480);
	vi.spyOn(camerasApi, 'getDSLRSettings').mockResolvedValue({ focus_mode: 'One Shot' } as DSLRSettings);
});

afterEach(() => {
	vi.restoreAllMocks();
});

for (const [lang, msgs] of [['en', en], ['es', es]] as const) {
	describe(`at 800x480, ${lang}`, () => {
		beforeEach(() => locale.set(lang as Locale));

		it('the test-pictures stage fits before, during and after a capture', async () => {
			let answer!: (r: TestCaptureResult[]) => void;
			const both = new Promise<TestCaptureResult[]>((r) => (answer = r));
			vi.spyOn(camerasApi, 'testCapture').mockImplementation(async (i: number) => {
				const results = await both;
				if (i === 1) throw Object.assign(new Error('timeout'), { status: 504 });
				return results[i];
			});
			render(RefocusModal, { leftIndex: 0, onClose: vi.fn() });
			await settle();
			expect(smallText()).toEqual([]);
			button(msgs.focus_next).click();
			await settle();

			const footerBefore = footerRow();
			expect(footerBefore.rows).toBe(1);
			const before = bodyFits();
			const paneBefore = box('[data-pane="left"] .rf-frame').height;
			expect(before.scroll).toBeLessThanOrEqual(before.client + 1);
			expect(before.cardBottom).toBeLessThanOrEqual(480);

			button(msgs.focus_take).click();
			await settle();
			const during = bodyFits();
			const paneDuring = box('[data-pane="left"] .rf-frame').height;
			expect(during.scroll).toBeLessThanOrEqual(during.client + 1);
			expect(paneDuring).toBeCloseTo(paneBefore, 0);

			answer([{ blob: await jpeg(3000, 2000), seconds: 4, bytes: 1, focalLength: 27 }]);
			await expect.poll(() => document.querySelector('[data-pane="left"] img')?.clientWidth ?? 0).toBeGreaterThan(0);
			await settle();
			const after = bodyFits();
			const paneAfter = box('[data-pane="left"] .rf-frame').height;
			expect(after.scroll).toBeLessThanOrEqual(after.client + 1);
			expect(after.cardBottom).toBeLessThanOrEqual(480);
			expect(smallText()).toEqual([]);
			// Camera 1 answered 504: its pane holds the whole list.
			const oneFailed = messageInFrame('right');
			const footerAfter = footerRow();
			expect(footerAfter.rows).toBe(1);
			console.log(
				`[fit ${lang}] footer: one row, ${footerBefore.height.toFixed(0)}px tall; buttons ${footerBefore.used.toFixed(0)}px of ${footerBefore.width}px before a capture, ${footerAfter.used.toFixed(0)}px after`
			);

			const frames = [box('[data-pane="left"] .rf-frame'), box('[data-pane="right"] .rf-frame')];
			for (const name of [msgs.col_fit_screen_aria, msgs.col_zoom_actual_aria, msgs.lv_zoom_out, msgs.lv_zoom_in]) {
				const r = button(name).getBoundingClientRect();
				expect(r.height).toBeGreaterThanOrEqual(44);
				expect(r.width).toBeGreaterThanOrEqual(44);
				for (const f of frames) expect(overlaps(r, f)).toBe(false);
			}
			console.log(
				`[fit ${lang}] card ${before.cardHeight.toFixed(0)}px; panes before ${paneBefore.toFixed(0)}px, during ${paneDuring.toFixed(0)}px, after ${paneAfter.toFixed(0)}px; header ${box('.img-viewer-header').height.toFixed(0)}px, footer ${box('.img-viewer-footer').height.toFixed(0)}px; one failed: message ${oneFailed.message.toFixed(0)}px in a ${oneFailed.frame.toFixed(0)}px pane`
			);
		});

		it('two failures fit too, and their messages are not cut off', async () => {
			vi.spyOn(camerasApi, 'testCapture').mockRejectedValue(Object.assign(new Error('timeout'), { status: 504 }));
			render(RefocusModal, { leftIndex: 0, onClose: vi.fn() });
			await settle();
			button(msgs.focus_next).click();
			await settle();
			button(msgs.focus_take).click();
			await expect.poll(() => document.querySelectorAll('.rf-pane-error').length).toBe(2);
			await settle();
			const fit = bodyFits();
			expect(fit.scroll).toBeLessThanOrEqual(fit.client + 1);
			const left = messageInFrame('left');
			const right = messageInFrame('right');
			expect(smallText()).toEqual([]);
			console.log(`[fit ${lang}] two failures: panes ${left.frame.toFixed(0)}px, messages ${left.message.toFixed(0)}px and ${right.message.toFixed(0)}px`);
		});

		it('"Show steps" over two failure lists: the panes keep the lists whole and only then the body scrolls', async () => {
			vi.spyOn(camerasApi, 'testCapture').mockRejectedValue(Object.assign(new Error('timeout'), { status: 504 }));
			render(RefocusModal, { leftIndex: 0, onClose: vi.fn() });
			await settle();
			button(msgs.focus_next).click();
			await settle();
			button(msgs.focus_take).click();
			await expect.poll(() => document.querySelectorAll('.rf-pane-error').length).toBe(2);
			await settle();
			button(msgs.focus_steps_show).click();
			await settle();
			expect(document.querySelectorAll('ol.rf-steps li')).toHaveLength(4);
			const left = messageInFrame('left');
			const right = messageInFrame('right');
			const open = bodyFits();
			expect(open.cardBottom).toBeLessThanOrEqual(480);
			expect(footerRow().rows).toBe(1);
			expect(smallText()).toEqual([]);

			button(msgs.focus_steps_hide).click();
			await settle();
			const closed = bodyFits();
			expect(closed.scroll).toBeLessThanOrEqual(closed.client + 1);
			console.log(
				`[fit ${lang}] steps shown over two failures: panes ${left.frame.toFixed(0)}px for lists of ${left.message.toFixed(0)}/${right.message.toFixed(0)}px; body ${open.scroll}px in ${open.client}px (scrolls); steps hidden: body ${closed.scroll}px in ${closed.client}px`
			);
		});

		it('the AF and MF stages fit without scrolling and use no text below 12px', async () => {
			render(RefocusModal, { leftIndex: 0, onClose: vi.fn() });
			await settle();
			expect(smallText()).toEqual([]);
			const af = bodyFits();
			expect(af.scroll).toBeLessThanOrEqual(af.client + 1);
			expect(af.cardBottom).toBeLessThanOrEqual(480);
			button(msgs.focus_next).click();
			await settle();
			button(msgs.focus_next).click();
			await settle();
			expect(smallText()).toEqual([]);
			const mf = bodyFits();
			expect(mf.scroll).toBeLessThanOrEqual(mf.client + 1);
			expect(mf.cardBottom).toBeLessThanOrEqual(480);
			console.log(`[fit ${lang}] AF stage body ${af.scroll}px in ${af.client}px, card ${af.cardHeight.toFixed(0)}px; MF stage body ${mf.scroll}px in ${mf.client}px, card ${mf.cardHeight.toFixed(0)}px`);
		});
	});
}

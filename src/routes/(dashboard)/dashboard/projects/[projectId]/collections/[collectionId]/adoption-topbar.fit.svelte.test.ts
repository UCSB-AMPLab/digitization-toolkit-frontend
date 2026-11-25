// NEH-419: the volume page's real top bar and the strip under it, at the
// unit's 800x480 screen and at 1280x800, in both languages, for an
// administrator on a hand-made volume with records: the bar holds every
// control that can be there at once (the colour card flag, Keep or the
// space-on-the-card button, the send-for-review control, Capture, the user
// menu), and the move's explanation and button sit in the strip. No control
// overlaps another, none is clipped, and nothing leaves the screen's width.
//
// With the offsite copy line and the Fisqua line both under the breadcrumb
// (a copy that is complete, a volume not yet sent to Fisqua), with and
// without the strip's row: every status line is inside the bar and clear of
// the strip, and the strip's content has the bar's side inset, a top and
// bottom padding, a border under it, and nothing clipped.
//
// The notice of a move left half done that names the volume, with the
// repair available and not: at rest the strip is at its top, its heading
// and the missing file's line are inside the strip's visible box, and the
// Repair button is visible.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

const nav = vi.hoisted(() => ({ data: {} as { [k: string]: unknown } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			params: { projectId: '1', collectionId: '7' },
			url: new URL('http://localhost/dashboard/projects/1/collections/7'),
			get data() {
				return nav.data;
			}
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../../../../../../app.css';
import VolumePageHost from '$lib/test-support/VolumePageHost.svelte';

const records = [1, 2, 3].map((id) => ({
	id,
	title: `Folio ${id}`,
	status: 'captured',
	sequence: id,
	collection_id: 7,
	images: [{ id: id * 10, record_id: id, filename: `p${id}.jpg`, format: 'jpg', is_current: true }]
}));

function offsite(received: boolean, fisqua: unknown = undefined) {
	return {
		...(fisqua === undefined ? {} : { fisqua }),
		collection_id: 7,
		filename_stem: 'volumen-prueba-12',
		uploadable: true,
		total: 6,
		verified: received ? 6 : 0,
		pending: received ? 0 : 6,
		refused: 0,
		last_verified_at: received && fisqua !== undefined ? '2026-11-24T09:30:00' : null,
		received,
		refusals: [],
		freed_files: 0,
		freed_bytes: 0,
		kept_on_unit: false
	};
}

let adoptionReport: unknown = { unfinished: null, running: null };

function stubFetch(received: boolean, fisqua: unknown = undefined) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost');
		const json = (body: unknown) =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		const p = url.pathname;
		if (p.endsWith('/collections/7/offsite')) return json(offsite(received, fisqua));
		if (p.endsWith('/records/count')) return json({ count: 3 });
		if (p.endsWith('/records/')) return json(records);
		if (p.includes('/annotations')) return json([]);
		if (p.includes('/records/images/'))
			return new Response(new Blob(['jpeg']), {
				status: 200,
				headers: { 'Content-Type': 'image/jpeg' }
			});
		if (p.endsWith('/system/unit')) return json({ mode: 'fisqua' });
		if (p.endsWith('/system/adoption')) return json(adoptionReport);
		return json({});
	});
}

const box = (el: Element) => el.getBoundingClientRect();
const visible = (el: Element) => {
	const r = box(el);
	return r.width > 0 && r.height > 0;
};
const overlap = (a: DOMRect, b: DOMRect) =>
	Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
	Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;

function controlsOf(root: Element): HTMLElement[] {
	const all = [
		...root.querySelectorAll<HTMLElement>('button, a[href], .bc-item, .offsite-indicator')
	].filter(visible);
	// The outermost of nested controls only.
	return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

beforeEach(() => {
	resetUnit();
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
	nav.data = {
		projectName: 'Proyecto',
		collectionName: 'Volumen de prueba',
		collectionColourCard: { enabled: true, status: 'present', sets: 1 },
		collectionAdoption: {
			external_id: null,
			captures_adopted_at: null,
			adoption_unfinished: false,
			testing: false
		}
	};
});
afterEach(() => {
	adoptionReport = { unfinished: null, running: null };
	// A move left unresolved keeps its id in the session (VolumeAdoptActions).
	sessionStorage.clear();
	vi.restoreAllMocks();
	authStore.clearSession();
});

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		for (const received of [false, true]) {
			it(`at ${w}x${h}, ${lang}, ${received ? 'received offsite' : 'not yet copied'}: the bar and the strip fit`, async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
				stubFetch(received);
				render(VolumePageHost);
				const bar = () => document.querySelector<HTMLElement>('.topbar');
				// Everything that can be in the bar has arrived.
				await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
				await expect
					.poll(() =>
						[...bar()!.querySelectorAll('button')].some((b) =>
							b.textContent?.includes(msgs.col_live_preview)
						)
					)
					.toBe(true);
				if (!received)
					await expect
						.poll(() =>
							[...bar()!.querySelectorAll('button')].some(
								(b) => b.textContent?.trim() === msgs.kept_keep_action
							)
						)
						.toBe(true);
				else await expect.poll(() => bar()!.querySelector('.offsite-manage-btn')).not.toBeNull();
				await expect.poll(() => bar()!.querySelector('.handover-btn')).not.toBeNull();

				const b = bar()!;
				expect(b.scrollWidth).toBeLessThanOrEqual(b.clientWidth + 1);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
				// The move's button is not in the bar.
				expect(b.querySelector('button.adopt-btn')).toBeNull();

				const controls = controlsOf(b);
				const barBox = box(b);
				for (const c of controls) {
					const r = box(c);
					expect(r.left, c.outerHTML.slice(0, 80)).toBeGreaterThanOrEqual(barBox.left - 0.5);
					expect(r.right, c.outerHTML.slice(0, 80)).toBeLessThanOrEqual(barBox.right + 0.5);
					if (c.tagName === 'BUTTON')
						expect(c.scrollWidth, c.outerHTML.slice(0, 80)).toBeLessThanOrEqual(c.clientWidth + 1);
				}
				for (let i = 0; i < controls.length; i++)
					for (let j = i + 1; j < controls.length; j++)
						expect(
							overlap(box(controls[i]), box(controls[j])),
							`${controls[i].outerHTML.slice(0, 60)} / ${controls[j].outerHTML.slice(0, 60)}`
						).toBe(false);

				const strip = document.querySelector<HTMLElement>('.volume-notices')!;
				const button = strip.querySelector<HTMLButtonElement>('button.adopt-btn')!;
				const desc = strip.querySelector<HTMLElement>('.adopt-row-desc')!;
				expect(desc.textContent).toBe(msgs.adopt_action_desc);
				expect(box(strip).right).toBeLessThanOrEqual(w + 0.5);
				expect(box(button).right).toBeLessThanOrEqual(box(strip).right + 0.5);
				expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
				expect(box(button).height).toBeGreaterThanOrEqual(44);
				expect(overlap(box(button), box(desc))).toBe(false);
				expect(strip.scrollHeight).toBeLessThanOrEqual(strip.clientHeight + 1);
			});
		}
	}
}

// Fisqua configured, the volume never sent: the bar's second status line.
const NOT_SENT = { environment: 'production', config_error: null, outbox: [], status: null };

const px = (v: string) => parseFloat(v) || 0;

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		for (const withStrip of [true, false]) {
			it(`at ${w}x${h}, ${lang}, two status lines, ${withStrip ? 'with' : 'without'} the strip's row: the lines stay in the bar and the strip has the bar's insets`, async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
				if (!withStrip)
					nav.data = {
						...nav.data,
						collectionAdoption: { ...(nav.data.collectionAdoption as object), external_id: 'fq-1' }
					};
				stubFetch(true, NOT_SENT);
				render(VolumePageHost);
				const bar = () => document.querySelector<HTMLElement>('.topbar')!;
				await expect
					.poll(() => bar().querySelector('[data-fisqua]')?.textContent)
					.toContain(msgs.fisqua_out_none);
				await expect
					.poll(() => bar().querySelector('.offsite-indicator.offsite-received'))
					.not.toBeNull();
				await expect.poll(() => bar().querySelector('.offsite-manage-btn')).not.toBeNull();
				await expect.poll(() => bar().querySelector('.handover-btn')).not.toBeNull();
				await expect.poll(() => bar().querySelector('.btn-camera')).not.toBeNull();
				const strip = document.querySelector<HTMLElement>('.volume-notices')!;
				if (withStrip)
					await expect.poll(() => strip.querySelector('button.adopt-btn')).not.toBeNull();

				const b = bar();
				const barBox = box(b);
				const barCs = getComputedStyle(b);
				const inner = {
					top: barBox.top + px(barCs.borderTopWidth),
					bottom: barBox.bottom - px(barCs.borderBottomWidth)
				};
				const stripBox = box(strip);
				const stripHolds = strip.children.length > 0;
				expect(stripHolds).toBe(withStrip);

				// (a) Every status line under the breadcrumb, and its text, inside the bar and clear of the strip.
				const lines = [
					...b.querySelectorAll<HTMLElement>(
						'.topbar-title .breadcrumb, .topbar-title .offsite-indicator, .topbar-title .offsite-indicator-text'
					)
				].filter(visible);
				expect(lines.length).toBeGreaterThanOrEqual(5);
				for (const line of lines) {
					const r = box(line);
					const what = `${line.className} [${r.top.toFixed(1)}, ${r.bottom.toFixed(1)}] in bar [${inner.top.toFixed(1)}, ${inner.bottom.toFixed(1)}]`;
					expect(r.top, what).toBeGreaterThanOrEqual(inner.top - 0.5);
					expect(r.bottom, what).toBeLessThanOrEqual(inner.bottom + 0.5);
					if (stripHolds) expect(overlap(r, stripBox), `${what} / strip`).toBe(false);
				}
				expect(b.scrollHeight).toBeLessThanOrEqual(b.clientHeight + 1);

				if (!withStrip) return;

				// (b) The strip's content has the bar's side insets, and the strip a top and bottom padding.
				const barLeft = box(b.querySelector('.btn-back')!).left - barBox.left;
				const barRight = barBox.right - box(b.querySelector('.topbar-right')!).right;
				const stripCs = getComputedStyle(strip);
				const rows = [...strip.children].filter(
					(el) => visible(el) && getComputedStyle(el).position !== 'fixed'
				);
				expect(rows.length).toBeGreaterThan(0);
				for (const row of rows) {
					const r = box(row);
					const what = `${row.className}: left ${(r.left - stripBox.left).toFixed(1)}, right ${(stripBox.right - r.right).toFixed(1)}; bar ${barLeft.toFixed(1)}, ${barRight.toFixed(1)}`;
					expect(Math.abs(r.left - stripBox.left - barLeft), what).toBeLessThanOrEqual(1);
					expect(Math.abs(stripBox.right - r.right - barRight), what).toBeLessThanOrEqual(1);
				}
				expect(px(stripCs.paddingTop)).toBeGreaterThan(0);
				expect(px(stripCs.paddingBottom)).toBeGreaterThan(0);
				expect(px(stripCs.borderBottomWidth)).toBeGreaterThan(0);
				expect(stripBox.top).toBeGreaterThanOrEqual(barBox.bottom - 0.5);

				// (c) Nothing in the strip is clipped.
				expect(strip.scrollHeight).toBeLessThanOrEqual(strip.clientHeight + 1);
				expect(strip.scrollWidth).toBeLessThanOrEqual(strip.clientWidth + 1);
				for (const el of strip.querySelectorAll<HTMLElement>('p, span, button')) {
					if (!visible(el)) continue;
					const r = box(el);
					const what = el.outerHTML.slice(0, 60);
					expect(r.left, what).toBeGreaterThanOrEqual(stripBox.left - 0.5);
					expect(r.right, what).toBeLessThanOrEqual(stripBox.right + 0.5);
					expect(r.top, what).toBeGreaterThanOrEqual(stripBox.top - 0.5);
					expect(r.bottom, what).toBeLessThanOrEqual(stripBox.bottom + 0.5);
					if (getComputedStyle(el).display !== 'inline')
						expect(el.scrollWidth, what).toBeLessThanOrEqual(el.clientWidth + 1);
				}
			});
		}
	}
}

// GET /system/adoption: a move from this volume (7) left half done, one file missing.
const MISSING = 'src-img_0003_c1.cr2';
function halfDone(repair: boolean) {
	return {
		unfinished: {
			source: { id: 7, name: 'Volumen de prueba', filename_stem: 'src' },
			target: { id: 8, name: 'Volumen 009 (prueba)', filename_stem: 'tgt' },
			state: 'blocked',
			reason: 'file_at_neither_path',
			missing: [{ kind: 'master', name: MISSING, repairable: repair, why_not: null }],
			repair_available: repair,
			repair_refusal: repair ? null : 'no_read_remote',
			run_id: 'run-1'
		},
		running: null
	};
}

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		for (const repair of [true, false]) {
			it(`at ${w}x${h}, ${lang}, the notice of a move left half done (repair ${repair ? 'available' : 'not available'}): its heading and the missing file at rest`, async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
				nav.data = {
					...nav.data,
					collectionAdoption: {
						...(nav.data.collectionAdoption as object),
						adoption_unfinished: true
					}
				};
				adoptionReport = halfDone(repair);
				stubFetch(true, NOT_SENT);
				render(VolumePageHost);
				const strip = () => document.querySelector<HTMLElement>('.volume-notices')!;
				await expect.poll(() => strip().querySelector('.notice-title')).not.toBeNull();
				// The rest of the page has arrived: the bar's lines and the strip's row.
				await expect.poll(() => document.querySelector('[data-fisqua]')).not.toBeNull();
				await expect.poll(() => strip().querySelector('button.adopt-btn')).not.toBeNull();
				if (repair)
					await expect
						.poll(() =>
							[...strip().querySelectorAll('button')].some(
								(b) => b.textContent?.trim() === msgs.unsettled_repair
							)
						)
						.toBe(true);
				// Settled: two frames with nothing more to lay out.
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

				const s = strip();
				const sb = box(s);
				const cs = getComputedStyle(s);
				const view = {
					top: sb.top + parseFloat(cs.borderTopWidth),
					bottom: sb.top + parseFloat(cs.borderTopWidth) + s.clientHeight
				};
				const inView = (el: Element, what: string) => {
					const r = box(el);
					const m = `${what} [${r.top.toFixed(1)}, ${r.bottom.toFixed(1)}] in strip [${view.top.toFixed(1)}, ${view.bottom.toFixed(1)}], scrollTop ${s.scrollTop}`;
					expect(r.top, m).toBeGreaterThanOrEqual(view.top - 0.5);
					expect(r.bottom, m).toBeLessThanOrEqual(view.bottom + 0.5);
					expect(r.width, m).toBeGreaterThan(0);
				};
				expect(s.scrollTop).toBe(0);
				const heading = [...s.querySelectorAll('p')].find(
					(p) => p.textContent?.trim() === msgs.unsettled_heading
				)!;
				expect(heading).toBeTruthy();
				inView(heading, 'heading');
				const missing = [...s.querySelectorAll('p')].find(
					(p) => p.textContent?.trim() === msgs.unsettled_missing(MISSING)
				)!;
				expect(missing).toBeTruthy();
				inView(missing, 'missing file');
				if (repair) {
					const button = [...s.querySelectorAll('button')].find(
						(b) => b.textContent?.trim() === msgs.unsettled_repair
					)!;
					inView(button, 'Repair');
					expect(box(button).height).toBeGreaterThanOrEqual(44);
				}
				// Every sentence of the notice is still there, behind the strip's scroll.
				const all = s.textContent ?? '';
				for (const line of [
					msgs.unsettled_what('Volumen de prueba', 'Volumen 009 (prueba)'),
					msgs.unsettled_blocked('Volumen de prueba', 'Volumen 009 (prueba)'),
					repair ? msgs.unsettled_repair_desc : msgs.unsettled_no_repair
				])
					expect(all).toContain(line);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);

				// The move's dialog opened and closed: focus returns to its button, and the strip stays at its top.
				const scrolls: string[] = [];
				s.addEventListener('scroll', () =>
					scrolls.push(`${s.scrollTop} focus=${document.activeElement?.className}`)
				);
				s.querySelector<HTMLButtonElement>('button.adopt-btn')!.click();
				await expect.poll(() => document.querySelector('[role="dialog"]')).not.toBeNull();
				// Cancel while the volumes are read, Close once that read has answered.
				const cancel = [
					...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
				].find((b) =>
					[msgs.common_cancel, msgs.common_close].includes(b.textContent?.trim() ?? '')
				)!;
				cancel.click();
				await expect.poll(() => document.activeElement?.classList.contains('adopt-btn')).toBe(true);
				await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
				expect(s.scrollTop, scrolls.join(' | ')).toBe(0);
			});
		}
	}
}

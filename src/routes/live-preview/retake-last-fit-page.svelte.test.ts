// NEH-388: "Retake the last opening" and its confirmation, on the real page
// with app.css, at the unit's 800x480 screen (the floating controls folded)
// and at 1280x800, in both languages, on a DSLR unit without a continuous
// preview, so that "Refocus" and "Refresh preview" both sit beside the
// capture button. Each lies inside the board, its buttons are at least 44px
// tall, and none overlaps the capture button, "Refocus", "Refresh preview"
// or the floating controls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

const current = vi.hoisted(() => ({ url: '' }));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			return () => {};
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { recordFocusActivity } from '$lib/focus-check';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const records: Record<string, unknown>[] = [];

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (path.endsWith('/collections/9'))
			return json({
				id: 9,
				name: 'Tomo 6',
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: 'co-ahr-6',
				custom_attributes: null
			});
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/cameras/capabilities'))
			return json({ backend: 'gphoto2', dslr_settings: true, continuous_preview: false });
		if (path.endsWith('/records/')) return json(records);
		if (path.endsWith('/cameras/capture/dual')) {
			const id = 600 + records.length;
			records.push({
				id,
				title: `Par ${id}`,
				status: 'captured',
				sequence: records.length + 1,
				capture_mode: 'dual',
				collection_id: 9,
				images: [id * 10, id * 10 + 1].map((imageId, i) => ({
					id: imageId,
					record_id: id,
					filename: `${imageId}.jpg`,
					file_path: `/${imageId}`,
					format: 'jpg',
					role: i === 0 ? 'left' : 'right',
					is_current: true
				}))
			});
			return json({ success: true, record_id: id, image_ids: [id * 10, id * 10 + 1] });
		}
		return json([]);
	});
}

beforeEach(() => {
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	records.length = 0;
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
	recordFocusActivity(1, Date.now() + 60 * 60 * 1000);
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

const rect = (el: Element) => el.getBoundingClientRect();
const overlaps = (a: DOMRect, b: DOMRect) =>
	a.left < b.right - 0.5 &&
	b.left < a.right - 0.5 &&
	a.top < b.bottom - 0.5 &&
	b.top < a.bottom - 0.5;

function clearOfEverything(el: Element) {
	const r = rect(el);
	const board = rect(document.querySelector('.mat-board')!);
	expect(r.left).toBeGreaterThanOrEqual(board.left - 0.5);
	expect(r.right).toBeLessThanOrEqual(board.right + 0.5);
	expect(r.top).toBeGreaterThanOrEqual(board.top - 0.5);
	expect(r.bottom).toBeLessThanOrEqual(board.bottom + 0.5);
	for (const sel of [
		'button.capture-btn',
		'.refocus-btn',
		'.refresh-preview-btn',
		'.floating-controls'
	]) {
		const other = document.querySelector(sel);
		expect(other, sel).not.toBeNull();
		expect(overlaps(r, rect(other!)), sel).toBe(false);
	}
	for (const b of el.matches('button') ? [el] : [...el.querySelectorAll('button')])
		expect(rect(b).height).toBeGreaterThanOrEqual(44);
}

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		describe(`Retake the last opening at ${w}x${h}, ${lang} (NEH-388)`, () => {
			it('the button and its confirmation fit beside the capture button', async () => {
				locale.set(lang);
				await browserPage.viewport(w, h);
				const screen = render(LivePreview);
				const capture = screen.getByRole('button', { name: msgs.lv_capture_btn, exact: true });
				await expect.element(capture).toBeEnabled();
				await expect
					.element(screen.getByRole('button', { name: msgs.lv_refresh_preview, exact: true }))
					.toBeVisible();
				await expect
					.element(screen.getByRole('button', { name: msgs.focus_refocus, exact: true }))
					.toBeVisible();
				await capture.click();
				await expect.poll(() => records.length).toBe(1);
				await expect.poll(() => document.querySelectorAll('.thumbnail-item').length).toBe(1);

				const button = screen.getByRole('button', {
					name: msgs.lv_retake_last(false),
					exact: true
				});
				await expect.element(button).toBeEnabled();
				clearOfEverything(button.element());
				const b = rect(button.element());
				if (w === 800) expect(document.querySelector('.floating-controls.folded')).not.toBeNull();

				await button.click();
				const confirm = screen.getByRole('button', { name: msgs.common_confirm, exact: true });
				await expect.element(confirm).toBeVisible();
				const box = document.querySelector('.retake-last-confirm')!;
				expect(box.textContent).toContain(msgs.lvm_retake_confirm);
				clearOfEverything(box);
				// Nothing inside it is cut off.
				expect((box as HTMLElement).scrollHeight).toBeLessThanOrEqual(
					(box as HTMLElement).clientHeight + 1
				);
				console.log(
					`[retake-last fit ${w}x${h} ${lang}] button ${b.width.toFixed(0)}x${b.height.toFixed(0)}, confirmation ${rect(box).width.toFixed(0)}x${rect(box).height.toFixed(0)}`
				);
			});
		});
	}
}

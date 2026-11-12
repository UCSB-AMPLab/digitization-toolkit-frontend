// The capture screen on a unit without a continuous preview (NEH-334): while
// a retake started from the image dialog is being captured, "Refresh
// preview" in the viewport is disabled, so no preview frame is asked of the
// cameras in the middle of the capture. It is enabled again once the
// capture has answered, whether it succeeded or failed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

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
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((yes) => { resolve = yes; });
	return { promise, resolve };
}

const record = { id: 41, title: 'Par 1', status: 'rejected', sequence: 1, capture_mode: 'single', collection_id: 9, images: [] };

// Answers the capture POST through `capture`, set by each test, so the test
// decides when it returns and with what.
function serve(capture: () => Promise<Response>) {
	const captures: number[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/capabilities')) {
			return json({ backend: 'gphoto2', live_preview: true, focus_control: false, live_controls: false, zoom: false, autofocus_calibration: false, dslr_settings: true, continuous_preview: false });
		}
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (path.endsWith('/records/to-retake/summary')) {
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		}
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json([record]);
		if (path.endsWith('/cameras/capture')) {
			captures.push(1);
			return capture();
		}
		return json([]);
	});
	return captures;
}

const refreshButton = () => document.querySelector('.refresh-preview-btn') as HTMLButtonElement | null;

beforeEach(() => {
	locale.set('es');
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9&recordId=41';
	authStore.setSession({ id: 1, username: 'operator', email: null, role: 'operator', is_active: true });
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('capture screen: "Refresh preview" during a retake (NEH-334)', () => {
	for (const outcome of ['success', 'failure'] as const) {
		it(`is disabled while the retake is captured and enabled after its ${outcome}`, async () => {
			const answer = deferred<Response>();
			const captures = serve(() => answer.promise);
			const screen = render(LivePreview);
			await expect.poll(() => refreshButton()?.disabled).toBe(false);

			const dialog = screen.getByRole('dialog');
			await dialog.getByRole('button', { name: es.lvm_retake }).click();
			await dialog.getByRole('button', { name: 'Confirmar' }).click();
			await expect.poll(() => captures.length).toBe(1);
			expect(refreshButton()?.disabled).toBe(true);

			answer.resolve(
				outcome === 'success'
					? json({ success: true, record_id: 41, image_ids: [] })
					: json({ detail: 'Camera 0 is not connected' }, 500)
			);
			await expect.poll(() => refreshButton()?.disabled).toBe(false);
		});
	}
});

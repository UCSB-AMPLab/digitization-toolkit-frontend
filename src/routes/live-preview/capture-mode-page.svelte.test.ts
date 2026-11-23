// NEH-225: the capture screen opens a volume in the mode of its last record
// in sequence (two-camera mode for an empty volume, or a last record without
// a usable capture_mode). A choice the operator makes with the radios holds
// on that volume: no later read of the records changes it. Another volume
// applies the rule again. The mode is observed through the capture the
// capture button sends (/cameras/capture or /cameras/capture/dual).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const current = vi.hoisted(() => {
	const subs = new Set<(v: { url: URL }) => void>();
	return {
		url: '',
		subs,
		set(url: string) {
			this.url = url;
			for (const run of subs) run({ url: new URL(url) });
		}
	};
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			current.subs.add(run);
			return () => current.subs.delete(run);
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { cameraStatus } from '$lib/stores/cameras';
import { recordFocusActivity } from '$lib/focus-check';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

type Rec = {
	id: number;
	title: string;
	status: string;
	sequence: number;
	capture_mode: string | null;
	collection_id: number;
	images: unknown[];
	missing_side: null;
};

function rec(id: number, sequence: number, mode: string | null, collection = 9): Rec {
	return {
		id,
		title: `Rec ${id}`,
		status: 'captured',
		sequence,
		capture_mode: mode,
		collection_id: collection,
		images: [],
		missing_side: null
	};
}

const served = {
	byVolume: {} as Record<string, Rec[]>,
	// The mode of the record a new capture adds: what the next read lists last.
	appendMode: 'dual',
	captures: [] as string[],
	recordReads: 0
};

function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(String(input), 'http://localhost');
		const path = url.pathname;
		if (path.endsWith('/records/to-retake/summary'))
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (/\/collections\/\d+$/.test(path)) {
			const id = Number(path.split('/').pop());
			return json({
				id,
				name: `Tomo ${id}`,
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: `stem-${id}`,
				custom_attributes: null
			});
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/cameras/capabilities')) return json({});
		if (path.endsWith('/records/')) {
			served.recordReads++;
			return json(served.byVolume[url.searchParams.get('collection_id') ?? ''] ?? []);
		}
		if (path.endsWith('/cameras/capture') || path.endsWith('/cameras/capture/dual')) {
			served.captures.push(path.endsWith('/dual') ? 'dual' : 'single');
			const body = JSON.parse(String(init?.body ?? '{}')) as { record_id?: number };
			if (typeof body.record_id === 'number') {
				const retaken = body.record_id;
				return json({ success: true, record_id: retaken, image_ids: [retaken * 10 + 1] });
			}
			const list = (served.byVolume['9'] ??= []);
			const id = 700 + served.captures.length;
			list.push(rec(id, Math.max(0, ...list.map((r) => r.sequence)) + 1, served.appendMode));
			return json({ success: true, record_id: id, image_ids: [id * 10] });
		}
		return json([]);
	});
}

beforeEach(() => {
	locale.set('en');
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	current.subs.clear();
	served.byVolume = {};
	served.appendMode = 'dual';
	served.captures = [];
	served.recordReads = 0;
	try {
		localStorage.clear();
	} catch {
		// Nothing to clear.
	}
	cameraStatus.reportSuccess();
	authStore.setSession({
		id: 1,
		username: 'operator',
		email: null,
		role: 'operator',
		is_active: true
	});
	recordFocusActivity(1, Date.now() + 60 * 60 * 1000);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	cameraStatus.reportSuccess();
});

const captureButton = () => document.querySelector('button.capture-btn') as HTMLButtonElement;

async function ready() {
	await vi.waitFor(() => expect(captureButton()?.disabled).toBe(false));
}

// Presses the capture button and returns the mode the capture was sent in.
async function captureMode(): Promise<string> {
	const n = served.captures.length;
	captureButton().click();
	await vi.waitFor(() => expect(served.captures).toHaveLength(n + 1));
	await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
	return served.captures[n];
}

async function chooseMode(name: string) {
	const expand = document.querySelector(
		`button[aria-label="${en.cam_panel_expand_aria}"]`
	) as HTMLButtonElement | null;
	expand?.click();
	await vi.waitFor(() =>
		expect(
			[...document.querySelectorAll('label.radio-label')].find((l) => l.textContent?.includes(name))
		).toBeTruthy()
	);
	const label = [...document.querySelectorAll<HTMLLabelElement>('label.radio-label')].find((l) =>
		l.textContent?.includes(name)
	)!;
	label.click();
}

describe('capture mode from the volume (NEH-225)', () => {
	it('opens in single-camera mode when the last record in sequence is single', async () => {
		// Listed by id: the dual record comes last in the list but first in sequence.
		served.byVolume['9'] = [rec(50, 2, 'single'), rec(60, 1, 'dual')];
		serve();
		render(LivePreview);
		await ready();
		expect(await captureMode()).toBe('single');
	});

	it('opens in two-camera mode when the last record in sequence is dual (guard: two-camera mode is also the old default)', async () => {
		served.byVolume['9'] = [rec(50, 2, 'dual'), rec(60, 1, 'single')];
		serve();
		render(LivePreview);
		await ready();
		expect(await captureMode()).toBe('dual');
	});

	it('opens an empty volume in two-camera mode (guard: the old default)', async () => {
		served.byVolume['9'] = [];
		serve();
		render(LivePreview);
		await ready();
		await vi.waitFor(() => expect(served.recordReads).toBeGreaterThan(0));
		expect(await captureMode()).toBe('dual');
	});

	it('opens in two-camera mode when the last record has no usable capture_mode (guard: the old default)', async () => {
		served.byVolume['9'] = [rec(50, 1, 'single'), rec(60, 2, null)];
		serve();
		render(LivePreview);
		await ready();
		expect(await captureMode()).toBe('dual');
	});

	// Guards: the screen never set the mode from a read before, so no version of
	// these can fail on the old code; they fail on a rule applied at every read.
	it("keeps the operator's choice after the records are read again after a capture (guard)", async () => {
		served.byVolume['9'] = [rec(50, 1, 'dual')];
		// The read after each capture lists a dual record last.
		served.appendMode = 'dual';
		serve();
		render(LivePreview);
		await ready();
		await chooseMode(en.cam_mode_single);
		const reads = served.recordReads;
		expect(await captureMode()).toBe('single');
		await vi.waitFor(() => expect(served.recordReads).toBeGreaterThan(reads));
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		expect(await captureMode()).toBe('single');
	});

	it('applies the rule again on another volume', async () => {
		served.byVolume['9'] = [rec(50, 1, 'dual')];
		served.byVolume['10'] = [rec(80, 1, 'single', 10)];
		serve();
		render(LivePreview);
		await ready();
		expect(await captureMode()).toBe('dual');
		const reads = served.recordReads;
		current.set('http://localhost/live-preview?projectId=2&collectionId=10');
		await vi.waitFor(() => expect(served.recordReads).toBeGreaterThan(reads));
		await ready();
		expect(await captureMode()).toBe('single');
	});

	it("does not carry the operator's choice to another volume", async () => {
		served.byVolume['9'] = [rec(50, 1, 'dual')];
		served.byVolume['10'] = [rec(80, 1, 'dual', 10)];
		serve();
		render(LivePreview);
		await ready();
		await chooseMode(en.cam_mode_single);
		expect(await captureMode()).toBe('single');
		const reads = served.recordReads;
		current.set('http://localhost/live-preview?projectId=2&collectionId=10');
		await vi.waitFor(() => expect(served.recordReads).toBeGreaterThan(reads));
		await ready();
		expect(await captureMode()).toBe('dual');
	});
	it('keeps a choice of two-camera mode when the read after a capture lists a single record last (guard)', async () => {
		served.byVolume['9'] = [rec(50, 1, 'single')];
		served.appendMode = 'single';
		serve();
		render(LivePreview);
		await ready();
		expect(await captureMode()).toBe('single');
		await chooseMode(en.cam_mode_double);
		const reads = served.recordReads;
		expect(await captureMode()).toBe('dual');
		await vi.waitFor(() => expect(served.recordReads).toBeGreaterThan(reads));
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		expect(await captureMode()).toBe('dual');
	});
});

describe('a retake is sent in the mode of the record retaken (NEH-225)', () => {
	const thumbOf = (title: string) =>
		[...document.querySelectorAll<HTMLButtonElement>('.thumbnail-item')].find((b) =>
			b.getAttribute('aria-label')?.includes(title)
		);

	async function retakeFromThumbnail(title: string) {
		await vi.waitFor(() => expect(thumbOf(title)?.disabled).toBe(false));
		const n = served.captures.length;
		thumbOf(title)!.click();
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
		const dialogButton = (name: string) =>
			[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
				(b) => b.textContent?.trim().endsWith(name) && !b.disabled
			);
		await vi.waitFor(() => expect(dialogButton(en.lvm_retake)).toBeTruthy());
		dialogButton(en.lvm_retake)!.click();
		await vi.waitFor(() => expect(dialogButton(en.common_confirm)).toBeTruthy());
		dialogButton(en.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(n + 1));
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
		return served.captures[n];
	}

	it('retakes an older dual record in a volume opened in single-camera mode with a dual capture', async () => {
		served.byVolume['9'] = [rec(60, 1, 'dual'), rec(50, 2, 'single')];
		serve();
		render(LivePreview);
		await ready();
		expect(await retakeFromThumbnail('Rec 60')).toBe('dual');
		// The screen follows the record opened, as a retake opened from the guide does.
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		expect(await captureMode()).toBe('dual');
	});

	it('retakes an older single record in a volume opened in two-camera mode with a single capture', async () => {
		served.byVolume['9'] = [rec(60, 1, 'single'), rec(50, 2, 'dual')];
		serve();
		render(LivePreview);
		await ready();
		expect(await retakeFromThumbnail('Rec 60')).toBe('single');
	});
});

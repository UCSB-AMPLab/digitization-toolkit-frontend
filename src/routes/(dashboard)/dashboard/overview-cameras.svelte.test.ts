// NEH-379: the Overview's camera rows name each camera from the confirmed
// set-up, which the device list carries per camera: the camera with role
// `right` (the odd/recto page) is the left camera, the one with role `left`
// the right camera. Without a confirmed set-up the rows say "Camera 1"
// and "Camera 2", by index.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraDevice } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import { cameraKindApi } from '$lib/api';
import Overview from './+page.svelte';
import {
	BOTH,
	immediateScheduler,
	manualScheduler,
	serveOverview,
	signIn
} from './overview-fixtures';
import { setDeviceRetryScheduler } from '$lib/camera-orientation';

function device(index: number, over: Partial<CameraDevice> = {}): CameraDevice {
	return {
		index,
		hardware_id: `hw${index}`,
		model: 'Canon PowerShot A2500',
		calibrated: false,
		role: null,
		role_confirmed: false,
		...over
	};
}

const names = () => [...document.querySelectorAll('.cam-name')].map((n) => n.textContent?.trim());
// The missing-camera notice's sentence, in "Needs attention".
const hint = () =>
	document.querySelector('[data-attention-notice] .notice-body')?.textContent ?? '';

beforeEach(() => {
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
	setDeviceRetryScheduler(immediateScheduler);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	locale.set('es');
});

describe('Overview: camera names', () => {
	it('with a confirmed set-up: camera 1 photographs the odd/recto page, so it is the left camera', async () => {
		locale.set('en');
		vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([
			device(0, { role: 'right', role_confirmed: true }),
			device(1, { role: 'left', role_confirmed: true })
		]);
		render(Overview);
		await expect.poll(() => names()).toEqual([en.dash_camera_right, en.dash_camera_left]);
		expect(names()).toEqual(['Left camera', 'Right camera']);
	});

	it('with the roles the other way round, in Spanish', async () => {
		locale.set('es');
		vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([
			device(0, { role: 'left', role_confirmed: true }),
			device(1, { role: 'right', role_confirmed: true })
		]);
		render(Overview);
		await expect.poll(() => names()).toEqual(['Cámara derecha', 'Cámara izquierda']);
	});

	it('without a confirmed set-up: Camera 1 and Camera 2', async () => {
		locale.set('en');
		vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([
			device(0),
			device(1, { role: 'left', role_confirmed: true })
		]);
		render(Overview);
		await expect.poll(() => names()).toEqual([en.dash_camera_n(1), en.dash_camera_n(2)]);
		expect(names()).toEqual(['Camera 1', 'Camera 2']);
	});

	it('a camera not detected is named by its number in the hint', async () => {
		locale.set('es');
		vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([
			device(0, { role: 'right', role_confirmed: true })
		]);
		render(Overview);
		await expect.poll(() => hint()).toContain(es.dash_camera_missing_hint(es.dash_camera_n(2)));
		expect(names()).toEqual(['Cámara 1', 'Cámara 2']);
	});
});

// NEH-351: the camera block links to the capture screen's set-up view with
// the camera check open, for admin and operator; a reviewer has no camera
// block, and the testing account has an Overview of its own.
describe('Overview: Check cameras', () => {
	const link = () =>
		[...document.querySelectorAll<HTMLAnchorElement>('a')].find((a) =>
			a.textContent?.trim().endsWith(es.camcheck_open)
		);

	for (const role of ['admin', 'operator'] as const) {
		it(`${role}: the camera block links to the camera check with no volume`, async () => {
			locale.set('es');
			authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
			vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0), device(1)]);
			render(Overview);
			await expect.poll(() => link()?.getAttribute('href')).toBe('/live-preview?check=1');
		});
	}

	for (const role of ['reviewer', 'testing'] as const) {
		it(`${role}: no link to the camera check`, async () => {
			locale.set('es');
			authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
			vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([device(0), device(1)]);
			render(Overview);
			await expect.poll(() => document.querySelector('.page') !== null).toBe(true);
			await expect.poll(() => document.querySelector('h1, h2') !== null).toBe(true);
			expect(link()).toBeUndefined();
		});
	}
});

// NEH-422: right after a start the unit can answer the first device request
// before it has found or identified both cameras (an empty list, bodies at
// temporary indices, a placeholder id, a failed request). Such a list is not
// evidence that a camera is missing: the rows stay at "—", no notice and no
// Reconnect show, and the page reads the list again after 1, 2, 4 and 8 s,
// stopping at the first complete list. After the last read the page shows
// what that list says.
describe('Overview: a device list that is not complete yet', () => {
	const rows = () =>
		[...document.querySelectorAll('[data-camera-row]')].map((r) =>
			r.querySelector('.cam-badge')?.textContent?.replace(/\s+/g, ' ').trim()
		);
	const notices = () => document.querySelectorAll('[data-attention-notice]').length;
	const reconnects = () =>
		[...document.querySelectorAll('button')].filter(
			(b) => b.textContent?.trim() === es.dash_camera_reconnect
		);
	const title = () =>
		document.querySelector('[data-attention-notice] .notice-title')?.textContent?.trim() ?? '';
	const LATE = [device(2), device(3)];

	function setUp(first: () => Promise<CameraDevice[]>) {
		locale.set('es');
		signIn('admin');
		const timers = manualScheduler();
		const served = serveOverview('ok', { scheduler: timers.scheduler });
		served.listDevices.mockImplementationOnce(first);
		return { timers, served };
	}

	// The page has had the first answer and armed its first wait.
	async function waiting(timers: ReturnType<typeof manualScheduler>, ms: number) {
		await expect.poll(() => timers.armed()).toEqual([ms]);
	}

	async function notCompleteThenComplete(first: () => Promise<CameraDevice[]>) {
		const { timers, served } = setUp(first);
		render(Overview);
		await waiting(timers, 1000);
		expect(rows()).toEqual(['—', '—']);
		expect(notices()).toBe(0);
		expect(reconnects()).toHaveLength(0);
		expect(served.listDevices).toHaveBeenCalledTimes(1);
		timers.fire();
		await expect.poll(rows).toEqual(['OK', 'OK']);
		expect(served.listDevices).toHaveBeenCalledTimes(2);
		expect(timers.armed()).toEqual([]);
		expect(notices()).toBe(0);
	}

	it('both bodies at indices 2 and 3, then at 0 and 1: no notice until OK, one more read', async () => {
		await notCompleteThenComplete(async () => LATE);
	});

	it('an empty list, then a complete one', async () => {
		await notCompleteThenComplete(async () => []);
	});

	it('a failed request, then a complete list', async () => {
		await notCompleteThenComplete(async () => {
			throw new Error('down');
		});
	});

	it('a placeholder id, then a complete list', async () => {
		await notCompleteThenComplete(async () => [
			device(0, { hardware_id: 'Canon_PowerShot_A2500_idx0' }),
			device(1)
		]);
	});

	it('a complete first list: nothing is read again', async () => {
		const { timers, served } = setUp(async () => BOTH);
		render(Overview);
		await expect.poll(rows).toEqual(['OK', 'OK']);
		await expect.poll(() => vi.mocked(cameraKindApi.get).mock.settledResults.length).toBe(1);
		expect(timers.history()).toEqual([]);
		expect(served.listDevices).toHaveBeenCalledTimes(1);
	});

	it('never complete: exactly four more reads, then the notice the last list calls for', async () => {
		const { timers, served } = setUp(async () => []);
		served.listDevices
			.mockResolvedValueOnce(LATE)
			.mockRejectedValueOnce(new Error('down'))
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([device(0)]);
		render(Overview);
		for (const [i, ms] of [1000, 2000, 4000, 8000].entries()) {
			await waiting(timers, ms);
			expect(served.listDevices).toHaveBeenCalledTimes(i + 1);
			expect(notices()).toBe(0);
			expect(rows()).toEqual(['—', '—']);
			timers.fire();
		}
		await expect.poll(title).toBe(es.dash_camera_missing_title);
		expect(rows()).toEqual(['OK', es.camera_not_detected]);
		expect(served.listDevices).toHaveBeenCalledTimes(5);
		expect(timers.history()).toEqual([1000, 2000, 4000, 8000]);
		expect(timers.armed()).toEqual([]);
	});

	it('never answering: after the last retry, the notice for no camera', async () => {
		const { timers, served } = setUp(async () => {
			throw new Error('down');
		});
		served.listDevices.mockRejectedValue(new Error('down'));
		render(Overview);
		for (const ms of [1000, 2000, 4000, 8000]) {
			await waiting(timers, ms);
			expect(notices()).toBe(0);
			timers.fire();
		}
		await expect.poll(title).toBe(es.dash_cameras_none_title);
		expect(served.listDevices).toHaveBeenCalledTimes(5);
		expect(reconnects()).toHaveLength(2);
	});

	it('a reconnect starts a fresh sequence, from the first delay, reading the device list', async () => {
		const { timers, served } = setUp(async () => []);
		served.listDevices.mockResolvedValue([]);
		render(Overview);
		for (const ms of [1000, 2000, 4000, 8000]) {
			await waiting(timers, ms);
			timers.fire();
		}
		await expect.poll(title).toBe(es.dash_cameras_none_title);
		served.rescan.mockResolvedValueOnce(LATE);
		served.listDevices.mockResolvedValueOnce(BOTH);
		reconnects()[0].click();
		await waiting(timers, 1000);
		expect(served.rescan).toHaveBeenCalledTimes(1);
		expect(rows()).toEqual(['—', '—']);
		expect(notices()).toBe(0);
		timers.fire();
		await expect.poll(rows).toEqual(['OK', 'OK']);
		expect(served.rescan).toHaveBeenCalledTimes(1);
		expect(served.listDevices).toHaveBeenCalledTimes(6);
		expect(timers.armed()).toEqual([]);
	});

	it('after a reconnect, no wait of the sequence before it reads again', async () => {
		// No Reconnect shows while a list is not complete, so this reconnect
		// is the one the end of a sequence offers; the earlier sequence's
		// callbacks are then run by hand, and none of them may read.
		const { timers, served } = setUp(async () => [device(0)]);
		served.listDevices.mockResolvedValue([device(0)]);
		render(Overview);
		for (const ms of [1000, 2000, 4000, 8000]) {
			await waiting(timers, ms);
			timers.fire();
		}
		await expect.poll(title).toBe(es.dash_camera_missing_title);
		let finish!: (v: CameraDevice[]) => void;
		served.rescan.mockImplementationOnce(() => new Promise((r) => (finish = r)));
		reconnects()[0].click();
		await expect.poll(() => served.rescan.mock.calls.length).toBe(1);
		finish(BOTH);
		await expect.poll(rows).toEqual(['OK', 'OK']);
		timers.fireAll();
		await expect.poll(() => vi.mocked(cameraKindApi.get).mock.settledResults.length).toBe(2);
		expect(served.listDevices).toHaveBeenCalledTimes(5);
		expect(rows()).toEqual(['OK', 'OK']);
	});

	it('destroyed during the sequence: the wait is cleared and nothing more is requested', async () => {
		const { timers, served } = setUp(async () => LATE);
		const screen = render(Overview);
		await waiting(timers, 1000);
		screen.unmount();
		expect(timers.armed()).toEqual([]);
		timers.fireAll();
		// A later point the forbidden read would have preceded: another page's
		// first read resolves after it.
		const other = render(Overview);
		await expect.poll(() => served.listDevices.mock.calls.length).toBe(2);
		other.unmount();
		expect(served.listDevices).toHaveBeenCalledTimes(2);
	});

	it('the document hidden: the read waits until it is visible again', async () => {
		const { timers, served } = setUp(async () => LATE);
		let state: DocumentVisibilityState = 'visible';
		const vis = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
		render(Overview);
		await waiting(timers, 1000);
		state = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		// A read starts within the timer's callback, so a read that did not
		// wait would already have been asked for here.
		timers.fire();
		expect(served.listDevices).toHaveBeenCalledTimes(1);
		expect(rows()).toEqual(['—', '—']);
		state = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(rows).toEqual(['OK', 'OK']);
		expect(served.listDevices).toHaveBeenCalledTimes(2);
		vis.mockRestore();
	});

	it('a reviewer makes no camera request', async () => {
		locale.set('es');
		signIn('reviewer');
		const timers = manualScheduler();
		const served = serveOverview('ok', { scheduler: timers.scheduler });
		served.listDevices.mockResolvedValue(LATE);
		render(Overview);
		await expect.poll(() => document.querySelector('.kpi-number')?.textContent).not.toBe('—');
		expect(served.listDevices).not.toHaveBeenCalled();
		expect(served.rescan).not.toHaveBeenCalled();
		expect(timers.history()).toEqual([]);
	});
});

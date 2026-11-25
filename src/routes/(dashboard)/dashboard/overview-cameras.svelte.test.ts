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
import Overview from './+page.svelte';

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

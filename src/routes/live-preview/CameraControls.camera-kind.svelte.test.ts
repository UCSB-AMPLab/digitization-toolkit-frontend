// NEH-252/348: "Reconnect cameras" in the capture screen's camera panel
// reads the kind of camera again, so the notice under the top bar follows
// the cameras now connected.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { cameraKindApi, camerasApi, type CameraKindWire } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetCameraKind } from '$lib/camera-kind';
import CameraControls from './CameraControls.svelte';

function wire(over: Partial<CameraKindWire> = {}): CameraKindWire {
	return {
		configured: 'picamera2',
		source: 'last_used',
		stored: null,
		pending_restart: false,
		detected: 'gphoto2',
		connected: { picamera2: 0, gphoto2: 2, chdk: 0 },
		available: { picamera2: true, gphoto2: true, chdk: true },
		mixed: false,
		mismatch: true,
		...over
	};
}

const props = {
	cameraMode: 'double' as const,
	shutterSpeed: '1/125s',
	iso: '100',
	aperture: '5.6',
	onCameraModeChange: vi.fn(),
	onShutterSpeedChange: vi.fn(),
	onIsoChange: vi.fn(),
	onApertureChange: vi.fn()
};

beforeEach(() => {
	locale.set('en');
	authStore.setSession({ id: 1, username: 'op', email: null, role: 'operator', is_active: true });
	vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([]);
	vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(new Error('not needed'));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetCameraKind();
});

describe('camera panel: camera kind', () => {
	it('reads the kind again after Reconnect cameras', async () => {
		const get = vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		vi.spyOn(camerasApi, 'rescan').mockResolvedValue([]);
		const screen = render(CameraControls, props);
		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();
		const before = get.mock.calls.length;
		await screen.getByRole('button', { name: en.cam_reconnect }).click();
		await expect.poll(() => get.mock.calls.length).toBe(before + 1);
	});
});

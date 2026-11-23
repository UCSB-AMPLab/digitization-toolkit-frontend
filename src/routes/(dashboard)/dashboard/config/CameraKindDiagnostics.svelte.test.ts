// NEH-252/348: Settings > Diagnostics shows the camera kind in effect with
// its driver name, the source, the stored choice, the cameras connected of
// each kind and the drivers the unit has, and the notice for cameras of
// another kind; and the Cameras section is reached from the Unit group. A
// backend without GET /system/camera-kind shows only what Diagnostics
// showed before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, cameraKindApi, camerasApi, type CameraKindWire } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { cameraKind, resetCameraKind } from '$lib/camera-kind';
import { get } from 'svelte/store';
import '../../../../app.css';
import UnitSections from './UnitSections.svelte';

function wire(over: Partial<CameraKindWire> = {}): CameraKindWire {
	return {
		configured: 'picamera2',
		source: 'stored',
		stored: 'picamera2',
		pending_restart: false,
		detected: null,
		connected: { picamera2: 0, gphoto2: 2, chdk: null },
		available: { picamera2: true, gphoto2: true, chdk: false },
		mixed: false,
		mismatch: true,
		...over
	};
}

beforeEach(() => {
	locale.set('en');
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue({ backend: 'picamera2' } as never);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetCameraKind();
});

describe('Diagnostics: camera kind', () => {
	it('shows the kind with its driver name, the source, the stored choice, the counts and the drivers', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		const { container } = render(UnitSections, {
			props: { section: 'diagnostics', canManageDrives: true }
		});
		await expect.element(page.getByText(en.diag_camera_kind, { exact: true })).toBeVisible();
		const diag = container.querySelector('[data-camera-kind-diagnostics]')!.textContent!;
		expect(diag).toContain(`${en.camera_kind_picamera2} picamera2`);
		expect(diag).toContain('stored');
		expect(diag).toContain(en.camera_kind_source_stored);
		expect(diag).toMatch(/Canon DSLR cameras gphoto2:\s*2/);
		expect(diag).toMatch(/chdk:\s*not known/);
		expect(diag).toMatch(/picamera2, gphoto2\s*$|picamera2, gphoto2/);
		await expect
			.element(
				page.getByText('This unit is set for Pi cameras, and 2 Canon DSLR cameras are connected.')
			)
			.toBeVisible();
		await expect
			.element(page.getByRole('link', { name: en.camera_kind_notice_link }))
			.toHaveAttribute('href', '/dashboard/config?section=cameras');
	});

	it('shows what it showed before for a backend without the route', async () => {
		const kindGet = vi
			.spyOn(cameraKindApi, 'get')
			.mockRejectedValue(new ApiError('Not Found', undefined, 404));
		const { container } = render(UnitSections, {
			props: { section: 'diagnostics', canManageDrives: true }
		});
		await expect.poll(() => kindGet.mock.calls.length).toBe(1);
		await expect.poll(() => get(cameraKind).status).toBe('absent');
		await expect.element(page.getByText('picamera2', { exact: true })).toBeVisible();
		expect(container.querySelector('[data-camera-kind-diagnostics]')).toBeNull();
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it('renders the Cameras section', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		render(UnitSections, { props: { section: 'cameras', canManageDrives: true } });
		await expect
			.element(page.getByRole('heading', { name: en.config_section_cameras, level: 2 }))
			.toBeVisible();
		await expect
			.element(page.getByRole('group', { name: en.camera_kind_choose_legend }))
			.toBeVisible();
	});
});

// NEH-252/348: the notice for the unit's cameras. One sentence naming both
// kinds when cameras of another kind are connected; for the administrator a
// link to Settings > Cameras, for every other role "Tell the administrator";
// the missing driver said instead when the unit lacks it; its own sentence
// for cameras of two kinds; nothing for a count that could not be measured,
// nor for a backend without the route. The screens that show it read the
// kind (loadCameraKind); the notice only reads the store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, cameraKindApi, type CameraKindWire } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { loadCameraKind, resetCameraKind } from '$lib/camera-kind';
import CameraKindNotice from './CameraKindNotice.svelte';

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

const MISMATCH = 'This unit is set for Pi cameras, and 2 Canon DSLR cameras are connected.';

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

beforeEach(() => locale.set('en'));
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetCameraKind();
});

describe('camera kind notice', () => {
	it('names both kinds and links the administrator to Settings > Cameras', async () => {
		signIn('admin');
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		await loadCameraKind();
		render(CameraKindNotice);
		await expect.element(page.getByText(MISMATCH)).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: en.camera_kind_notice_link }))
			.toHaveAttribute('href', '/dashboard/config?section=cameras');
	});

	for (const role of ['operator', 'testing'] as const) {
		it(`tells the ${role} to tell the administrator`, async () => {
			signIn(role);
			vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
			await loadCameraKind();
			const { container } = render(CameraKindNotice);
			await expect.element(page.getByText(MISMATCH)).toBeVisible();
			await expect.element(page.getByText(en.camera_kind_notice_tell_admin)).toBeVisible();
			expect(container.querySelector('a')).toBeNull();
		});
	}

	it('says the unit lacks the driver instead', async () => {
		signIn('operator');
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
			wire({ available: { picamera2: true, gphoto2: false, chdk: true } })
		);
		await loadCameraKind();
		render(CameraKindNotice);
		await expect
			.element(page.getByText(en.camera_kind_no_driver(en.camera_kind_count_gphoto2(2), 2)))
			.toBeVisible();
	});

	it('gives cameras of two kinds their own sentence', async () => {
		signIn('operator');
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
			wire({ connected: { picamera2: 1, gphoto2: 2, chdk: 0 }, mixed: true, mismatch: false })
		);
		await loadCameraKind();
		const { container } = render(CameraKindNotice);
		await expect
			.poll(() =>
				container
					.querySelector('[data-camera-kind-notice]')
					?.getAttribute('data-camera-kind-notice')
			)
			.toBe('mixed');
	});

	it('shows nothing for a count that could not be measured, or without the route', async () => {
		signIn('admin');
		const get = vi
			.spyOn(cameraKindApi, 'get')
			.mockResolvedValue(wire({ connected: { picamera2: 0, gphoto2: null, chdk: null } }));
		await loadCameraKind();
		const first = render(CameraKindNotice);
		await expect.poll(() => get.mock.calls.length).toBe(1);
		await expect.poll(() => first.container.textContent?.trim()).toBe('');
		first.unmount();
		resetCameraKind();
		get.mockRejectedValue(new ApiError('Not Found', undefined, 404));
		await loadCameraKind();
		const second = render(CameraKindNotice);
		await expect.poll(() => get.mock.calls.length).toBe(2);
		expect(second.container.textContent?.trim()).toBe('');
	});
});

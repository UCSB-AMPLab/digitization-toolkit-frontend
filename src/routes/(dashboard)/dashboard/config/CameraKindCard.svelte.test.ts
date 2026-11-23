// NEH-252/348: Settings > Cameras. The kind in effect and why, the cameras
// connected of each kind ("not known" for a count that could not be
// measured), and, for the administrator, the choice of kind: the three kinds
// (one whose driver the unit lacks is disabled, with the reason) and
// "By the cameras that are connected" (DELETE). A choice that restarts
// Captua is confirmed first; on `restarting` the restart overlay of
// PowerControl takes over and waits for the health. A pending restart offers
// "Restart now", which sends the same request again. Each refusal has its
// own sentence. Operators and reviewers see the facts without the controls.
// An older backend without the route shows nothing. GET, PUT and DELETE
// /system/camera-kind are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, cameraKindApi, healthApi, type CameraKindWire } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetCameraKind } from '$lib/camera-kind';
import '../../../../app.css';
import CameraKindCard from './CameraKindCard.svelte';

function wire(over: Partial<CameraKindWire> = {}): CameraKindWire {
	return {
		configured: 'gphoto2',
		source: 'detected',
		stored: null,
		pending_restart: false,
		detected: 'gphoto2',
		connected: { picamera2: 0, gphoto2: 2, chdk: null },
		available: { picamera2: true, gphoto2: true, chdk: false },
		mixed: false,
		mismatch: false,
		...over
	};
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

const radio = (name: string) =>
	page.getByRole('radio', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
const save = () => page.getByRole('button', { name: en.common_save, exact: true });

beforeEach(() => {
	locale.set('en');
	signIn('admin');
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetCameraKind();
	document.querySelectorAll('.modal-backdrop, .power-overlay').forEach((n) => n.remove());
});

describe('Settings > Cameras', () => {
	it('shows the kind in effect, why, and the cameras connected', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		const { container } = render(CameraKindCard);
		await expect.element(page.getByText(en.camera_kind_source_detected)).toBeVisible();
		const inUse = container.querySelector('[data-kind-in-use]');
		expect(inUse?.textContent).toContain(en.camera_kind_gphoto2);
		const counts = container.querySelector('[data-kind-connected]')!.textContent!;
		expect(counts).toContain(en.camera_kind_picamera2);
		expect(counts).toContain(en.camera_kind_count_unknown);
		// No driver names for an operator-facing section.
		expect(container.textContent).not.toMatch(/gphoto2|picamera2|chdk(?!\))/i);
	});

	it('offers the three kinds and By the cameras connected, the stored one checked, a kind without its driver disabled', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		render(CameraKindCard);
		await expect.element(radio(en.camera_kind_follow)).toBeChecked();
		await expect.element(radio(en.camera_kind_picamera2)).toBeEnabled();
		await expect.element(radio(en.camera_kind_gphoto2)).toBeEnabled();
		await expect.element(radio(en.camera_kind_chdk)).toBeDisabled();
		await expect.element(page.getByText(en.camera_kind_lacks_driver)).toBeVisible();
		await expect.element(save()).toBeDisabled();
	});

	it('confirms a choice that restarts Captua, sends it, and waits for the restart', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		const put = vi
			.spyOn(cameraKindApi, 'set')
			.mockResolvedValue({ kind: 'picamera2', configured: 'gphoto2', restart: 'restarting' });
		vi.spyOn(healthApi, 'check').mockRejectedValue(new TypeError('Failed to fetch'));
		render(CameraKindCard);
		await userEvent.click(radio(en.camera_kind_picamera2));
		await userEvent.click(save());
		const dialog = page.getByRole('dialog');
		await expect.element(dialog).toHaveTextContent(en.camera_kind_confirm_body);
		expect(put).not.toHaveBeenCalled();
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_confirm_btn }));
		await expect.poll(() => put.mock.calls).toEqual([['picamera2']]);
		await expect.element(page.getByText(en.config_rebooting)).toBeVisible();
	});

	it('sends "By the cameras that are connected" as a DELETE', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
			wire({ stored: 'picamera2', source: 'stored', configured: 'picamera2' })
		);
		const del = vi
			.spyOn(cameraKindApi, 'clear')
			.mockResolvedValue({ kind: null, configured: 'picamera2', restart: 'restarting' });
		vi.spyOn(healthApi, 'check').mockRejectedValue(new TypeError('Failed to fetch'));
		render(CameraKindCard);
		await expect.element(radio(en.camera_kind_picamera2)).toBeChecked();
		await userEvent.click(radio(en.camera_kind_follow));
		await userEvent.click(save());
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_confirm_btn }));
		await expect.poll(() => del.mock.calls.length).toBe(1);
	});

	it('stores the kind in effect without asking, since nothing restarts', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		const put = vi
			.spyOn(cameraKindApi, 'set')
			.mockResolvedValue({ kind: 'gphoto2', configured: 'gphoto2', restart: 'not_needed' });
		render(CameraKindCard);
		await userEvent.click(radio(en.camera_kind_gphoto2));
		await userEvent.click(save());
		await expect.poll(() => put.mock.calls).toEqual([['gphoto2']]);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('reads the kind afresh at Save, shows it when it changed, and asks against it', async () => {
		const get = vi
			.spyOn(cameraKindApi, 'get')
			.mockResolvedValueOnce(wire())
			.mockResolvedValue(
				wire({ configured: 'picamera2', source: 'stored', stored: 'picamera2', detected: null })
			);
		const put = vi
			.spyOn(cameraKindApi, 'set')
			.mockResolvedValue({ kind: 'gphoto2', configured: 'picamera2', restart: 'restarting' });
		vi.spyOn(healthApi, 'check').mockRejectedValue(new TypeError('Failed to fetch'));
		const { container } = render(CameraKindCard);
		await userEvent.click(radio(en.camera_kind_gphoto2));
		// Shown: Canon DSLR cameras in use, so this choice would restart nothing.
		await userEvent.click(save());
		await expect.poll(() => get.mock.calls.length).toBe(2);
		// Another tab has since changed it: the card shows the new state and sends nothing.
		await expect
			.poll(() => container.querySelector('[data-kind-in-use]')?.textContent)
			.toContain(en.camera_kind_picamera2);
		expect(put).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		// Against the new state the same choice restarts Captua: Save asks first.
		await userEvent.click(save());
		await expect.element(page.getByRole('dialog')).toHaveTextContent(en.camera_kind_confirm_body);
		expect(get).toHaveBeenCalledTimes(3);
		expect(put).not.toHaveBeenCalled();
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_confirm_btn }));
		await expect.poll(() => put.mock.calls).toEqual([['gphoto2']]);
	});

	it('sends nothing at Save when the fresh read fails, and says so', async () => {
		vi.spyOn(cameraKindApi, 'get')
			.mockResolvedValueOnce(wire())
			.mockRejectedValue(new TypeError('Failed to fetch'));
		const put = vi.spyOn(cameraKindApi, 'set');
		const del = vi.spyOn(cameraKindApi, 'clear');
		render(CameraKindCard);
		// The kind in effect: as shown, nothing would restart.
		await userEvent.click(radio(en.camera_kind_gphoto2));
		await userEvent.click(save());
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.camera_kind_err_load);
		expect(put).not.toHaveBeenCalled();
		expect(del).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('sends nothing at Restart now when the fresh read fails, and says so', async () => {
		vi.spyOn(cameraKindApi, 'get')
			.mockResolvedValueOnce(wire({ stored: null, source: 'stored', pending_restart: true }))
			.mockRejectedValue(new TypeError('Failed to fetch'));
		const put = vi.spyOn(cameraKindApi, 'set');
		const del = vi.spyOn(cameraKindApi, 'clear');
		render(CameraKindCard);
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_restart_now }));
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.camera_kind_err_load);
		expect(put).not.toHaveBeenCalled();
		expect(del).not.toHaveBeenCalled();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it('reads the kind again after a change that restarts nothing', async () => {
		const get = vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		const put = vi
			.spyOn(cameraKindApi, 'set')
			.mockResolvedValue({ kind: 'gphoto2', configured: 'gphoto2', restart: 'not_needed' });
		render(CameraKindCard);
		await userEvent.click(radio(en.camera_kind_gphoto2));
		await userEvent.click(save());
		await expect.poll(() => put.mock.calls.length).toBe(1);
		await expect
			.poll(() => get.mock.invocationCallOrder.some((n) => n > put.mock.invocationCallOrder[0]))
			.toBe(true);
	});

	for (const code of [
		'busy_capturing',
		'offsite_job_running',
		'backend_restarting',
		'driver_unavailable'
	] as const) {
		it(`says why a refused choice was refused (${code})`, async () => {
			vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
			vi.spyOn(cameraKindApi, 'set').mockRejectedValue(
				new ApiError('English', { code, message: 'English' }, 409)
			);
			render(CameraKindCard);
			await userEvent.click(radio(en.camera_kind_picamera2));
			await userEvent.click(save());
			await userEvent.click(page.getByRole('button', { name: en.camera_kind_confirm_btn }));
			const key = `camera_kind_refused_${code}` as const;
			await expect.element(page.getByRole('alert')).toHaveTextContent(en[key]);
		});
	}

	it('says a restart is pending and sends the same choice again with Restart now', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
			wire({ stored: 'picamera2', pending_restart: true })
		);
		const put = vi
			.spyOn(cameraKindApi, 'set')
			.mockResolvedValue({ kind: 'picamera2', configured: 'gphoto2', restart: 'restarting' });
		vi.spyOn(healthApi, 'check').mockRejectedValue(new TypeError('Failed to fetch'));
		render(CameraKindCard);
		await expect
			.element(page.getByText(en.camera_kind_pending(en.camera_kind_picamera2)))
			.toBeVisible();
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_restart_now }));
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_confirm_btn }));
		await expect.poll(() => put.mock.calls).toEqual([['picamera2']]);
	});

	it('says the unit has to be restarted when Captua could not restart itself', async () => {
		vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire());
		vi.spyOn(cameraKindApi, 'set').mockResolvedValue({
			kind: 'picamera2',
			configured: 'gphoto2',
			restart: 'restart_needed'
		});
		render(CameraKindCard);
		await userEvent.click(radio(en.camera_kind_picamera2));
		await userEvent.click(save());
		await userEvent.click(page.getByRole('button', { name: en.camera_kind_confirm_btn }));
		await expect.element(page.getByText(en.camera_kind_restart_needed)).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: en.config_reboot_btn, exact: true }))
			.toBeVisible();
	});

	for (const role of ['operator', 'reviewer'] as const) {
		it(`the ${role} sees the facts and no control`, async () => {
			signIn(role);
			vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
				wire({ pending_restart: true, stored: 'picamera2' })
			);
			const { container } = render(CameraKindCard);
			await expect.element(page.getByText(en.camera_kind_source_detected)).toBeVisible();
			expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
			expect(container.querySelectorAll('button')).toHaveLength(0);
		});
	}

	it('shows nothing, and no error, for a backend without the route', async () => {
		const get = vi
			.spyOn(cameraKindApi, 'get')
			.mockRejectedValue(new ApiError('Not Found', undefined, 404));
		const { container } = render(CameraKindCard);
		await expect.poll(() => get.mock.calls.length).toBe(1);
		await expect
			.poll(() => container.querySelector('[data-kind-state]')?.getAttribute('data-kind-state'))
			.toBe('absent');
		expect(container.textContent?.trim()).toBe('');
	});

	for (const [w, h] of [
		[800, 480],
		[1280, 800]
	] as const) {
		it(`fits at ${w}x${h}: nothing wider than the screen, every control at least 44 px tall`, async () => {
			await page.viewport(w, h);
			vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
				wire({
					stored: 'picamera2',
					pending_restart: true,
					connected: { picamera2: 0, gphoto2: 2, chdk: 1 },
					mixed: true,
					mismatch: true
				})
			);
			const { container } = render(CameraKindCard);
			await expect
				.element(page.getByRole('button', { name: en.camera_kind_restart_now }))
				.toBeVisible();
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
			const card = container.querySelector('[data-kind-state]') as HTMLElement;
			expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
			for (const b of container.querySelectorAll('button, label.kind-option')) {
				expect(b.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
				expect(b.getBoundingClientRect().right).toBeLessThanOrEqual(w);
			}
		});
	}
});

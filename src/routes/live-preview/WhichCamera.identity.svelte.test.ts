// NEH-363: giving a camera its identity from "Which camera is this?". On a
// CHDK unit (PowerShot A2500 bodies) an administrator gives the camera an
// identity from the screen that names the problem: one press writes a page
// parity, and with it an identity, onto the card of the body that has none
// (POST /cameras/side/{n}), then the screen reads the set-up again. Anyone
// else on a CHDK unit is told to ask the administrator, as before. On a
// gphoto2 unit (EOS T7 bodies) the screen says the cameras are identified
// by their serial, and offers no identity to give.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraDevice, type CameraSetup } from '$lib/api';
import { cameraKind, resetCameraKind, type CameraKindReport } from '$lib/camera-kind';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import '../../app.css';
import WhichCamera from './WhichCamera.svelte';

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

async function jpeg(): Promise<Blob> {
	const c = document.createElement('canvas');
	c.width = 40;
	c.height = 60;
	return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.5));
}

function failure(status: number): Error {
	return Object.assign(new Error('English from the backend'), { status, detail: 'English' });
}

function device(index: number, over: Partial<CameraDevice> = {}): CameraDevice {
	return {
		index,
		hardware_id: `hw${index}`,
		model: 'Canon PowerShot A2500',
		calibrated: false,
		role: null,
		role_confirmed: false,
		role_guess: null,
		...over
	};
}

const missing: CameraSetup = {
	needs_setup: true,
	reasons: [{ code: 'identity_missing', message: 'English', hardware_ids: ['a2500_idx1'] }],
	confirmed_pair: null
};

function kind(configured: string) {
	const report: CameraKindReport = {
		configured,
		source: 'detected',
		stored: null,
		pendingRestart: false,
		connected: { picamera2: 0, gphoto2: 0, chdk: 0 },
		available: { picamera2: true, gphoto2: true, chdk: true },
		mixed: false,
		mismatch: false
	};
	cameraKind.set({ status: 'ready', report });
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

let devices: CameraDevice[];
let sideSpy: MockInstance<typeof camerasApi.assignSide>;
let listSpy: MockInstance<typeof camerasApi.listDevices>;

function renderWhich(setup: CameraSetup = missing) {
	const onReread = vi.fn(async () => {});
	const onDevices = vi.fn();
	render(WhichCamera, {
		setup,
		rotateDeg: { 0: 0, 1: 0 },
		onSaved: vi.fn(),
		onReread,
		onDevices
	});
	return { onReread, onDevices };
}

const text = () => document.querySelector('[data-which-camera]')?.textContent ?? '';

function button(name: string): HTMLButtonElement | null {
	return (
		[...document.querySelectorAll<HTMLButtonElement>('[data-which-camera] button')].find((b) => {
			const copy = b.cloneNode(true) as Element;
			copy.querySelectorAll('.material-symbols-outlined').forEach((i) => i.remove());
			return (copy.textContent ?? '').trim() === name;
		}) ?? null
	);
}

beforeEach(() => {
	locale.set('en');
	devices = [device(0, { side: 'even' }), device(1, { hardware_id: 'a2500_idx1', side: null })];
	listSpy = vi
		.spyOn(camerasApi, 'listDevices')
		.mockImplementation(async () => devices.map((d) => ({ ...d })));
	vi.spyOn(camerasApi, 'previewFrame').mockImplementation(() => jpeg());
	vi.spyOn(camerasApi, 'rescan').mockImplementation(async () => devices.map((d) => ({ ...d })));
	sideSpy = vi
		.spyOn(camerasApi, 'assignSide')
		.mockResolvedValue([
			device(0, { side: 'even' }),
			device(1, { hardware_id: 'cam_new', side: 'odd' })
		]);
});

afterEach(() => {
	vi.restoreAllMocks();
	resetCameraKind();
	authStore.clearSession();
	document.body.innerHTML = '';
});

describe('WhichCamera: giving a camera its identity (NEH-363)', () => {
	it('an administrator on a CHDK unit gives the camera an identity, then the set-up is read again', async () => {
		kind('chdk');
		signIn('admin');
		const { onReread, onDevices } = renderWhich();
		await settle();
		expect(text()).toContain(en.camwhich_identity_title);
		expect(text()).toContain(en.camwhich_identity_body_admin);
		expect(text()).not.toContain(en.camwhich_identity_body);
		onReread.mockClear();
		const give = button(en.camwhich_identity_assign);
		expect(give).not.toBeNull();
		give!.click();
		await settle();
		expect(sideSpy).toHaveBeenCalledTimes(1);
		expect(sideSpy).toHaveBeenCalledWith(1, 'odd');
		expect(onDevices).toHaveBeenLastCalledWith([
			expect.objectContaining({ index: 0 }),
			expect.objectContaining({ hardware_id: 'cam_new' })
		]);
		expect(onReread).toHaveBeenCalled();
	});

	it('while the identity is written: says so and takes no second press', async () => {
		kind('chdk');
		signIn('admin');
		const pending = deferred<CameraDevice[]>();
		sideSpy.mockReturnValue(pending.promise);
		renderWhich();
		await settle();
		button(en.camwhich_identity_assign)!.click();
		await settle();
		expect(text()).toContain(en.camwhich_identity_assigning);
		const give = button(en.camwhich_identity_assign);
		expect(give?.disabled).toBe(true);
		give?.click();
		await settle();
		expect(sideSpy).toHaveBeenCalledTimes(1);
		pending.resolve(devices);
		await settle();
		expect(text()).not.toContain(en.camwhich_identity_assigning);
	});

	it('a write that fails says so, reads the cameras again and leaves the button', async () => {
		kind('chdk');
		signIn('admin');
		sideSpy.mockRejectedValue(failure(502));
		renderWhich();
		await settle();
		listSpy.mockClear();
		button(en.camwhich_identity_assign)!.click();
		await settle();
		expect(text()).toContain(en.camwhich_identity_err_failed);
		expect(text()).not.toContain('English from the backend');
		expect(listSpy).toHaveBeenCalled();
		expect(button(en.camwhich_identity_assign)?.disabled).toBe(false);
	});

	it('once every camera has its ID, the set-up read again moves the screen on to the page question', async () => {
		kind('chdk');
		signIn('admin');
		const onReread = vi.fn(async () => {});
		const screen = render(WhichCamera, {
			setup: missing,
			rotateDeg: { 0: 0, 1: 0 },
			onSaved: vi.fn(),
			onReread
		});
		// The capture screen's answer after the write: no identity reason left.
		onReread.mockImplementation(async () => {
			await screen.rerender({
				setup: {
					needs_setup: true,
					reasons: [
						{ code: 'role_unconfirmed', message: 'English', hardware_ids: ['hw0', 'cam_new'] }
					],
					confirmed_pair: null
				}
			});
		});
		devices = [device(0, { side: 'even' }), device(1, { hardware_id: 'cam_new', side: 'odd' })];
		await settle();
		button(en.camwhich_identity_assign)!.click();
		await settle();
		expect(text()).not.toContain(en.camwhich_identity_title);
		expect(text()).toContain(en.camwhich_ask_title);
		expect(button(en.camwhich_identity_assign)).toBeNull();
		expect(document.querySelectorAll('[data-card] button[data-pick]').length).toBe(2);
	});

	it.each([
		[409, 'camwhich_identity_err_conflict'],
		[404, 'camwhich_identity_err_failed'],
		[502, 'camwhich_identity_err_failed']
	] as const)('a write refused with %i says %s', async (status, key) => {
		kind('chdk');
		signIn('admin');
		sideSpy.mockRejectedValue(failure(status));
		renderWhich();
		await settle();
		button(en.camwhich_identity_assign)!.click();
		await settle();
		expect(text()).toContain(en[key]);
		const other =
			key === 'camwhich_identity_err_conflict'
				? en.camwhich_identity_err_failed
				: en.camwhich_identity_err_conflict;
		expect(text()).not.toContain(other);
	});

	it('an administrator with no ID Captua can assign here is told so, with no button and no word of the administrator', async () => {
		kind('chdk');
		signIn('admin');
		devices = [
			device(0, { hardware_id: 'cam_x', serial: 'S1' }),
			device(1, { hardware_id: 'cam_x', serial: 'S2' })
		];
		renderWhich({
			needs_setup: true,
			reasons: [{ code: 'identity_ambiguous', message: 'English', hardware_ids: ['cam_x'] }],
			confirmed_pair: null
		});
		await settle();
		expect(text()).toContain(en.camwhich_identity_body_admin_none);
		expect(text()).not.toContain(en.camwhich_identity_body_admin);
		expect(text()).not.toContain(en.camwhich_identity_body);
		expect(button(en.camwhich_identity_assign)).toBeNull();
		expect(button(en.camwhich_check_again)).not.toBeNull();
	});

	it('an operator on a CHDK unit is told to ask the administrator, with nothing to press', async () => {
		kind('chdk');
		signIn('operator');
		renderWhich();
		await settle();
		expect(text()).toContain(en.camwhich_identity_body);
		expect(text()).not.toContain(en.camwhich_identity_body_admin);
		expect(button(en.camwhich_identity_assign)).toBeNull();
	});

	it.each(['admin', 'operator'] as const)(
		'on a gphoto2 unit (%s) the screen says the cameras are identified by serial',
		async (role) => {
			kind('gphoto2');
			signIn(role);
			devices = [device(0), device(1, { hardware_id: 'eos_idx1', model: 'Canon EOS Rebel T7' })];
			renderWhich({
				...missing,
				reasons: [{ code: 'identity_missing', message: 'English', hardware_ids: ['eos_idx1'] }]
			});
			await settle();
			expect(text()).toContain(en.camwhich_identity_body_serial);
			expect(text()).not.toContain(en.camwhich_identity_body);
			expect(button(en.camwhich_identity_assign)).toBeNull();
			expect(button(en.camwhich_check_again)).not.toBeNull();
		}
	);

	it('an administrator whose unit kind is not read yet sees the screen as before', async () => {
		signIn('admin');
		renderWhich();
		await settle();
		expect(text()).toContain(en.camwhich_identity_body);
		expect(button(en.camwhich_identity_assign)).toBeNull();
	});
});

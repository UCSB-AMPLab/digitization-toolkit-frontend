// NEH-343: "Which camera is this?". A current frame from each camera (GET
// /cameras/preview/{n}, one request per camera, never a continuous
// preview), each turned by its camera's saved orientation, with "Turn".
// The operator presses the image that shows the left page; the other camera
// takes the right page; "Confirm" saves both roles in one request (PUT
// /cameras/roles). The wording follows the most specific reason the
// backend reports, never its English. While set-up is needed nothing
// dismisses the screen; opened by hand, "Cancel" and Escape do.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraDevice, type CameraRolesResponse, type CameraSetup, type CameraSetupCode } from '$lib/api';
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

async function jpeg(w = 400, h = 600): Promise<Blob> {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.5));
}

function failure(status: number, detail?: unknown): Error {
	return Object.assign(new Error('English from the backend'), { status, detail });
}

const A2500 = 'Canon PowerShot A2500';

function device(index: number, over: Partial<CameraDevice> = {}): CameraDevice {
	return { index, hardware_id: `hw${index}`, model: A2500, calibrated: false, location: `usb:001,00${index + 4}`, role: null, role_confirmed: false, role_guess: null, ...over };
}

function setup(codes: CameraSetupCode[], needs = codes.length > 0): CameraSetup {
	return {
		needs_setup: needs,
		reasons: codes.map((code) => ({ code, message: `English for ${code}`, hardware_ids: ['hw1'] })),
		confirmed_pair: null
	};
}

const saved: CameraRolesResponse = {
	devices: [device(0, { role: 'right', role_confirmed: true }), device(1, { role: 'left', role_confirmed: true })],
	setup: setup([])
};

let devices: CameraDevice[];
let listSpy: MockInstance<typeof camerasApi.listDevices>;
let frameSpy: MockInstance<typeof camerasApi.previewFrame>;
let rolesSpy: MockInstance<typeof camerasApi.setRoles>;
let rescanSpy: MockInstance<typeof camerasApi.rescan>;

function renderWhich(props: Partial<{ setup: CameraSetup | null; cancellable: boolean; rotateDeg: Record<number, number>; savingOrientation: Record<number, boolean> }> = {}) {
	const onSaved = vi.fn();
	const onCancel = vi.fn();
	const onReread = vi.fn(async () => {});
	const onRotateDegChange = vi.fn();
	const onLeave = vi.fn();
	const onDevices = vi.fn();
	const screen = render(WhichCamera, {
		setup: setup(['role_unconfirmed']),
		cancellable: false,
		projectName: 'Rionegro',
		collectionName: 'Tomo 6',
		rotateDeg: { 0: 0, 1: 0 },
		onSaved,
		onCancel,
		onReread,
		onRotateDegChange,
		onLeave,
		onDevices,
		...props
	});
	return { screen, onSaved, onCancel, onReread, onRotateDegChange, onLeave, onDevices };
}

const view = () => document.querySelector('[data-which-camera]') as HTMLElement | null;
const text = () => view()?.textContent ?? '';
const card = (index: number) => document.querySelector(`[data-card="${index}"]`) as HTMLElement | null;
const pick = (index: number) => card(index)?.querySelector('button[data-pick]') as HTMLButtonElement | null;
const labelOf = (index: number) => card(index)?.querySelector('.feed-label')?.textContent?.trim() ?? null;
const turnOf = (index: number) => card(index)?.querySelector('button[data-turn]') as HTMLButtonElement | null;
const imgOf = (index: number) => card(index)?.querySelector('img') as HTMLImageElement | null;

function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}

function button(name: string): HTMLButtonElement | null {
	return [...document.querySelectorAll<HTMLButtonElement>('[data-which-camera] button')].find((b) => nameOf(b) === name) ?? null;
}

async function click(name: string) {
	const b = button(name);
	if (!b) throw new Error(`no button "${name}"`);
	b.click();
	await settle();
}

// On the focused element, as a real key press.
function escape() {
	const target = document.activeElement ?? document.body;
	const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
	return event;
}

beforeEach(() => {
	locale.set('en');
	devices = [device(0), device(1)];
	listSpy = vi.spyOn(camerasApi, 'listDevices').mockImplementation(async () => devices.map((d) => ({ ...d })));
	frameSpy = vi.spyOn(camerasApi, 'previewFrame').mockImplementation(() => jpeg());
	rolesSpy = vi.spyOn(camerasApi, 'setRoles').mockResolvedValue(saved);
	rescanSpy = vi.spyOn(camerasApi, 'rescan').mockImplementation(async () => devices.map((d) => ({ ...d })));
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('WhichCamera: asking which camera sees the left page', () => {
	it('a role not confirmed: the question, a frame from each camera, nothing chosen and no Confirm until a press', async () => {
		renderWhich();
		await settle();
		expect(view()?.getAttribute('role')).toBe('dialog');
		expect(text()).toContain(en.camwhich_ask_title);
		expect(text()).toContain(en.camwhich_lead_unconfirmed);
		expect(text()).toContain(en.camwhich_how);
		expect(text()).toContain(en.camwhich_needed);
		expect(text()).not.toContain('English for');
		// One frame from each camera, once.
		expect(frameSpy).toHaveBeenCalledTimes(2);
		expect(frameSpy.mock.calls.map((c) => c[0]).sort()).toEqual([0, 1]);
		await expect.poll(() => imgOf(0) !== null && imgOf(1) !== null).toBe(true);
		expect(card(0)?.textContent).toContain(en.camwhich_camera(1));
		expect(card(1)?.textContent).toContain(en.camwhich_camera(2));
		expect(card(0)?.textContent).toContain(A2500);
		expect(labelOf(0)).toBe(en.camwhich_camera(1));
		expect(labelOf(1)).toBe(en.camwhich_camera(2));
		expect(pick(0)?.getAttribute('aria-pressed')).toBe('false');
		expect(button(en.camwhich_confirm)?.disabled).toBe(true);
		// No socket name anywhere.
		expect(text()).not.toMatch(/usb/i);
	});

	it('pressing an image makes it the left page and the other the right page; Confirm saves both ids', async () => {
		const { onSaved } = renderWhich();
		await settle();
		pick(1)!.click();
		await settle();
		expect(labelOf(1)).toBe(en.camcheck_left_page);
		expect(labelOf(0)).toBe(en.camcheck_right_page);
		expect(pick(1)?.getAttribute('aria-pressed')).toBe('true');
		expect(rolesSpy).not.toHaveBeenCalled();

		// Another press changes the choice.
		pick(0)!.click();
		await settle();
		expect(labelOf(0)).toBe(en.camcheck_left_page);
		expect(labelOf(1)).toBe(en.camcheck_right_page);

		await click(en.camwhich_confirm);
		expect(rolesSpy).toHaveBeenCalledTimes(1);
		expect(rolesSpy).toHaveBeenCalledWith('hw0', 'hw1');
		expect(onSaved).toHaveBeenCalledWith(saved);
	});

	it('Confirm is held while the save is in flight', async () => {
		const answer = deferred<CameraRolesResponse>();
		rolesSpy.mockReturnValue(answer.promise);
		renderWhich();
		await settle();
		pick(1)!.click();
		await settle();
		await click(en.camwhich_confirm);
		expect(button(en.camwhich_confirm)?.disabled).toBe(true);
		button(en.camwhich_confirm)!.click();
		expect(rolesSpy).toHaveBeenCalledTimes(1);
		answer.resolve(saved);
		await settle();
	});

	it('two cameras on the same page: says so, then asks', async () => {
		renderWhich({ setup: setup(['role_conflict', 'role_unconfirmed']) });
		await settle();
		expect(text()).toContain(en.camwhich_ask_title);
		expect(text()).toContain(en.camwhich_lead_conflict);
		expect(text()).not.toContain(en.camwhich_lead_unconfirmed);
	});

	it('a new pair is told it is not the pair last confirmed', async () => {
		renderWhich({ setup: setup(['role_unconfirmed', 'pair_changed']) });
		await settle();
		expect(text()).toContain(en.camwhich_lead_pair_changed);
		expect(text()).not.toContain(en.camwhich_lead_unconfirmed);
	});

	it('another pair from last time: says so, then asks', async () => {
		renderWhich({ setup: setup(['pair_changed', 'port_changed']) });
		await settle();
		expect(text()).toContain(en.camwhich_ask_title);
		expect(text()).toContain(en.camwhich_lead_pair_changed);
		expect(button(en.camwhich_port_no)).toBeNull();
	});

	it('Captua\'s guess is shown faintly, and chooses nothing', async () => {
		devices = [device(0, { role: 'left', role_confirmed: true }), device(1, { role_guess: 'right', role_guess_source: 'port' })];
		renderWhich();
		await settle();
		expect(card(1)?.textContent).toContain(en.camwhich_guess('right'));
		expect(card(0)?.textContent).not.toContain(en.camwhich_guess('left'));
		expect(pick(0)?.getAttribute('aria-pressed')).toBe('false');
		expect(pick(1)?.getAttribute('aria-pressed')).toBe('false');
		expect(labelOf(0)).toBe(en.camwhich_camera(1));
		expect(button(en.camwhich_confirm)?.disabled).toBe(true);
	});
});

describe('WhichCamera: a known camera on another USB socket', () => {
	beforeEach(() => {
		// Camera 1 has the left page on record.
		devices = [device(0, { role: 'right', role_confirmed: true }), device(1, { role: 'left', role_confirmed: true })];
	});

	it('asks whether the cameras changed sides, with the images under their current roles', async () => {
		renderWhich({ setup: setup(['port_changed']) });
		await settle();
		expect(text()).toContain(en.camwhich_port_title);
		expect(text()).toContain(en.camwhich_lead_port);
		expect(text()).not.toMatch(/usb:/i);
		expect(labelOf(1)).toBe(en.camcheck_left_page);
		expect(labelOf(0)).toBe(en.camcheck_right_page);
		// The left page first.
		const order = [...document.querySelectorAll('[data-card]')].map((c) => c.getAttribute('data-card'));
		expect(order).toEqual(['1', '0']);
		expect(button(en.camwhich_confirm)).toBeNull();
		expect(document.querySelector('button[data-pick]')).toBeNull();
	});

	it('"No, they are where they were" confirms the same roles', async () => {
		const { onSaved } = renderWhich({ setup: setup(['port_changed']) });
		await settle();
		await click(en.camwhich_port_no);
		expect(rolesSpy).toHaveBeenCalledWith('hw1', 'hw0');
		expect(onSaved).toHaveBeenCalled();
	});

	it('"Yes, they changed sides" exchanges them', async () => {
		renderWhich({ setup: setup(['port_changed']) });
		await settle();
		await click(en.camwhich_port_yes);
		expect(rolesSpy).toHaveBeenCalledWith('hw0', 'hw1');
	});
});

describe('WhichCamera: what cannot be answered here', () => {
	it('a camera Captua cannot identify: says an administrator must give it an identity; nothing to confirm', async () => {
		const { onReread } = renderWhich({ setup: setup(['identity_missing', 'role_unconfirmed']) });
		await settle();
		expect(text()).toContain(en.camwhich_identity_title);
		expect(text()).toContain(en.camwhich_identity_body);
		expect(button(en.camwhich_confirm)).toBeNull();
		expect(document.querySelector('[data-card]')).toBeNull();
		expect(frameSpy).not.toHaveBeenCalled();

		await click(en.camwhich_check_again);
		// "Check again" reconnects the cameras, then asks for the set-up.
		expect(rescanSpy).toHaveBeenCalledTimes(1);
		expect(onReread).toHaveBeenCalledTimes(1);
		expect(listSpy).toHaveBeenCalledTimes(1);
	});

	it('"Check again" is busy while the cameras are reconnected, and passes the new listing to the capture screen', async () => {
		devices = [device(0)];
		const rescan = deferred<CameraDevice[]>();
		rescanSpy.mockReturnValue(rescan.promise);
		const { onReread, onDevices } = renderWhich();
		await settle();
		await click(en.camwhich_check_again);
		expect(text()).toContain(en.camwhich_rescanning);
		expect(button(en.camwhich_check_again)?.disabled).toBe(true);
		expect(onReread).not.toHaveBeenCalled();
		rescan.resolve([device(0), device(1)]);
		await settle();
		expect(onReread).toHaveBeenCalledTimes(1);
		expect(onDevices).toHaveBeenCalledWith([device(0), device(1)]);
		// Both cameras now: the question, with a frame from each.
		expect(text()).toContain(en.camwhich_ask_title);
		await expect.poll(() => imgOf(1)).not.toBeNull();
	});

	it('a reconnection that fails says so, and asks for the set-up nonetheless', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		devices = [device(0)];
		rescanSpy.mockRejectedValue(failure(500, 'English from the backend'));
		const { onReread } = renderWhich();
		await settle();
		await click(en.camwhich_check_again);
		expect(text()).toContain(en.camwhich_rescan_failed);
		expect(text()).not.toContain('English from the backend');
		expect(onReread).toHaveBeenCalledTimes(1);
		expect(button(en.camwhich_check_again)?.disabled).toBe(false);
	});

	it('an ambiguous identity says the same', async () => {
		renderWhich({ setup: setup(['identity_ambiguous']) });
		await settle();
		expect(text()).toContain(en.camwhich_identity_title);
	});

	it('one camera connected: Captua needs both; no bypass', async () => {
		devices = [device(0)];
		renderWhich();
		await settle();
		expect(text()).toContain(en.camwhich_one_title);
		expect(text()).toContain(en.camwhich_one_body);
		expect(button(en.camwhich_confirm)).toBeNull();
		expect(document.querySelector('[data-card]')).toBeNull();
		expect(button(en.camwhich_check_again)).not.toBeNull();
	});

	it('a device list that cannot be read says so, with "Check again"', async () => {
		listSpy.mockRejectedValue(failure(503));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		renderWhich();
		await settle();
		expect(text()).toContain(en.camcheck_devices_failed);
		expect(button(en.camwhich_confirm)).toBeNull();
		expect(button(en.camwhich_check_again)).not.toBeNull();
	});
});

describe('WhichCamera: a save refused', () => {
	beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

	it('409 camera not connected: reads the devices and the set-up again and asks to choose again', async () => {
		rolesSpy.mockRejectedValueOnce(failure(409, { code: 'camera_not_connected', message: 'Camera hw1 is not connected' }));
		const { onReread, onSaved } = renderWhich();
		await settle();
		pick(0)!.click();
		await settle();
		await click(en.camwhich_confirm);
		expect(onReread).toHaveBeenCalledTimes(1);
		expect(listSpy).toHaveBeenCalledTimes(2);
		expect(text()).toContain(en.camwhich_err_not_connected);
		expect(text()).not.toContain('Camera hw1 is not connected');
		expect(onSaved).not.toHaveBeenCalled();
		// The choice is cleared: choose again.
		expect(pick(0)?.getAttribute('aria-pressed')).toBe('false');
		expect(button(en.camwhich_confirm)?.disabled).toBe(true);
	});

	it('409 identity unusable: says so and reads again', async () => {
		rolesSpy.mockRejectedValueOnce(failure(409, { code: 'camera_identity_unusable', message: 'English' }));
		const { onReread } = renderWhich();
		await settle();
		pick(0)!.click();
		await settle();
		await click(en.camwhich_confirm);
		expect(onReread).toHaveBeenCalledTimes(1);
		expect(text()).toContain(en.camwhich_err_identity);
	});

	it('503: says Captua could not save, and stays', async () => {
		rolesSpy.mockRejectedValueOnce(failure(503, 'Storage unavailable'));
		const { onSaved } = renderWhich();
		await settle();
		pick(0)!.click();
		await settle();
		await click(en.camwhich_confirm);
		expect(text()).toContain(en.camwhich_err_unavailable);
		expect(text()).not.toContain('Storage unavailable');
		expect(onSaved).not.toHaveBeenCalled();
		expect(view()).not.toBeNull();
		// The choice stays, to try again.
		expect(button(en.camwhich_confirm)?.disabled).toBe(false);
	});

	it('another refusal: the general message', async () => {
		rolesSpy.mockRejectedValueOnce(failure(422, 'equal ids'));
		renderWhich();
		await settle();
		pick(0)!.click();
		await settle();
		await click(en.camwhich_confirm);
		expect(text()).toContain(en.camwhich_err_failed);
	});
});

describe('WhichCamera: the frames', () => {
	it('busy while a frame is on its way; Refresh waits for both', async () => {
		const frames = [deferred<Blob>(), deferred<Blob>()];
		frameSpy.mockImplementation((i: number) => frames[i].promise);
		renderWhich();
		await settle();
		expect(card(0)?.textContent).toContain(en.camwhich_frame_busy);
		expect(card(1)?.textContent).toContain(en.camwhich_frame_busy);
		expect(button(en.camwhich_refresh)?.disabled).toBe(true);
		frames[0].resolve(await jpeg());
		frames[1].resolve(await jpeg());
		await expect.poll(() => button(en.camwhich_refresh)?.disabled).toBe(false);
		expect(imgOf(0)).not.toBeNull();
	});

	it('one camera that gives no frame fails on its own card; Refresh asks both again', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		frameSpy.mockImplementation(async (i: number) => {
			if (i === 1) throw failure(404, 'Camera 1 not found');
			return jpeg();
		});
		renderWhich();
		await settle();
		expect(imgOf(0)).not.toBeNull();
		expect(imgOf(1)).toBeNull();
		expect(card(1)?.textContent).toContain(en.camwhich_frame_failed);
		expect(card(0)?.textContent).not.toContain(en.camwhich_frame_failed);
		// The camera without a frame can still be chosen.
		expect(pick(1)?.disabled).toBe(false);

		frameSpy.mockImplementation(() => jpeg());
		await click(en.camwhich_refresh);
		expect(frameSpy).toHaveBeenCalledTimes(4);
		await expect.poll(() => imgOf(1)).not.toBeNull();
	});

	it('revokes the frames it replaces, and the rest on closing', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		const { screen } = renderWhich();
		await settle();
		await click(en.camwhich_refresh);
		expect(revoke).toHaveBeenCalledTimes(2);
		screen.unmount();
		expect(revoke).toHaveBeenCalledTimes(4);
	});

	it('shows each frame turned by its camera\'s saved orientation', async () => {
		renderWhich({ rotateDeg: { 0: 90, 1: 270 } });
		await settle();
		await expect.poll(() => imgOf(0)?.getAttribute('style') ?? '').toContain('rotate(90deg)');
		expect(imgOf(1)?.getAttribute('style')).toContain('rotate(270deg)');
	});

	it('"Turn" turns that camera 90° clockwise through the orientation writer, and waits while it saves', async () => {
		const { onRotateDegChange, screen } = renderWhich({ rotateDeg: { 0: 90, 1: 270 } });
		await settle();
		turnOf(1)!.click();
		expect(onRotateDegChange).toHaveBeenCalledWith(1, 0);
		turnOf(0)!.click();
		expect(onRotateDegChange).toHaveBeenCalledWith(0, 180);
		expect(turnOf(0)?.getAttribute('aria-label')).toBe(en.camwhich_turn_aria(1));

		await screen.rerender({ savingOrientation: { 0: true } });
		await settle();
		expect(turnOf(0)?.disabled).toBe(true);
		expect(turnOf(1)?.disabled).toBe(false);
	});
});

describe('WhichCamera: dismissing', () => {
	it('while set-up is needed: no Cancel, no way back, and Escape and the backdrop do nothing', async () => {
		const { onCancel } = renderWhich({ cancellable: false });
		await settle();
		expect(button(en.common_cancel)).toBeNull();
		expect(button(en.camcheck_back)).toBeNull();
		escape();
		await settle();
		expect(onCancel).not.toHaveBeenCalled();
		view()!.click();
		await settle();
		expect(onCancel).not.toHaveBeenCalled();
		expect(view()).not.toBeNull();
	});

	it('opened by hand: Cancel and Escape go back', async () => {
		const { onCancel } = renderWhich({ cancellable: true, setup: setup([]) });
		await settle();
		expect(text()).not.toContain(en.camwhich_needed);
		await click(en.common_cancel);
		expect(onCancel).toHaveBeenCalledTimes(1);
		escape();
		await settle();
		expect(onCancel).toHaveBeenCalledTimes(2);
	});
});

describe('WhichCamera: leaving the capture screen', () => {
	const variants: [string, () => void, CameraSetup][] = [
		['asking', () => {}, setup(['role_unconfirmed'])],
		['another socket', () => (devices = [device(0, { role: 'right', role_confirmed: true }), device(1, { role: 'left', role_confirmed: true })]), setup(['port_changed'])],
		['an identity Captua cannot use', () => {}, setup(['identity_missing'])],
		['one camera', () => (devices = [device(0)]), setup(['role_unconfirmed'])]
	];
	for (const [name, arrange, s] of variants) {
		it(`while set-up is needed (${name}): "Leave the capture screen" is there and leaves`, async () => {
			arrange();
			const { onLeave } = renderWhich({ setup: s });
			await settle();
			await click(en.camwhich_leave);
			expect(onLeave).toHaveBeenCalledTimes(1);
		});
	}

	it('opened by hand: no such action, Cancel is the way back', async () => {
		renderWhich({ cancellable: true, setup: setup([]) });
		await settle();
		expect(button(en.camwhich_leave)).toBeNull();
	});
});

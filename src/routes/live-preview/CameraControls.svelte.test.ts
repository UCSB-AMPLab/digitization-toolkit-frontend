// NEH-71: CameraControls must not keep its own copy of the rotation degree
// — it steps from the `rotateDeg` prop and only reports the change up via
// onRotateDegChange, so it can never go stale relative to LiveViewport's
// rotate overlay (both write through the same page-level state).
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, camerasApi, type CameraCapabilities, type CameraDevice } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { STORAGE_KEYS } from '$lib/storage-keys';
import CameraControls from './CameraControls.svelte';

const leftCamera: CameraDevice = {
	index: 0,
	model: 'Left camera',
	hardware_id: 'hw-left',
	calibrated: false,
	orientation: 90
};

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		cameraMode: 'double' as const,
		shutterSpeed: '1/125s',
		iso: '100',
		aperture: '5.6',
		onCameraModeChange: vi.fn(),
		onShutterSpeedChange: vi.fn(),
		onIsoChange: vi.fn(),
		onApertureChange: vi.fn(),
		onDevicesChange: vi.fn(),
		onRotateDegChange: vi.fn(),
		rotateDeg: { 0: 90 },
		...overrides
	};
}

// The orientation readout ("90°") isn't queried via getByText: Playwright's
// exact-text matcher does not match this span reliably once the literal
// degree sign is involved (substring matches and a plain textContent read
// both work fine — only the exact-text locator misbehaves), so we read the
// DOM node directly instead of fighting that matcher.
function orientationLabel(screen: { container: HTMLElement }): string | null {
	return screen.container.querySelector('.orientation-label')?.textContent ?? null;
}

beforeEach(() => {
	locale.set('en');
	vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([leftCamera]);
	vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(new Error('not needed'));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('CameraControls — orientation reads a single upstream state (NEH-71)', () => {
	it('stepping rotation reports the new value up without keeping its own copy', async () => {
		const onRotateDegChange = vi.fn();
		const screen = render(CameraControls, baseProps({ onRotateDegChange }));

		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();
		await expect.poll(() => orientationLabel(screen)).toBe('90°');

		await screen.getByRole('button', { name: 'Rotate 90° CW' }).click();

		expect(onRotateDegChange).toHaveBeenCalledWith(0, 180);
		// No local state: the label doesn't move on its own until the parent
		// pushes the updated rotateDeg prop back down.
		expect(orientationLabel(screen)).toBe('90°');
	});

	it('the label reads whatever rotateDeg the parent hands it', async () => {
		const screen = render(CameraControls, baseProps({ rotateDeg: { 0: 180 } }));

		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();
		await expect.poll(() => orientationLabel(screen)).toBe('180°');
	});
});

const dslrCapabilities: CameraCapabilities = {
	backend: 'gphoto2',
	live_preview: true,
	focus_control: false,
	live_controls: false,
	zoom: false,
	autofocus_calibration: false,
	dslr_settings: true,
	image_formats: ['JPEG', 'RAW+JPEG']
};

describe('CameraControls — capabilities request fails', () => {
	it('shows the failure and the remedy in place of the controls', async () => {
		vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(
			new ApiError('Capture system not available', undefined, 503)
		);
		const screen = render(CameraControls, baseProps());
		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();

		// Basic, Focus and Colour and exposure are open by default: one message each.
		await expect.poll(() => screen.getByText(en.cam_capabilities_failed).elements().length).toBe(3);
		// No shutter or ISO picker: without capabilities the panel cannot tell
		// which camera family's options to offer.
		expect(screen.getByText(en.cam_shutter, { exact: true }).elements()).toHaveLength(0);
		expect(screen.getByText(en.cam_live_controls_unavailable).elements()).toHaveLength(0);
	});

	it('asks again after a successful reconnect and shows the controls', async () => {
		const getCapabilities = vi
			.spyOn(camerasApi, 'getCapabilities')
			.mockRejectedValueOnce(new ApiError('Capture system not available', undefined, 503))
			.mockResolvedValue(dslrCapabilities);
		vi.spyOn(camerasApi, 'rescan').mockResolvedValue([leftCamera]);
		vi.spyOn(camerasApi, 'getDSLRSettings').mockResolvedValue({});
		const screen = render(CameraControls, baseProps());
		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();
		await expect.poll(() => screen.getByText(en.cam_capabilities_failed).elements().length).toBe(3);

		await screen.getByRole('button', { name: en.cam_reconnect }).click();

		await expect.poll(() => screen.getByText(en.cam_capabilities_failed).elements().length).toBe(0);
		expect(getCapabilities).toHaveBeenCalledTimes(2);
		await expect.element(screen.getByText(en.cam_shutter, { exact: true })).toBeVisible();
		// The DSLR format row proves the panel follows the capabilities it got.
		await expect.element(screen.getByText(en.cam_format, { exact: true })).toBeVisible();
	});

	it('ignores a slow mount-time failure that lands after the reconnect answer', async () => {
		let failFirst: (e: unknown) => void = () => {};
		vi.spyOn(camerasApi, 'getCapabilities')
			.mockImplementationOnce(() => new Promise((_, reject) => (failFirst = reject)))
			.mockResolvedValue(dslrCapabilities);
		vi.spyOn(camerasApi, 'rescan').mockResolvedValue([leftCamera]);
		vi.spyOn(camerasApi, 'getDSLRSettings').mockResolvedValue({});
		const screen = render(CameraControls, baseProps());
		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();

		await screen.getByRole('button', { name: en.cam_reconnect }).click();
		await expect.element(screen.getByText(en.cam_format, { exact: true })).toBeVisible();

		failFirst(new ApiError('Capture system not available', undefined, 503));
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.getByText(en.cam_capabilities_failed).elements()).toHaveLength(0);
		await expect.element(screen.getByText(en.cam_format, { exact: true })).toBeVisible();
	});
});

// NEH-300: right after a boot, GET /cameras/devices can answer before gphoto2
// has identified every body: an empty list, a list missing a body, or a row
// whose serial read failed and so carries the `<model>_idx<N>` placeholder id
// with no saved orientation. The page seeds rotation only from what this
// component publishes, so it must keep reading until each body is identified.
describe('CameraControls — device list after a boot (NEH-300)', () => {
	const body0: CameraDevice = {
		index: 0,
		model: 'Canon EOS 1500D',
		hardware_id: 'canoneos1500d_387afb538b1a4d19bed9156a8c16deef',
		calibrated: false,
		orientation: 270
	};
	const body1: CameraDevice = {
		index: 1,
		model: 'Canon EOS 1500D',
		hardware_id: 'canoneos1500d_6eafa426b8e14c7b8c0614cd658a595a',
		calibrated: false,
		orientation: 90
	};
	const placeholder0: CameraDevice = {
		...body0,
		hardware_id: 'canoneos1500d_idx0',
		orientation: null
	};

	function lastPublished(onDevicesChange: ReturnType<typeof vi.fn>): CameraDevice[] | undefined {
		return onDevicesChange.mock.calls.at(-1)?.[0] as CameraDevice[] | undefined;
	}

	for (const [name, first] of [
		['an empty list', [] as CameraDevice[]],
		['a list without camera 0', [body1]],
		['camera 0 under its placeholder id', [placeholder0, body1]]
	] as const) {
		it(`publishes camera 0 with its saved orientation when the first answer is ${name}`, async () => {
			vi.spyOn(camerasApi, 'listDevices')
				.mockResolvedValueOnce([...first])
				.mockResolvedValue([body0, body1]);
			const onDevicesChange = vi.fn();
			render(CameraControls, baseProps({ onDevicesChange }));

			await expect
				.poll(() => lastPublished(onDevicesChange)?.find((d) => d.index === 0)?.orientation, {
					timeout: 8000
				})
				.toBe(270);
		});
	}

	it('stops asking once the list is complete', async () => {
		const list = vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([body0, body1]);
		render(CameraControls, baseProps());
		await expect.poll(() => list.mock.calls.length).toBe(1);
		await new Promise((r) => setTimeout(r, 1500));
		expect(list).toHaveBeenCalledTimes(1);
	});

	it('stops asking when the screen is left', async () => {
		const list = vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([]);
		const screen = render(CameraControls, baseProps());
		await expect.poll(() => list.mock.calls.length).toBe(1);
		screen.unmount();
		await new Promise((r) => setTimeout(r, 1500));
		expect(list).toHaveBeenCalledTimes(1);
	});

	it('asks again after a failed read', async () => {
		vi.spyOn(camerasApi, 'listDevices')
			.mockRejectedValueOnce(new ApiError('Capture system not available', undefined, 503))
			.mockResolvedValue([body0, body1]);
		const onDevicesChange = vi.fn();
		render(CameraControls, baseProps({ onDevicesChange }));
		await expect
			.poll(() => lastPublished(onDevicesChange)?.find((d) => d.index === 0)?.orientation, {
				timeout: 8000
			})
			.toBe(270);
	});
});

// The capture format selector. It is shown for any camera whose capabilities
// list image_formats, and offers exactly those. A T7 (dslr_settings) and a
// CHDK compact (zoom_steps) both offer JPEG and RAW+JPEG; the line under the
// selector says what each format saves on that camera type. A CHDK camera
// takes the format alone, so it gets no shutter or ISO picker.
describe('CameraControls — capture format', () => {
	const formats = ['JPEG', 'RAW+JPEG'];
	const t7Capabilities: CameraCapabilities = dslrCapabilities;
	const chdkCapabilities: CameraCapabilities = {
		backend: 'chdk',
		live_preview: true,
		continuous_preview: false,
		focus_control: false,
		live_controls: false,
		zoom: false,
		zoom_steps: true,
		autofocus_calibration: false,
		dslr_settings: false,
		image_formats: formats
	};

	async function openPanel(caps: CameraCapabilities, reported: string | undefined) {
		vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps);
		const getSettings = vi
			.spyOn(camerasApi, 'getDSLRSettings')
			.mockResolvedValue(reported === undefined ? {} : { image_format: reported });
		const apply = vi.spyOn(camerasApi, 'applyDSLRSettings').mockResolvedValue({});
		const screen = render(CameraControls, baseProps());
		await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();
		return { screen, getSettings, apply };
	}

	function formatButton(): HTMLElement | null {
		const label = [...document.body.querySelectorAll('.control-label')].find(
			(el) => el.textContent === en.cam_format
		);
		return label?.parentElement?.querySelector<HTMLElement>('.control-btn') ?? null;
	}

	function dropdownOptions(): string[] {
		return [...document.body.querySelectorAll('.global-dropdown button')].map(
			(b) => b.textContent ?? ''
		);
	}

	it('a CHDK camera shows the selector, reads its stored format, and has no shutter or ISO', async () => {
		const { screen, getSettings } = await openPanel(chdkCapabilities, 'RAW+JPEG');
		await expect.element(screen.getByText(en.cam_format, { exact: true })).toBeVisible();
		await expect.poll(() => formatButton()?.textContent?.trim()).toBe('RAW+JPEG');
		expect(getSettings).toHaveBeenCalledWith(0);
		await expect.element(screen.getByText(en.cam_format_note_raw_chdk)).toBeVisible();
		expect(screen.getByText(en.cam_shutter, { exact: true }).elements()).toHaveLength(0);
		expect(screen.getByText('ISO', { exact: true }).elements()).toHaveLength(0);
	});

	// The lens-switch note is a DSLR instruction: a CHDK compact has no lens switch.
	it('a CHDK camera gets no lens-switch note; a T7 does', async () => {
		const chdk = await openPanel(chdkCapabilities, 'RAW+JPEG');
		await expect.element(chdk.screen.getByText(en.cam_format_note_raw_chdk)).toBeVisible();
		expect(chdk.screen.getByText(en.cam_dslr_note_p3).elements()).toHaveLength(0);
		chdk.screen.unmount();
		vi.restoreAllMocks();
		// The panel is remembered open (NEH-225); the second mount starts collapsed.
		localStorage.removeItem(STORAGE_KEYS.cameraPanelOpen);

		const t7 = await openPanel(t7Capabilities, 'RAW+JPEG');
		await expect.element(t7.screen.getByText(en.cam_format_note_raw_dslr)).toBeVisible();
		await expect.element(t7.screen.getByText(en.cam_dslr_note_p3)).toBeVisible();
	});

	it('a CHDK camera offers exactly the reported formats and saves the one picked', async () => {
		const { screen, apply } = await openPanel(chdkCapabilities, 'RAW+JPEG');
		await expect.poll(() => formatButton()?.textContent?.trim()).toBe('RAW+JPEG');
		formatButton()!.click();
		await expect.poll(dropdownOptions).toEqual(['JPEG', 'RAW+JPEG']);
		const jpeg = [...document.body.querySelectorAll<HTMLElement>('.global-dropdown button')].find(
			(b) => b.textContent === 'JPEG'
		)!;
		jpeg.click();
		await expect.poll(() => apply.mock.calls.length).toBe(1);
		expect(apply).toHaveBeenCalledWith(0, { image_format: 'JPEG' });
		await expect.element(screen.getByText(en.cam_format_note_jpeg)).toBeVisible();
		expect(screen.getByText(en.cam_format_note_raw_chdk).elements()).toHaveLength(0);
	});

	for (const [reported, shown] of [
		['RAW + L', 'RAW+JPEG'],
		['RAW', 'RAW+JPEG'],
		['RAW+JPEG', 'RAW+JPEG'],
		['L', 'JPEG'],
		['JPEG', 'JPEG']
	] as const) {
		it(`a T7 reporting ${reported} shows ${shown}`, async () => {
			const { screen } = await openPanel(t7Capabilities, reported);
			await expect.poll(() => formatButton()?.textContent?.trim()).toBe(shown);
			const note = shown === 'JPEG' ? en.cam_format_note_jpeg : en.cam_format_note_raw_dslr;
			await expect.element(screen.getByText(note)).toBeVisible();
			await expect.element(screen.getByText(en.cam_shutter, { exact: true })).toBeVisible();
		});
	}

	it('a T7 offers JPEG and RAW+JPEG only and sends RAW+JPEG', async () => {
		const { apply } = await openPanel(t7Capabilities, 'L');
		await expect.poll(() => formatButton()?.textContent?.trim()).toBe('JPEG');
		formatButton()!.click();
		await expect.poll(dropdownOptions).toEqual(['JPEG', 'RAW+JPEG']);
		[...document.body.querySelectorAll<HTMLElement>('.global-dropdown button')]
			.find((b) => b.textContent === 'RAW+JPEG')!
			.click();
		await expect.poll(() => apply.mock.calls.length).toBe(1);
		expect(apply).toHaveBeenCalledWith(0, { image_format: 'RAW+JPEG' });
	});

	it('offers only what the backend lists', async () => {
		await openPanel({ ...t7Capabilities, image_formats: ['JPEG'] }, 'L');
		await expect.poll(() => formatButton()?.textContent?.trim()).toBe('JPEG');
		formatButton()!.click();
		await expect.poll(dropdownOptions).toEqual(['JPEG']);
	});

	for (const [name, listed] of [
		['an empty list', []],
		['no list', undefined]
	] as const) {
		it(`a backend that reports ${name} shows no selector`, async () => {
			const caps: CameraCapabilities = {
				...dslrCapabilities,
				image_formats: listed ? [...listed] : undefined
			};
			const { screen } = await openPanel(caps, 'L');
			await expect.element(screen.getByText(en.cam_shutter, { exact: true })).toBeVisible();
			expect(screen.getByText(en.cam_format, { exact: true }).elements()).toHaveLength(0);
			expect(screen.getByText(en.cam_format_note_jpeg).elements()).toHaveLength(0);
		});
	}
});

// NEH-71: CameraControls must not keep its own copy of the rotation degree
// — it steps from the `rotateDeg` prop and only reports the change up via
// onRotateDegChange, so it can never go stale relative to LiveViewport's
// rotate overlay (both write through the same page-level state).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, camerasApi, type CameraCapabilities, type CameraDevice } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
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
  dslr_settings: true
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

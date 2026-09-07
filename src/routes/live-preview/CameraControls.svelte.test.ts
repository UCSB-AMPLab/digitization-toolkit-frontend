// NEH-71: CameraControls must not keep its own copy of the rotation degree
// — it steps from the `rotateDeg` prop and only reports the change up via
// onRotateDegChange, so it can never go stale relative to LiveViewport's
// rotate overlay (both write through the same page-level state).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraDevice } from '$lib/api';
import { locale } from '$lib/i18n';
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

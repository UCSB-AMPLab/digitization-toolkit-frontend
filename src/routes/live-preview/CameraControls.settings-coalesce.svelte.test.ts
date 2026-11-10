// NEH-154: live camera settings from different controls, sent within the
// debounce window, must all reach the camera. The sliders and the shutter
// and ISO pickers each send a partial CameraControlsRequest; the panel merges
// pending requests into one and sends the merged request once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type CameraCapabilities, type CameraDevice } from '$lib/api';
import { locale } from '$lib/i18n';
import CameraControls from './CameraControls.svelte';

const picameraCapabilities: CameraCapabilities = {
  backend: 'picamera2',
  live_preview: true,
  focus_control: false,
  live_controls: true,
  zoom: false,
  autofocus_calibration: false,
  dslr_settings: false
};

const cameras: CameraDevice[] = [
  { index: 0, model: 'Left camera', label: 'Left camera', hardware_id: 'hw-left', calibrated: false, orientation: 90 },
  { index: 1, model: 'Right camera', label: 'Right camera', hardware_id: 'hw-right', calibrated: false, orientation: 270 }
];

function props() {
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
    rotateDeg: { 0: 90, 1: 270 }
  };
}

type Screen = ReturnType<typeof render>;

async function openPanel(screen: Screen) {
  await screen.getByRole('button', { name: 'Camera controls', exact: true }).click();
  await expect.poll(() => screen.container.querySelector('.exposure-range')).not.toBeNull();
}

function slide(screen: Screen, selector: string, value: number) {
  const input = screen.container.querySelector<HTMLInputElement>(selector)!;
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Sent = [number, Record<string, unknown>];
let setControls: ReturnType<typeof vi.fn>;

function sent(): Sent[] {
  return setControls.mock.calls as unknown as Sent[];
}

beforeEach(() => {
  locale.set('en');
  vi.spyOn(camerasApi, 'listDevices').mockResolvedValue(cameras);
  vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(picameraCapabilities);
  setControls = vi.spyOn(camerasApi, 'setCameraControls').mockResolvedValue({} as never) as unknown as ReturnType<typeof vi.fn>;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sentKeys(): string[] {
  return sent().flatMap((c) => Object.keys(c[1])).sort();
}

describe('CameraControls — settings are coalesced (NEH-154)', () => {
  it('sends both the colour gains and the exposure when two sliders move within the debounce window', async () => {
    const screen = render(CameraControls, props());
    await openPanel(screen);

    slide(screen, '.slider-track-wrapper.temp input', 40);
    slide(screen, '.exposure-range', 2);
    await wait(400);

    expect(sentKeys()).toEqual(
      expect.arrayContaining(['awb_enable', 'colour_gains', 'ae_enable', 'exposure_value'])
    );
    const merged = sent().map((c) => c[1]);
    expect(merged.some((c) => 'colour_gains' in c)).toBe(true);
    expect(merged.some((c) => c.exposure_value === 2)).toBe(true);
  });

  it('sends the pending slider change together with an immediate shutter change', async () => {
    const screen = render(CameraControls, props());
    await openPanel(screen);

    slide(screen, '.slider-track-wrapper.temp input', 40);
    await screen.getByText('1/125s', { exact: true }).first().click();
    await screen.getByRole('button', { name: '1/60s', exact: true }).click();
    await wait(400);

    const merged = sent().map((c) => c[1]);
    expect(merged.some((c) => 'colour_gains' in c)).toBe(true);
    expect(merged.some((c) => c.exposure_time_us === 16667)).toBe(true);
  });

  it('sends one request holding both settings, and sends it once', async () => {
    const screen = render(CameraControls, props());
    await openPanel(screen);

    slide(screen, '.slider-track-wrapper.temp input', 40);
    slide(screen, '.exposure-range', 2);
    await wait(400);

    expect(setControls).toHaveBeenCalledTimes(1);
    const body = sent()[0][1];
    expect(body.colour_gains).toBeDefined();
    expect(body.exposure_value).toBe(2);
  });

  it('sends a pending change to the camera it was made on after the camera is switched', async () => {
    const screen = render(CameraControls, props());
    await openPanel(screen);

    slide(screen, '.exposure-range', 2);
    await screen.container.querySelector<HTMLElement>('.camera-name')!.click();
    await screen.getByText('Right camera [1]', { exact: false }).click();
    await wait(400);

    expect(setControls).toHaveBeenCalledTimes(1);
    expect(sent()[0][0]).toBe(0);
    expect(sent()[0][1]).toMatchObject({ exposure_value: 2 });
  });

  it('keeps changes made on different cameras apart', async () => {
    const screen = render(CameraControls, props());
    await openPanel(screen);

    slide(screen, '.exposure-range', 2);
    await screen.container.querySelector<HTMLElement>('.camera-name')!.click();
    await screen.getByText('Right camera [1]', { exact: false }).click();
    slide(screen, '.slider-track-wrapper.temp input', 40);
    await wait(400);

    const byCamera = new Map(sent().map((c) => [c[0], c[1]] as const));
    expect(byCamera.get(0)).toMatchObject({ exposure_value: 2 });
    expect(byCamera.get(0)).not.toHaveProperty('colour_gains');
    expect(byCamera.get(1)).toHaveProperty('colour_gains');
    expect(byCamera.get(1)).not.toHaveProperty('exposure_value');
  });

  it('sends the pending change when the panel is unmounted', async () => {
    const screen = render(CameraControls, props());
    await openPanel(screen);

    slide(screen, '.exposure-range', 2);
    screen.unmount();

    expect(setControls).toHaveBeenCalledTimes(1);
    expect(sent()[0][1]).toMatchObject({ exposure_value: 2 });
  });
});

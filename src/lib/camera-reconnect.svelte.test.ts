import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/stores/auth', () => ({
  authStore: {
    subscribe: (run: (state: unknown) => void) => {
      run({ user: { username: 'Operator', role: 'operator' } });
      return () => {};
    }
  }
}));

import Dashboard from '../routes/(dashboard)/dashboard/+page.svelte';
import CameraControls from '../routes/live-preview/CameraControls.svelte';
import { camerasApi, projectsApi, collectionsApi, recordsApi, type CameraDevice } from './api';
import { locale } from './i18n';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const devices: CameraDevice[] = [
  { index: 0, model: 'Recovered left', hardware_id: 'left', calibrated: false },
  { index: 1, model: 'Recovered right', hardware_id: 'right', calibrated: false }
];

beforeEach(() => {
  locale.set('en');
  vi.spyOn(projectsApi, 'list').mockResolvedValue([]);
  vi.spyOn(collectionsApi, 'count').mockResolvedValue(0);
  vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
  vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(new Error('not needed'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('reconnect screen wiring', () => {
  it.each(['initial-first', 'reconnect-first'])('dashboard retains the successful reconnect: %s', async (order) => {
    const initial = deferred<CameraDevice[]>();
    const rescan = deferred<CameraDevice[]>();
    vi.spyOn(camerasApi, 'listDevices').mockReturnValue(initial.promise);
    vi.spyOn(camerasApi, 'rescan').mockReturnValue(rescan.promise);
    const screen = render(Dashboard);
    await screen.getByRole('button', { name: 'Reconnect cameras' }).click();
    if (order === 'initial-first') { initial.resolve([]); await tick(); }
    rescan.resolve(devices);
    await expect.element(screen.getByText('Recovered right', { exact: true })).toBeVisible();
    if (order === 'reconnect-first') { initial.resolve([]); await initial.promise; await tick(); }
    await expect.element(screen.getByText('Recovered left', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('Recovered right', { exact: true })).toBeVisible();
  });

  it.each(['preview-first', 'reconnect-first'])('dashboard ignores a 404 from during reconnect: %s', async (order) => {
    vi.spyOn(camerasApi, 'listDevices').mockResolvedValue(devices);
    const rescan = deferred<CameraDevice[]>();
    vi.spyOn(camerasApi, 'rescan').mockReturnValue(rescan.promise);
    const preview = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => preview.promise));
    const screen = render(Dashboard);
    await expect.element(screen.getByText('Recovered left', { exact: true })).toBeVisible();
    await screen.getByRole('button', { name: 'Reconnect cameras' }).click();
    await screen.getByRole('button', { name: /Left Scanner Camera/ }).click();
    await screen.getByRole('button', { name: 'Test', exact: true }).click();
    expect(fetch).toHaveBeenCalled();
    if (order === 'preview-first') { preview.resolve(new Response('', { status: 404 })); await tick(); }
    rescan.resolve(devices);
    await expect.element(screen.getByRole('button', { name: 'Reconnect cameras' })).toBeEnabled();
    if (order === 'reconnect-first') { preview.resolve(new Response('', { status: 404 })); await preview.promise; await tick(); }
    await expect.element(screen.getByRole('button', { name: /Left Scanner Camera/ })).toHaveTextContent('OK');
  });

  it('a one-side 404 leaves the other side unknown', async () => {
    vi.spyOn(camerasApi, 'listDevices').mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const screen = render(Dashboard);
    await screen.getByRole('button', { name: /Left Scanner Camera/ }).click();
    await screen.getByRole('button', { name: 'Test', exact: true }).click();
    expect(fetch).toHaveBeenCalled();
    await expect.element(screen.getByRole('button', { name: /Left Scanner Camera/ })).toHaveTextContent('Not detected');
    await expect.element(screen.getByRole('button', { name: /Right Scanner Camera/ })).not.toHaveTextContent('Not detected');
  });

  it('an accepted preview 404 survives the initial list; a fresh list fills the other side', async () => {
    const initial = deferred<CameraDevice[]>();
    const fresh = deferred<CameraDevice[]>();
    const list = vi.spyOn(camerasApi, 'listDevices')
      .mockReturnValueOnce(initial.promise).mockReturnValueOnce(fresh.promise);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    const screen = render(Dashboard);
    const left = screen.getByRole('button', { name: /Left Scanner Camera/ });
    await left.click();
    await screen.getByRole('button', { name: 'Test', exact: true }).click();
    await expect.element(left).toHaveTextContent('Not detected');
    initial.resolve(devices);
    await expect.poll(() => list.mock.calls.length).toBe(2);
    await expect.element(left).toHaveTextContent('Not detected');
    fresh.resolve([devices[1]]);
    await expect.element(screen.getByText('Recovered right', { exact: true })).toBeVisible();
    await expect.element(left).toHaveTextContent('Not detected');
    await expect.element(screen.getByRole('button', { name: 'Test', exact: true })).toBeVisible();
  });

  it('dashboard reports reconnect failure and permits a retry', async () => {
    vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([]);
    vi.spyOn(camerasApi, 'rescan')
      .mockRejectedValueOnce(new Error('USB unavailable'))
      .mockResolvedValueOnce(devices);
    const screen = render(Dashboard);
    const reconnect = screen.getByRole('button', { name: 'Reconnect cameras' });
    await reconnect.click();
    await expect.element(screen.getByRole('status')).toHaveTextContent('USB unavailable');
    await expect.element(reconnect).toBeEnabled();
    await reconnect.click();
    await expect.element(screen.getByText('Recovered left', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('status')).not.toBeInTheDocument();
  });

  it.each(['initial-first', 'reconnect-first'])('controls publish reconnect to the parent: %s', async (order) => {
    const initial = deferred<CameraDevice[]>();
    const rescan = deferred<CameraDevice[]>();
    vi.spyOn(camerasApi, 'listDevices').mockReturnValue(initial.promise);
    vi.spyOn(camerasApi, 'rescan').mockReturnValue(rescan.promise);
    const onDevicesChange = vi.fn();
    const screen = render(CameraControls, {
      cameraMode: 'double', shutterSpeed: '1/125s', iso: '100', aperture: '5.6',
      onCameraModeChange: vi.fn(), onShutterSpeedChange: vi.fn(),
      onIsoChange: vi.fn(), onApertureChange: vi.fn(), onDevicesChange
    });
    // The controls panel starts collapsed on the kiosk.
    const expand = screen.getByRole('button', { name: 'Camera controls', exact: true });
    await expand.click();
    await screen.getByRole('button', { name: 'Reconnect cameras' }).click();
    if (order === 'initial-first') { initial.resolve([]); await tick(); }
    rescan.resolve(devices);
    await expect.poll(() => onDevicesChange.mock.calls.length).toBe(1);
    if (order === 'reconnect-first') { initial.resolve([]); await initial.promise; await tick(); }
    expect(onDevicesChange.mock.calls).toEqual([[devices]]);
    await expect.element(screen.getByText('Recovered left [0]', { exact: true })).toBeVisible();
  });
});

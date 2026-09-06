import { describe, expect, it, vi } from 'vitest';
import { createCameraRefresh } from './camera-refresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// These schedules represent initial enumeration, calibration reloads and
// preview requests racing the operator's reconnect action. No camera needed.
describe('camera refresh ordering', () => {
  it.each(['read-first', 'reconnect-first'])('reconnect beats an earlier device read: %s', async (order) => {
    const publish = vi.fn();
    const refresh = createCameraRefresh<string[]>(publish);
    const old = deferred<string[]>();
    const fresh = deferred<string[]>();
    const reading = refresh.read(() => old.promise);
    const reconnecting = refresh.reconnect(() => fresh.promise);
    if (order === 'read-first') { old.resolve([]); await reading; }
    fresh.resolve(['left', 'right']);
    await reconnecting;
    if (order === 'reconnect-first') { old.resolve([]); await reading; }
    expect(publish.mock.calls).toEqual([[['left', 'right']]]);
  });

  it.each(['before', 'during'])('ignores a preview started %s reconnect, on either completion order', async (start) => {
    for (const early of [true, false]) {
      const refresh = createCameraRefresh<string[]>(vi.fn());
      const fresh = deferred<string[]>();
      const previous = refresh.previewToken();
      const reconnecting = refresh.reconnect(() => fresh.promise);
      const token = start === 'before' ? previous : refresh.previewToken();
      if (early) expect(refresh.acceptPreview(token)).toBe(false);
      fresh.resolve(['left', 'right']);
      await reconnecting;
      expect(refresh.acceptPreview(token)).toBe(false);
      expect(refresh.acceptPreview(refresh.previewToken())).toBe(true);
    }
  });

  it('one preview side does not invalidate the other', () => {
    const refresh = createCameraRefresh(vi.fn());
    const left = refresh.previewToken();
    const right = refresh.previewToken();
    expect(refresh.acceptPreview(left)).toBe(true);
    expect(refresh.acceptPreview(right)).toBe(true);
  });

  it.each([false, true])('defers a calibration reload until reconnect settles (failure=%s)', async (failure) => {
    const publish = vi.fn();
    const refresh = createCameraRefresh<string[]>(publish);
    const fresh = deferred<string[]>();
    const reconnecting = refresh.reconnect(() => fresh.promise);
    const outcome = reconnecting.catch(error => error);
    const load = vi.fn(async () => ['calibrated']);
    const reading = refresh.read(load);
    expect(load).not.toHaveBeenCalled();
    if (failure) fresh.reject(new Error('USB error'));
    else fresh.resolve(['reconnected']);
    await outcome;
    await reading;
    expect(load).toHaveBeenCalledOnce();
    expect(publish.mock.calls).toEqual(failure ? [[['calibrated']]] : [[['reconnected']], [['calibrated']]]);
  });

  it('rejects old reads and previews even when reconnect fails; permits fresh work', async () => {
    const publish = vi.fn();
    const failedRead = vi.fn();
    const refresh = createCameraRefresh<string[]>(publish);
    const old = deferred<string[]>();
    const reading = refresh.read(() => old.promise, failedRead);
    const before = refresh.previewToken();
    const fresh = deferred<string[]>();
    const reconnecting = refresh.reconnect(() => fresh.promise);
    const during = refresh.previewToken();
    fresh.reject(new Error('USB error'));
    await expect(reconnecting).rejects.toThrow('USB error');
    old.reject(new Error('old enumeration error'));
    await reading;
    expect(failedRead).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(refresh.acceptPreview(before)).toBe(false);
    expect(refresh.acceptPreview(during)).toBe(false);
    expect(refresh.acceptPreview(refresh.previewToken())).toBe(true);
    await refresh.read(async () => ['fresh']);
    expect(publish).toHaveBeenCalledWith(['fresh']);
  });

  it.each(['older-first', 'newer-first'])('latest requested normal read wins: %s', async (order) => {
    const publish = vi.fn();
    const refresh = createCameraRefresh<string[]>(publish);
    const old = deferred<string[]>();
    const fresh = deferred<string[]>();
    const first = refresh.read(() => old.promise);
    const second = refresh.read(() => fresh.promise);
    if (order === 'older-first') { old.resolve(['old']); await first; }
    fresh.resolve(['new']); await second;
    if (order === 'newer-first') { old.resolve(['old']); await first; }
    expect(publish.mock.calls).toEqual([[['new']]]);
  });

  it.each(['snapshot', 'error'])('re-reads after an accepted preview supersedes an older %s', async (outcome) => {
    let state = { left: 'unknown', right: 'unknown' };
    const refresh = createCameraRefresh<typeof state>(value => { state = value; });
    const old = deferred<typeof state>();
    const fresh = deferred<typeof state>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const onError = vi.fn();
    const reading = refresh.read(load, onError);
    expect(refresh.acceptPreview(refresh.previewToken())).toBe(true);
    state.left = 'not-found';
    if (outcome === 'snapshot') old.resolve({ left: 'ok', right: 'ok' });
    else old.reject(new Error('old failure'));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(state).toEqual({ left: 'not-found', right: 'unknown' });
    fresh.resolve({ left: 'not-found', right: 'ok' });
    await reading;
    expect(state).toEqual({ left: 'not-found', right: 'ok' });
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['read', 'reconnect'] as const)('a newer %s takes precedence over a preview-triggered retry', async (operation) => {
    const publish = vi.fn();
    const refresh = createCameraRefresh<string[]>(publish);
    const old = deferred<string[]>();
    const retry = deferred<string[]>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(retry.promise);
    const reading = refresh.read(load);
    expect(refresh.acceptPreview(refresh.previewToken())).toBe(true);
    old.resolve(['stale']);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await refresh[operation](async () => ['newest']);
    retry.resolve(['superseded retry']);
    await reading;
    expect(publish.mock.calls).toEqual([[['newest']]]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('another accepted preview during the retry also survives its old snapshot', async () => {
    const publish = vi.fn();
    const refresh = createCameraRefresh<string[]>(publish);
    const old = deferred<string[]>();
    const retry = deferred<string[]>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(retry.promise)
      .mockResolvedValueOnce(['fresh']);
    const reading = refresh.read(load);
    expect(refresh.acceptPreview(refresh.previewToken())).toBe(true);
    old.resolve(['old']);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(refresh.acceptPreview(refresh.previewToken())).toBe(true);
    retry.resolve(['also old']);
    await reading;
    expect(publish.mock.calls).toEqual([[['fresh']]]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('reports a current read failure', async () => {
    const error = new Error('enumeration failed');
    const onError = vi.fn();
    const refresh = createCameraRefresh(vi.fn());
    await refresh.read(async () => { throw error; }, onError);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('does not issue overlapping reconnects', async () => {
    const refresh = createCameraRefresh(vi.fn());
    const pending = deferred<unknown>();
    const first = refresh.reconnect(() => pending.promise);
    const load = vi.fn();
    await expect(refresh.reconnect(load)).rejects.toThrow('Reconnect already in progress');
    expect(load).not.toHaveBeenCalled();
    pending.resolve([]); await first;
  });
});

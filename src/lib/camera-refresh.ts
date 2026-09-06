/**
 * Orders one screen's camera observations. Reconnect owns the device state
 * until it settles: earlier reads are invalidated, reads requested during it
 * wait, then fetch, and previews from either period cannot change status.
 * Outside reconnect, the latest requested list wins, but an accepted preview
 * invalidates any in-flight snapshot. That read retries with fresh data unless
 * a newer read or reconnect supersedes the operation. Preview sides never
 * invalidate each other. Publish must synchronously update all list consumers.
 */
export function createCameraRefresh<T>(publish: (value: T) => void) {
  let epoch = 0;
  let readSequence = 0;
  let previewSequence = 0;
  let reconnectDone: Promise<void> | null = null;

  return {
    async read(load: () => Promise<T>, onError?: (error: unknown) => void): Promise<void> {
      // A calibration may finish while USB recovery is still running. Fetch
      // its metadata after recovery instead of dropping the calibration reload.
      while (reconnectDone) await reconnectDone;
      const started = epoch;
      const sequence = ++readSequence;
      const current = () => started === epoch && sequence === readSequence;
      while (current()) {
        const observedPreview = previewSequence;
        try {
          const value = await load();
          if (!current()) return;
          // A preview is newer evidence than this snapshot. Keep its status
          // visible while re-reading metadata (including the untouched side).
          if (observedPreview !== previewSequence) continue;
          publish(value);
        } catch (error) {
          if (!current()) return;
          if (observedPreview !== previewSequence) continue;
          onError?.(error);
        }
        return;
      }
    },

    async reconnect(load: () => Promise<T>): Promise<void> {
      // Callers must guard/disable their action while reconnect is in flight.
      if (reconnectDone) throw new Error('Reconnect already in progress');
      let release!: () => void;
      reconnectDone = new Promise<void>(resolve => { release = resolve; });
      ++epoch;
      try {
        publish(await load());
      } finally {
        // Failure also ends the operation: no pre-recovery observation should
        // masquerade as its outcome. Fresh polling/reads can now proceed.
        ++epoch;
        reconnectDone = null;
        release();
      }
    },

    previewToken(): number | null {
      return reconnectDone ? null : epoch;
    },

    // Call only when committing a preview status, not as a read-only check.
    // Record it without invalidating the other side's preview token.
    acceptPreview(token: number | null): boolean {
      if (token === null || reconnectDone || token !== epoch) return false;
      ++previewSequence;
      return true;
    }
  };
}

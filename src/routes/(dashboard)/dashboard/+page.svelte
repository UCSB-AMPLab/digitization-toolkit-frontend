<script lang="ts">
  // The overview page at /dashboard, one page for every role: KPIs, the
  // volumes in progress and the activity calendar for all of them, plus the
  // camera test panel for admin and operator (`canSeeCameras`). The camera
  // panel polls still frames from `/cameras/preview/{index}`; every camera
  // status write goes through `applyCameraSides` so that a reconnect and a
  // late preview cannot overwrite each other. While recaptures are pending
  // (0.2.0), `RetakeBand` puts them first, from GET /records/to-retake/summary.
  //
  // Version: 0.2.0

  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, projectsApi, collectionsApi, recordsApi, AuthError, tokenStore, getApiBase,
           type Collection, type Project, type RetakeSummary } from '$lib/api';
  import { readRetakeSummary } from '$lib/recapture-turn';
  import { m } from '$lib/i18n';
  import { describeCaptureFailure, describeTestCapture, type CaptureOutcome } from '$lib/capture-outcome';
  import { sidesFromDevices, type SideInfo, type SideStatus } from '$lib/camera-sides';
  import { createCameraRefresh } from '$lib/camera-refresh';
  import InProgress from './InProgress.svelte';
  import ActivityCalendar from './ActivityCalendar.svelte';
  import StorageAlert from './StorageAlert.svelte';
  import RetakeBand from './RetakeBand.svelte';

  let currentUser = $state<any>(null);
  let userRole    = $state('');

  onMount(() => {
    const unsub = authStore.subscribe(s => {
      currentUser = s.user;
      userRole    = s.user?.role ?? '';
    });
    return unsub;
  });

  let isAdmin    = $derived(userRole === 'admin');
  let isOperator = $derived(userRole === 'operator');
  let isReviewer = $derived(userRole === 'reviewer');
  let canSeeCameras = $derived(isAdmin || isOperator);

  let userName = $derived(
    currentUser?.username
      ? currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1)
      : $m.dash_greeting_fallback
  );

  let projectCount    = $state(0);
  let collectionCount = $state(0);
  let recordCount     = $state(0);
  let isLoadingStats  = $state(true);

  // Volumes and projects already loaded for the KPIs; `InProgress.svelte`
  // builds its table and board from them (NEH-233).
  let allCollections = $state<Collection[]>([]);
  let allProjects    = $state<Project[]>([]);

  let expandedCamera = $state<'left' | 'right' | null>(null);
  let previewUrls    = $state<Record<string, string>>({});
  let streamActive   = $state<Record<string, boolean>>({ left: false, right: false });
  let cameraStatus   = $state<Record<string, 'ok' | 'not-found' | 'unknown'>>({ left: 'unknown', right: 'unknown' });
  let cameraModel    = $state<Record<string, string | null>>({ left: null, right: null });
  type CameraSides = { left: SideInfo; right: SideInfo };
  // Writers: initial enumeration, reconnect, and per-side preview results.
  // List writers use cameraRefresh; previews check its recovery token and
  // patch only their own side. Every status/model write happens here.
  function applyCameraSides(sides: Partial<CameraSides>) {
    for (const side of ['left', 'right'] as const) {
      const info = sides[side];
      if (!info) continue;
      cameraStatus = { ...cameraStatus, [side]: info.status };
      cameraModel = { ...cameraModel, [side]: info.model };
    }
  }
  const cameraRefresh = createCameraRefresh<CameraSides>(applyCameraSides);

  function applyPreviewStatus(token: number | null, side: string, status: SideStatus): boolean {
    if (!cameraRefresh.acceptPreview(token)) return false;
    applyCameraSides({ [side]: { status, model: cameraModel[side] } });
    return true;
  }
  let previewIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  let isFetchingPreview: Record<string, boolean> = {};
  // Result of the last test capture per camera. A success is cleared after
  // 4 s; a failure stays until the next capture or camera issue, so that it
  // does not disappear on its own.
  let captureStatus = $state<Record<'left' | 'right', CaptureOutcome | null>>({ left: null, right: null });
  // Timeout that clears an "ok" result after 4 s. A second capture inside
  // that window must cancel the first one's timer, or it would erase the
  // second one's result, success or error (NEH-166).
  let captureClearTimers: Record<'left' | 'right', ReturnType<typeof setTimeout> | null> = { left: null, right: null };
  // true while a capture request is in flight for that side; it disables the
  // button so that two captures on the same camera cannot overlap.
  let captureInFlight = $state<Record<'left' | 'right', boolean>>({ left: false, right: false });
  // Non-reactive counter per side: each capture increments it and keeps its
  // own value in `seq`; if the counter has moved on when the capture returns,
  // the response is stale and must not write to `captureStatus`. A backstop —
  // with the button disabled during the request it should never trigger.
  let captureSeq: Record<'left' | 'right', number> = { left: 0, right: 0 };
  // A failed focus or preview request per camera, shown on the same status
  // line as the test capture. The latest event owns the line: a new issue
  // clears an older capture result, and a new capture result hides the
  // issue. The preview poll repeats the same issue every few seconds, so
  // only a change of issue counts as new.
  let cameraIssue = $state<Record<'left' | 'right', { kind: 'focus' | 'preview'; text: string } | null>>({ left: null, right: null });
  function setIssue(side: 'left' | 'right', issue: { kind: 'focus' | 'preview'; text: string } | null) {
    const current = cameraIssue[side];
    if (issue && (current?.kind !== issue.kind || current.text !== issue.text) && captureStatus[side]) {
      if (captureClearTimers[side]) {
        clearTimeout(captureClearTimers[side]!);
        captureClearTimers[side] = null;
      }
      captureStatus = { ...captureStatus, [side]: null };
    }
    cameraIssue = { ...cameraIssue, [side]: issue };
  }

  const PREVIEW_INTERVAL_MS = 2500;

  // Null until it arrives, and when it cannot be loaded: then no band.
  let retakeSummary = $state<RetakeSummary | null>(null);

  async function loadRetakeSummary() {
    try {
      retakeSummary = readRetakeSummary(await recordsApi.toRetakeSummary());
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) return;
      console.error('[Dashboard] Error loading the recapture summary:', err);
    }
  }

  onMount(async () => {
    await Promise.all([
      loadStats(),
      loadRetakeSummary(),
      canSeeCameras ? checkCamerasStatus() : Promise.resolve(),
    ]);
  });

  onDestroy(() => {
    Object.values(previewIntervals).forEach(clearInterval);
    Object.values(previewUrls).forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
    Object.values(captureClearTimers).forEach(timer => { if (timer) clearTimeout(timer); });
  });

  async function loadStats() {
    try {
      isLoadingStats = true;
      const [projects, collectionCountResult, count] = await Promise.all([
        projectsApi.list(),
        collectionsApi.count(),
        recordsApi.count(),
      ]);
      projectCount    = projects.length;
      collectionCount = collectionCountResult;
      recordCount     = count;
      allProjects     = projects;
      allCollections  = await collectionsApi.listAll();
    } catch (err) {
      console.error('[Dashboard] Stats error:', err);
    } finally {
      isLoadingStats = false;
    }
  }

  async function checkCamerasStatus() {
    await cameraRefresh.read(
      async () => sidesFromDevices(await camerasApi.listDevices()),
      (err) => {
        // A dead login is not a hardware failure; apiRequest redirects (NEH-64).
        if (err instanceof AuthError && err.status === 401) return;
        applyCameraSides({
          left: { status: 'not-found', model: null },
          right: { status: 'not-found', model: null }
        });
      }
    );
  }

  // true while a "reconnect cameras" request is in flight; it prevents two
  // overlapping reconnects and disables the button meanwhile.
  let rescanInFlight = $state(false);
  // Error message of the last failed reconnect, or null if none is pending.
  let rescanError = $state<string | null>(null);

  async function rescanCameras() {
    if (rescanInFlight) return;
    rescanInFlight = true;
    try {
      await cameraRefresh.reconnect(async () => sidesFromDevices(await camerasApi.rescan()));
      rescanError = null;
    } catch (err) {
      // A 401 means a dead session, not a failed reconnect — `apiRequest`
      // has already cleared the session and redirects to /login (as in
      // `checkCamerasStatus`, NEH-64).
      if (err instanceof AuthError && err.status === 401) return;
      rescanError = err instanceof Error ? err.message : String(err);
    } finally {
      rescanInFlight = false;
    }
  }

  function toggleCamera(side: 'left' | 'right') {
    if (expandedCamera === side) {
      expandedCamera = null;
      if (streamActive[side]) stopStream(side);
    } else {
      expandedCamera = side;
    }
  }

  function getAuthHeader(): HeadersInit {
    const token = tokenStore.get();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function startStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: true };
    const index = side === 'left' ? 0 : 1;
    await fetchFrame(side, index);
    // `fetchFrame()` may have stopped the stream (camera not found, 404)
    // during the await; in that case no polling is set up.
    if (!streamActive[side]) return;
    if (previewIntervals[side]) clearInterval(previewIntervals[side]);
    previewIntervals[side] = setInterval(() => fetchFrame(side, index), PREVIEW_INTERVAL_MS);
  }

  function stopStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: false };
    if (cameraIssue[side]?.kind === 'preview') setIssue(side, null);
    if (previewIntervals[side]) { clearInterval(previewIntervals[side]); delete previewIntervals[side]; }
    if (previewUrls[side]) { URL.revokeObjectURL(previewUrls[side]); previewUrls = { ...previewUrls, [side]: '' }; }
  }

  // Polls still frames. TODO: if the backend gains a streaming endpoint
  // (`/cameras/stream/{index}`), an `<img>` pointed at it can replace this
  // function and the polling.
  async function fetchFrame(side: string, index: number) {
    if (isFetchingPreview[side]) return;
    isFetchingPreview[side] = true;
    const token = cameraRefresh.previewToken();
    // A failure from before or during a reconnect says nothing about the
    // camera now. Read-only check: acceptPreview would count it as a
    // status observation.
    const failureCounts = () =>
      streamActive[side as 'left' | 'right'] && token !== null && cameraRefresh.previewToken() === token;
    try {
      const res = await fetch(`${getApiBase()}/cameras/preview/${index}`, { headers: getAuthHeader() });
      if (res.status === 404) {
        // A preview from before/during reconnect cannot undo its result or
        // stop the stream. An accepted failure changes only this camera.
        if (applyPreviewStatus(token, side, 'not-found')) {
          stopStream(side as 'left' | 'right');
        }
        return;
      }
      if (!res.ok) {
        if (failureCounts()) {
          setIssue(side as 'left' | 'right', { kind: 'preview', text: $m.dash_camera_preview_error });
        }
        return;
      }
      if (res.ok) {
        // A good frame is evidence the body is there, whether the badge said
        // not-found or was still unknown while the device list loaded.
        if (cameraStatus[side] !== 'ok') {
          applyPreviewStatus(token, side, 'ok');
        }
        if (cameraIssue[side as 'left' | 'right']?.kind === 'preview') setIssue(side as 'left' | 'right', null);
        const blob = await res.blob();
        // If the operator stopped the stream while this request was in
        // flight, the frame is late: it is not shown, because no polling is
        // left to replace it and the box would keep a stale image next to
        // "Test". A test capture is shown with the stream stopped (NEH-166),
        // but that goes through `handleCapture`.
        if (!streamActive[side as 'left' | 'right']) return;
        const url = URL.createObjectURL(blob);
        if (previewUrls[side]) URL.revokeObjectURL(previewUrls[side]);
        previewUrls = { ...previewUrls, [side]: url };
      }
    } catch (e) {
      console.error('[Dashboard] Preview request failed:', e);
      if (failureCounts()) {
        setIssue(side as 'left' | 'right', { kind: 'preview', text: $m.dash_camera_preview_error });
      }
    }
    finally { isFetchingPreview[side] = false; }
  }

  async function handleFocus(side: 'left' | 'right') {
    if (cameraIssue[side]?.kind === 'focus') setIssue(side, null);
    try {
      await camerasApi.calibrate({ camera_index: side === 'left' ? 0 : 1 });
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) return;
      console.error('[Dashboard] Focus failed:', e);
      setIssue(side, { kind: 'focus', text: $m.dash_camera_focus_error });
    }
  }

  async function handleCapture(side: 'left' | 'right') {
    // A capture already in flight on this side means the click is ignored,
    // so two requests cannot overlap and overwrite each other's result
    // (NEH-166).
    if (captureInFlight[side]) return;
    captureInFlight = { ...captureInFlight, [side]: true };
    // Marks this capture as the latest for this side; any later write to
    // `captureStatus[side]` that does not carry this number is stale and is
    // dropped.
    const seq = ++captureSeq[side];
    // Cancels the clear timer of an earlier capture on this camera, if any,
    // so that it does not erase this capture's result (NEH-166).
    if (captureClearTimers[side]) {
      clearTimeout(captureClearTimers[side]!);
      captureClearTimers[side] = null;
    }
    captureStatus = { ...captureStatus, [side]: null };
    // An old focus failure would come back once a good capture's line clears.
    if (cameraIssue[side]?.kind === 'focus') setIssue(side, null);
    try {
      const index = side === 'left' ? 0 : 1;
      const result = await camerasApi.testCapture(index);
      if (seq === captureSeq[side]) {
        // The captured image replaces this side's preview frame until the
        // next real frame arrives (NEH-166), so the operator sees what the
        // camera actually took, in the same box.
        const url = URL.createObjectURL(result.blob);
        if (previewUrls[side]) URL.revokeObjectURL(previewUrls[side]);
        previewUrls = { ...previewUrls, [side]: url };
        const outcome = describeTestCapture(result, url);
        captureStatus = { ...captureStatus, [side]: outcome };
        captureClearTimers[side] = setTimeout(() => {
          captureClearTimers[side] = null;
          // Clear only if the result is still the "ok" this timer was set
          // for — a later capture may already have changed it (success or
          // error).
          if (seq === captureSeq[side] && captureStatus[side]?.kind === 'ok') {
            captureStatus = { ...captureStatus, [side]: null };
          }
        }, 4000);
      }
    } catch (e) {
      if (seq === captureSeq[side]) {
        console.error('[Dashboard] Test capture error:', e);
        captureStatus = { ...captureStatus, [side]: describeCaptureFailure(e, $m) };
      }
    } finally {
      captureInFlight = { ...captureInFlight, [side]: false };
    }
  }

</script>

<div class="page">

  <div class="page-header">
    <h1 class="greeting">{$m.dash_greeting(userName)}</h1>
    <p class="subtitle">
      {#if isAdmin}{$m.dash_subtitle_admin}
      {:else if isOperator}{$m.dash_subtitle_operator}
      {:else}{$m.dash_subtitle_reviewer}
      {/if}
    </p>
  </div>

  <StorageAlert />

  <RetakeBand summary={retakeSummary} canRetake={canSeeCameras} />

  <div class="kpi-grid">

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-primary)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : projectCount}</div>
      <div class="kpi-label">{$m.dash_kpi_active_projects}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-secondary)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : collectionCount}</div>
      <div class="kpi-label">{$m.dash_kpi_collections}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-warning)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : recordCount.toLocaleString()}</div>
      <div class="kpi-label">{$m.dash_kpi_total_records}</div>
    </div>

  </div>

  <!-- Volumes in progress (NEH-233): direct access to capture or review a
       given volume. `InProgress` draws nothing when no volume has records. -->
  <InProgress collections={allCollections} projects={allProjects} />

  <ActivityCalendar />

  {#if canSeeCameras}
    <div class="section">
      <h2 class="section-title">{$m.dash_test_cameras}</h2>

      <div class="cameras-layout">
        {#each (['left', 'right'] as const) as side}
          {@const isExpanded = expandedCamera === side}
          {@const label = side === 'left' ? $m.dash_camera_left : $m.dash_camera_right}
          {@const status = cameraStatus[side]}
          {@const active = streamActive[side]}

          <div class="camera-panel" class:expanded={isExpanded}>

            <button class="camera-toggle-btn" class:expanded={isExpanded} onclick={() => toggleCamera(side)}>
              <div class="cam-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
              <div class="cam-info">
                <span class="cam-name">{label}</span>
                <span class="cam-model">{cameraModel[side] ?? '—'}</span>
              </div>
              <div class="cam-badge" class:ok={status === 'ok'} class:notfound={status === 'not-found'}>
                {#if status === 'ok'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  OK
                {:else if status === 'not-found'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  {$m.camera_not_detected}
                {:else}—{/if}
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="transform: rotate({isExpanded ? 180 : 0}deg); transition: transform 0.3s ease; flex-shrink:0; color: var(--color-light-grey)">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {#if isExpanded}
              <div class="cam-expanded">
                <div class="preview-area">
                  {#if previewUrls[side]}
                    <img src={previewUrls[side]} alt={side === 'left' ? $m.dash_camera_left : $m.dash_camera_right} class="preview-img" />
                  {:else}
                    <div class="no-signal">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                      <span>{$m.dash_camera_not_active}</span>
                    </div>
                  {/if}
                </div>

                <button class="btn-probar" onclick={() => active ? stopStream(side) : startStream(side)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    {#if active}
                      <rect x="6" y="6" width="12" height="12" rx="1"/>
                    {:else}
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="3"/>
                    {/if}
                  </svg>
                  {active ? $m.dash_camera_stop : $m.dash_camera_test}
                </button>

                <div class="secondary-btns">
                  <button class="btn-secondary" onclick={() => handleFocus(side)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                    {$m.dash_camera_focus}
                  </button>
                  <button class="btn-secondary" disabled={captureInFlight[side]} onclick={() => handleCapture(side)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    {$m.common_capture}
                  </button>
                </div>
                {#if !captureStatus[side] && cameraIssue[side]}
                  <p class="capture-status is-error" role="status">{cameraIssue[side].text}</p>
                {/if}
                {#if captureStatus[side]}
                  <p
                    class="capture-status"
                    class:is-error={captureStatus[side].kind === 'error'}
                    role="status"
                  >
                    {captureStatus[side].kind === 'ok' ? $m.dash_camera_capture_ok : $m.dash_camera_capture_error}
                    {#if captureStatus[side].kind === 'ok' && captureStatus[side].seconds != null}
                      {$m.dash_camera_capture_took(captureStatus[side].seconds.toFixed(1))}
                    {/if}
                    {#if captureStatus[side].kind === 'error' && captureStatus[side].detail}: {captureStatus[side].detail}{/if}
                  </p>
                {/if}
              </div>
            {/if}

          </div>
        {/each}
      </div>

      <!-- Camera recovery: reconnect after a loose cable or a camera that went
           to sleep (NEH-229). Always visible with the camera section; the
           "missing camera" hint appears only when a side is not-found. -->
      <div class="cam-recovery">
        {#if cameraStatus.left === 'not-found' || cameraStatus.right === 'not-found'}
          {@const missingLabels = (['left', 'right'] as const)
            .filter(side => cameraStatus[side] === 'not-found')
            .map(side => (side === 'left' ? $m.dash_camera_left : $m.dash_camera_right))
            .join(' / ')}
          <p class="cam-hint">{$m.dash_camera_missing_hint(missingLabels)}</p>
        {/if}
        <button class="btn-secondary" disabled={rescanInFlight} onclick={rescanCameras}>
          {$m.dash_camera_reconnect}
        </button>
        {#if rescanError}
          <p class="capture-status is-error" role="status">
            {$m.dash_camera_reconnect_error}: {rescanError}
          </p>
        {/if}
      </div>
    </div>
  {/if}

  {#if canSeeCameras}
    <div class="cameras-badge">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span>{$m.dash_two_cameras}</span>
      <div class="cam-dot" class:ok={cameraStatus.left === 'ok' || cameraStatus.right === 'ok'}></div>
    </div>
  {/if}

</div>

<style>
  .page { padding: 32px 32px 80px; max-width: 1100px; position: relative; }

  .page-header { margin-bottom: 28px; }
  .greeting { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* KPIs */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 36px;
  }

  .kpi-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 20px 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform var(--transition-base);
  }

  .kpi-card:hover { transform: translateY(-3px); }

  .kpi-line {
    width: 32px;
    height: 3px;
    border-radius: var(--radius-full);
    margin-bottom: 4px;
  }

  .kpi-number { font-size: var(--text-h1); font-weight: var(--fw-extrabold); color: var(--color-light); line-height: 1; margin: 0; }
  .kpi-label  { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .section { margin-bottom: 36px; }
  .section-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 20px; }

  .cameras-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .camera-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: border-color var(--transition-base);
  }

  .camera-panel.expanded { border-color: rgba(90,140,98,0.4); }

  .camera-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: none; border: none;
    cursor: pointer;
    min-height: var(--touch-target-min);
    transition: background-color var(--transition-fast);
  }

  .camera-toggle-btn:hover    { background-color: rgba(255,255,255,0.03); }
  .camera-toggle-btn.expanded { background-color: rgba(90,140,98,0.08); }

  .cam-icon {
    width: 30px; height: 30px;
    border-radius: var(--radius-sm);
    background-color: rgba(74,112,144,0.2);
    display: flex; align-items: center; justify-content: center;
    color: #8aaac8; flex-shrink: 0;
  }

  .cam-info { display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0; }
  .cam-name  { font-size: 13px; font-weight: var(--fw-bold); color: var(--color-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cam-model { font-size: 11px; color: var(--color-light-grey); }

  .cam-recovery { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 12px; }
  .cam-hint { font-size: 12px; color: var(--color-light-grey); margin: 0; }

  .cam-badge {
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: var(--fw-bold);
    padding: 3px 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    background-color: rgba(171,183,183,0.1);
    color: var(--color-light-grey);
    border: 1px solid var(--border-color);
  }

  .cam-badge.ok       { background-color: rgba(90,140,98,0.15); color: var(--color-primary); border-color: var(--color-primary); }
  .cam-badge.notfound { background-color: rgba(214,103,74,0.12); color: var(--color-error); border-color: var(--color-error); }

  .cam-expanded {
    padding: 0 16px 16px;
    border-top: 1px solid var(--border-color);
    display: flex; flex-direction: column; gap: 10px;
  }

  .preview-area {
    width: 100%; aspect-ratio: 16/9;
    background-color: #0a0a0a;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    margin-top: 12px;
  }

  .preview-img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .no-signal {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: var(--color-light-grey); opacity: 0.35;
    font-size: var(--text-sm);
  }

  .btn-probar {
    width: 100%; height: 44px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; transition: background-color var(--transition-base);
  }

  .btn-probar:hover { background-color: var(--color-primary-hover); }

  .secondary-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

  .btn-secondary {
    height: 40px;
    background: none; border: 1px solid var(--border-color); border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center; gap: 7px;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: 0;
  }

  .btn-secondary:hover { border-color: var(--color-primary); color: var(--color-light); }
  .btn-secondary:disabled { opacity: 0.5; cursor: default; pointer-events: none; }

  .capture-status { margin: 8px 0 0; font-size: var(--text-sm); color: var(--color-light-grey); }
  .capture-status.is-error { color: var(--color-error); }

  .cameras-badge {
    position: fixed; bottom: 24px; right: 24px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-full);
    padding: 8px 16px;
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: var(--fw-bold);
    color: var(--color-light);
    box-shadow: var(--shadow-md); z-index: 50;
  }

  .cam-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background-color: var(--color-light-grey); flex-shrink: 0;
  }

  .cam-dot.ok { background-color: var(--color-success); box-shadow: 0 0 6px rgba(111,191,115,0.5); }
</style>
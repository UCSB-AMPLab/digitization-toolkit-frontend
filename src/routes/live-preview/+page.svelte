<script lang="ts">
  // Capture screen, at /live-preview?projectId=X&collectionId=Y (optionally
  // &recordId=Z). The page holds the state its children share — camera mode,
  // exposure values, per-camera rotation, the volume's records — and passes it
  // down as props; `CameraControls`, `LiveViewport`, `ThumbnailStrip` and
  // `ImageViewerModal` do the rendering. Only admin and operator may use it;
  // a reviewer is redirected (role guard in `onMount`, NEH-66). When the
  // volume is an item of a stored digitisation list, `CaptureInstruction`
  // shows that item's notes and action under the top bar: the item of the
  // newest list for this volume (GET /imports/digitisation-lists), or, when
  // no list has one, the notes the import kept in the volume's
  // custom_attributes.
  //
  // The recapture turn (0.2.0), from GET /records/to-retake/summary: an
  // empty volume while the turn is `recaptures` gets the block panel instead
  // of the capture controls (an admin may capture anyway), and an empty
  // volume while the turn is `new` gets the green band that says it may be
  // started. Opened with the `recordId` of a rejected record, the screen
  // guides the operator through the volume's rejected records in sequence
  // order: each successful retake opens the next, "Saltar por ahora" defers
  // the record to the back, and the end panel shows once the volume has
  // nothing pending. A failed reload after a retake pauses the guide with a
  // retry; until the next state is on screen, ordinary capture stays blocked.
  //
  // Version: 0.2.0

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore, userRole } from '$lib/stores/auth';
  import { camerasApi, recordsApi, projectsApi, collectionsApi, importsApi, type Record as ApiRecord, type CameraDevice,
           type QueueItem, type RetakeSummary, type RetakeSummaryVolume } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { m } from '$lib/i18n';
  import { seedRotation, createOrientationSaver, canSaveRotation, settlePendingRotations } from '$lib/camera-orientation';
  import { isConflict, needsStem } from '$lib/volume-stem';
  import { CaptureFailed, captureErrorText } from '$lib/capture-errors';
  import { captureInstruction, instructionForVolume, retakeUrl, type CaptureInstruction as Instruction } from '$lib/queue';
  import { deferToBack, folioHint, guideNextId, guideOrder, preferredRetakeVolume, readRetakeSummary } from '$lib/recapture-turn';

  import TopBar from './TopBar.svelte';
  import CameraControls from './CameraControls.svelte';
  import LiveViewport from './LiveViewport.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';
  import CaptureInstruction from './CaptureInstruction.svelte';

  let projectId = $derived(Number($page.url.searchParams.get('projectId')) || 0);
  let collectionId = $derived(Number($page.url.searchParams.get('collectionId')) || 0);
  // Set when the operator arrives from Book view's "Recapture image" button
  // (NEH-209) for one record. The page opens that record's retake modal
  // directly, so the operator does not have to find it again in the
  // thumbnail strip.
  let recordId = $derived(Number($page.url.searchParams.get('recordId')) || 0);
  // A successful retake that came from that flow returns to Book view instead
  // of staying on /live-preview. A retake started from a thumbnail on this
  // page does not navigate anywhere.
  let cameFromRecapture = $state(false);

  let cameraMode = $state<'single' | 'double'>('double');

  // Detected camera devices, reported by `CameraControls` through
  // `onDevicesChange` on mount and after every device-list refresh.
  let devices = $state<CameraDevice[]>([]);


  // Exposure values shown in the viewport's metadata bar; `CameraControls`
  // reports changes to them.
  let shutterSpeed = $state('1.6s');
  let iso = $state('200');
  let aperture = $state('13.0');

  // Per-camera capture rotation (clockwise degrees): 0 | 90 | 180 | 270
  // Default 90° — most digitisation rigs use vertical (portrait) orientation.
  // This default only holds until the device list arrives — onDevicesChange
  // below reseeds it from what the appliance actually remembers (NEH-71).
  let rotateDeg = $state<{ [cam: number]: number }>({ 0: 90, 1: 90 });

  // Which body (hardware_id) the operator manually rotated at each camera
  // index in this session — NOT reactive state: it's bookkeeping consulted
  // (and updated) alongside rotateDeg, never rendered on its own.
  let rotateTouched = new Map<number, string>();

  // Rotations changed while an index has no identified body (no device yet,
  // or one reported under a placeholder id): there is nothing to persist them
  // to, so they are kept here until the first identified body appears at the
  // index. That body takes the change unless it has a saved orientation of
  // its own, which wins (settlePendingRotations). Until then the change stays
  // on screen, so a reseed from an incomplete listing does not undo it.
  let rotatePending = new Map<number, number>();

  // Persists a rotation change to the backend, coalescing quick repeat taps
  // on the same camera into a single in-flight PUT.
  const saveOrientation = createOrientationSaver(
    (i, hw, deg) => camerasApi.setOrientation(i, hw, deg),
    (i, e) => console.error('[LivePreview] Error saving orientation:', i, e)
  );

  let projectName = $state<string>('');

  // The top bar shows the volume name next to the project. Without it the
  // operator has nothing on screen that says which volume the captures go
  // into, and a wrong volume is discovered only afterwards.
  let collectionName = $state<string>('');

  // Whether the volume has no stem (filename_stem). The backend refuses
  // every capture into such a volume, so the viewport disables capture and
  // links to the volume's form, where an operator gives it one.
  let volumeNeedsStem = $state(false);

  // The list item's notes and action. `listInstruction` is undefined until
  // the lists arrive, and when they fail or no list has an item for this
  // volume; the volume's custom_attributes are used then.
  let listInstruction = $state<Instruction | null | undefined>(undefined);
  let attributesInstruction = $state<Instruction | null>(null);
  let instruction = $derived(listInstruction !== undefined ? listInstruction : attributesInstruction);
  let stemFormHref = $derived(projectId && collectionId
    ? `/dashboard/projects/${projectId}?editVolume=${collectionId}`
    : '');

  let records = $state<ApiRecord[]>([]);
  let selectedRecordId = $state<number | null>(null);

  // The record open in `ImageViewerModal`; null when the modal is closed.
  let inspectedRecord = $state<ApiRecord | null>(null);

  let isLoading = $state(false);
  // The first load of the volume's records succeeded, so an empty list
  // means an empty volume.
  let recordsLoaded = $state(false);

  // ---------------------------------------------------------------------------
  // The recapture turn (0.2.0)
  // ---------------------------------------------------------------------------
  // Null until it arrives, and when it cannot be loaded: then nothing is
  // blocked here, and the backend still refuses what the turn forbids.
  let retakeSummary = $state<RetakeSummary | null>(null);
  // The items of the stored lists, newest list first, so that the block
  // names the volume Cola puts first.
  let queueItems = $state<QueueItem[]>([]);
  // An admin chose to capture anyway; the operator started the volume.
  let turnOverride = $state(false);
  let unlockDismissed = $state(false);

  let isAdmin = $derived($userRole === 'admin');
  let isEmptyVolume = $derived(collectionId > 0 && recordsLoaded && records.length === 0);
  let turnState = $derived(retakeSummary && retakeSummary.pendingRecords > 0 ? retakeSummary.turn.state : 'free');
  let blocked = $derived(isEmptyVolume && turnState === 'recaptures' && !turnOverride);
  let unlockShown = $derived(isEmptyVolume && turnState === 'new' && !unlockDismissed);
  let blockNext = $derived(preferredRetakeVolume(retakeSummary, queueItems));

  // Resolves whether a summary of the contract's shape was read. A failed
  // read keeps the last one for the turn's panels; the guide does not go on
  // from it (afterGuidedRetake).
  async function loadRetakeSummary(): Promise<boolean> {
    try {
      const summary = readRetakeSummary(await recordsApi.toRetakeSummary());
      if (summary) retakeSummary = summary;
      return summary !== null;
    } catch (e) {
      console.error('[LivePreview] Error loading the recapture summary:', e);
      return false;
    }
  }

  // The guided retake. `order` holds the volume's records to retake, by
  // sequence from the one the guide opened on; "Saltar por ahora" moves a
  // record to its back, so skipped records come back last, in the order they
  // were skipped. `retaken` counts the retakes done in the guide, and
  // `total` is the most records the guide has known to do. Null outside it.
  //
  // What is still to retake is the backend's pending: rejected, or captured
  // with a current image that still carries its rejection (prepared for
  // retake), which the records do not show. It comes from the volume's
  // `pendingRecordIds` in the summary, read again after every retake; the
  // guide goes on only from a round in which it was read.
  let guide = $state<{ order: number[]; retaken: number; total: number } | null>(null);
  // Set when nothing is left to retake: whether the turn is now `new`, and
  // another volume with retakes to go on with.
  let guideEnd = $state<{ turnNew: boolean; other: RetakeSummaryVolume | null } | null>(null);
  // The records or the summary could not be read again after a retake: the
  // guide waits, with the error and a retry, and opens nothing until both are.
  let guidePaused = $state(false);
  let guideRetrying = $state(false);
  // The folios the next record's rejection names, for the guide's footer.
  let guideNextFolios = $state<string | null>(null);

  function volumeEntry(): RetakeSummaryVolume | null {
    return retakeSummary?.volumes.find(v => v.collectionId === collectionId) ?? null;
  }

  // The volume's pending records, from the summary; none when the summary
  // does not list the volume.
  let pendingIds = $derived(volumeEntry()?.pendingRecordIds ?? []);

  function isPending(id: number): boolean {
    return pendingIds.includes(id) && records.some(r => r.id === id);
  }

  // The most records the guide has known it must retake.
  function updateGuideTotal() {
    if (!guide) return;
    guide.total = Math.max(guide.total, guide.retaken + pendingIds.length);
  }

  let guideDone = $derived(guide ? guide.retaken : 0);
  // k of "Recaptura k de N": the retakes done so far, plus the open one.
  let guidePosition = $derived(guide ? Math.min(guide.retaken + 1, guide.total) : 0);

  function openRecord(record: ApiRecord) {
    cameraMode = record.capture_mode === 'dual' ? 'double' : 'single';
    selectedRecordId = record.id;
    inspectedRecord = record;
  }

  // Opens the next record to retake in the order. The end panel shows only
  // when the summary lists nothing pending for the volume; a pending record
  // the order lacks joins its back. The open modal stays up until one of the
  // two replaces it, so that capture stays blocked in between.
  async function advanceGuide() {
    if (!guide) return;
    const pending = pendingIds.filter(id => records.some(r => r.id === id));
    if (pending.length > 0) {
      const missing = pending.filter(id => !guide!.order.includes(id));
      if (missing.length > 0) guide.order = [...guide.order, ...missing];
      updateGuideTotal();
      const nextId = guideNextId(guide.order, isPending);
      const next = nextId === null ? undefined : records.find(r => r.id === nextId);
      if (next) openRecord(next);
      return;
    }
    guideEnd = {
      turnNew: retakeSummary?.turn.state === 'new',
      other: retakeSummary?.volumes.find(v => v.collectionId !== collectionId) ?? null
    };
    inspectedRecord = null;
    guide = null;
  }

  // After a successful retake in the guide: read the records and the
  // summary again, then go on. If either read fails the guide pauses, and
  // goes on only after a round in which both were read, so that it never
  // takes the summary from before the retake (and its first pending record)
  // as current.
  async function afterGuidedRetake() {
    if (!guide) return;
    guide.retaken += 1;
    const [loaded, summarised] = await Promise.all([loadRecords(), loadRetakeSummary()]);
    if (!loaded || !summarised) {
      guidePaused = true;
      inspectedRecord = null;
      return;
    }
    await advanceGuide();
  }

  async function retryGuide() {
    if (guideRetrying) return;
    guideRetrying = true;
    try {
      const [loaded, summarised] = await Promise.all([loadRecords(), loadRetakeSummary()]);
      if (!loaded || !summarised) return;
      guidePaused = false;
      await advanceGuide();
    } finally {
      guideRetrying = false;
    }
  }

  function skipGuided() {
    if (!guide || !inspectedRecord) return;
    guide.order = deferToBack(guide.order, inspectedRecord.id);
    advanceGuide();
  }

  function closeInspected() {
    inspectedRecord = null;
    guide = null;
  }

  $effect(() => {
    const g = guide;
    const current = inspectedRecord;
    guideNextFolios = null;
    if (!g || !current) return;
    const nextId = guideNextId(g.order, isPending, current.id);
    if (nextId === null) return;
    let stale = false;
    recordsApi
      .listRejections(nextId)
      .then(list => { if (!stale) guideNextFolios = folioHint(list[0]?.comment); })
      .catch(e => console.error('[LivePreview] Error loading the next rejection:', e));
    return () => { stale = true; };
  });

  onMount(async () => {
    // The capture screen is for admin and operator only. A reviewer cannot
    // trigger captures or delete (the backend answers 403 in
    // cameras.py/records.py), and this route sits outside the (dashboard)
    // group, so it checks the role itself (NEH-66).
    if (!authStore.requireSession(['admin', 'operator'])) {
      return;
    }

    const tasks: Promise<void>[] = [];

    if (projectId) {
      tasks.push(
        projectsApi.get(projectId)
          .then(p => { projectName = p.name; })
          .catch(e => console.error('[LivePreview] Error loading project:', e))
      );
    }

    if (collectionId) {
      tasks.push(loadRecords().then(() => {}));
      tasks.push(
        collectionsApi.get(collectionId)
          .then(c => {
            collectionName = c.name;
            volumeNeedsStem = needsStem(c);
            attributesInstruction = captureInstruction(c.custom_attributes);
          })
          .catch(e => console.error('[LivePreview] Error loading volume:', e))
      );
      // Not one of `tasks`: the band can arrive late, and the retake modal
      // below (NEH-209) must never wait for the lists.
      importsApi.lists()
        .then(lists => {
          listInstruction = instructionForVolume(lists, collectionId);
          queueItems = lists.flatMap(l => l.items);
        })
        .catch(e => console.error('[LivePreview] Error loading digitisation lists:', e));
    }

    // Not one of `tasks` either: the retake modal must not wait for it.
    const summaryLoad = collectionId ? loadRetakeSummary() : Promise.resolve(false);

    await Promise.all(tasks);

    // With a `recordId` (NEH-209, Book view's "Recapture image" button), open
    // its retake modal directly and set the camera mode to the record's
    // actual `capture_mode`. Otherwise a dual record with `cameraMode` at
    // 'single' (or the reverse) would trip the backend's mode-mismatch guard
    // in cameras.py.
    if (recordId) {
      const target = records.find(r => r.id === recordId);
      if (target) {
        openRecord(target);
        cameFromRecapture = true;
        // A record the summary lists as pending starts the guide through the
        // volume's others, in the summary's order. Without the summary the
        // modal opens as a single retake.
        const summarised = await summaryLoad;
        if (summarised && isPending(target.id) && inspectedRecord?.id === target.id) {
          const order = guideOrder(pendingIds.filter(id => records.some(r => r.id === id)), target.id);
          guide = { order, retaken: 0, total: order.length };
        }
      }
    }
  });

  // Resolves whether the records were read.
  async function loadRecords(): Promise<boolean> {
    try {
      isLoading = true;
      const data = await recordsApi.listAll({ collection_id: collectionId });
      records = data;
      recordsLoaded = true;
      if (data.length > 0 && !selectedRecordId) {
        selectedRecordId = data[0].id;
      }
      return true;
    } catch (error) {
      console.error('[LivePreview] Error loading records:', error);
      return false;
    } finally {
      isLoading = false;
    }
  }

  // Captures are reviewed in the volume view.
  function handleGoToReview() {
    goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
  }

  async function handleCaptureDone() {
    await loadRecords();
  }

  function handleBack() {
    if (projectId && collectionId) {
      goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
    } else {
      goto('/');
    }
  }

  // Reads the volume again after a capture 409, and records whether it has
  // no stem. Resolves true when that is why the backend refused. The turn is
  // read again too, as a 409 may be the recapture turn's.
  async function recheckStem(): Promise<boolean> {
    loadRetakeSummary();
    try {
      const c = await collectionsApi.get(collectionId);
      volumeNeedsStem = needsStem(c);
    } catch (e) {
      console.error('[LivePreview] Error loading volume:', e);
    }
    return volumeNeedsStem;
  }

  // Retake of a record from the image modal. When the record is 'rejected'
  // and a new capture arrives with the same `record_id`, the backend
  // (cameras.py, NEH-208) keeps the previous images as history: it marks them
  // `is_current=false` instead of deleting them, so they remain available
  // for audit through `GET /records/{id}/rejections`. The frontend must NOT
  // delete them itself (NEH-209).
  async function handleRetake(record: ApiRecord) {
    // The modal shows a thrown error's message; this one is the catalogue's.
    if (volumeNeedsStem) throw new Error($m.lv_needs_stem);
    try {
      await retake(record);
    } catch (error) {
      console.error('[LivePreview] Error during retake:', error);
      if (isConflict(error) && (await recheckStem())) throw new Error($m.lv_needs_stem);
      // The backend's text is English; the modal shows the catalogue's.
      throw new Error(captureErrorText(error, $m));
    }
  }

  async function retake(record: ApiRecord) {
    let result;
    if (cameraMode === 'double') {
      result = await camerasApi.captureDual({
        project_name: projectName,
        collection_id: collectionId ?? undefined,
        record_id: record.id,
        rotate_deg_cam0: rotateDeg[0] ?? 0,
        rotate_deg_cam1: rotateDeg[1] ?? 0,
      });
    } else {
      result = await camerasApi.capture({
        project_name: projectName,
        camera_index: 0,
        collection_id: collectionId ?? undefined,
        record_id: record.id,
        rotate_deg: rotateDeg[0] ?? 0,
      });
    }

    if (!result.success) {
      throw new CaptureFailed(result.error);
    }

    // In the guide, the next rejected record opens instead (0.2.0).
    // The modal stays open, its retake still running, until the next state
    // is on screen: LiveViewport takes no capture meanwhile.
    if (guide) {
      await afterGuidedRetake();
      return;
    }

    inspectedRecord = null;

    // Coming from "Recapture image" in Book view (NEH-209), go back there
    // instead of staying on /live-preview: the retake is finished, and the
    // operator sees the result right where they asked for it. A retake
    // started from a thumbnail on this page does not navigate anywhere.
    if (cameFromRecapture && projectId && collectionId) {
      goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
      return;
    }

    await loadRecords();
  }

  // The only writer of `rotateDeg` (NEH-71): both the controls panel and the
  // `LiveViewport` overlay call this function, so there are never two copies
  // of the value drifting apart. If the index has no identified body (it was
  // disconnected, the mode is single and the right camera is selected, or the
  // body is reported under a placeholder id), only the local state changes,
  // and the change waits in `rotatePending` until a body is identified there.
  function handleRotateDegChange(cam: number, deg: number) {
    const device = devices.find(d => d.index === cam);
    if (!canSaveRotation(device)) {
      rotateDeg = { ...rotateDeg, [cam]: deg };
      rotatePending.set(cam, deg);
      return;
    }
    rotatePending.delete(cam);
    rotateTouched.set(cam, device.hardware_id);
    rotateDeg = { ...rotateDeg, [cam]: deg };
    saveOrientation(cam, device.hardware_id, deg);
  }
</script>

<!-- Full screen, without the dashboard sidebar -->
<div class="live-preview-wrapper">

  <TopBar
    {projectName}
    {collectionName}
    onBack={handleBack}
    onGoToReview={handleGoToReview}
  />

  <CaptureInstruction {instruction} />

  {#if unlockShown && retakeSummary}
    <section class="turn-unlock" aria-labelledby="turn-unlock-title">
      <span class="material-symbols-outlined turn-unlock-icon" aria-hidden="true">check</span>
      <div class="turn-unlock-text">
        <h2 id="turn-unlock-title" class="turn-unlock-title">{$m.unlock_title}</h2>
        {#if retakeSummary.turn.unlockedBy}
          <p class="turn-unlock-body">{$m.unlock_body(retakeSummary.turn.unlockedBy.name)}</p>
        {/if}
      </div>
      <button class="btn btn-primary btn-lg" onclick={() => (unlockDismissed = true)}>{$m.unlock_cta}</button>
    </section>
  {/if}

  {#if guidePaused}
    <div class="turn-stage">
      <section class="guide-end guide-paused" aria-labelledby="guide-paused-title">
        <span class="material-symbols-outlined guide-paused-icon" aria-hidden="true">error</span>
        {#if collectionName}<p class="guide-end-volume">{collectionName}</p>{/if}
        <p id="guide-paused-title" class="guide-end-title" role="alert">{$m.retakes_load_error}</p>
        <div class="turn-actions">
          <button class="btn btn-recapture btn-lg" disabled={guideRetrying} onclick={retryGuide}>{$m.common_retry}</button>
        </div>
      </section>
    </div>
  {:else if guideEnd}
    <div class="turn-stage">
      <section class="guide-end" aria-labelledby="guide-end-title">
        <span class="material-symbols-outlined guide-end-icon" aria-hidden="true">check_circle</span>
        {#if collectionName}<p class="guide-end-volume">{collectionName}</p>{/if}
        <h2 id="guide-end-title" class="guide-end-title">{$m.guide_done(guideEnd.turnNew)}</h2>
        <div class="turn-actions">
          <a class="btn btn-primary btn-lg" href="/dashboard/queue">{$m.guide_done_queue}</a>
          {#if guideEnd.other}
            <!-- Another volume on the same route: a full load, so the page reads its new address. -->
            <a class="btn btn-recapture btn-lg" data-sveltekit-reload href={retakeUrl(guideEnd.other.projectId, guideEnd.other.collectionId, guideEnd.other.firstPendingRecordId)}>{$m.guide_done_more}</a>
          {/if}
        </div>
      </section>
    </div>
  {:else if blocked}
    <div class="turn-stage">
      <section class="turn-block" aria-labelledby="turn-block-title">
        <div class="turn-block-head">
          <span class="material-symbols-outlined turn-block-icon" aria-hidden="true">lock</span>
          <h2 id="turn-block-title" class="turn-block-title">{$m.block_title}</h2>
        </div>
        <p class="turn-block-body">{$m.block_body}</p>
        {#if blockNext}
          <p class="turn-block-next">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
            <span>{$m.block_next(blockNext.name, blockNext.pending)}</span>
          </p>
        {/if}
        <div class="turn-actions">
          {#if blockNext}
            <!-- Another volume on the same route: a full load, so the page reads its new address. -->
            <a class="btn btn-recapture btn-lg" data-sveltekit-reload href={retakeUrl(blockNext.projectId, blockNext.collectionId, blockNext.firstPendingRecordId)}>{$m.block_cta(blockNext.name)}</a>
          {/if}
          <a class="btn btn-ghost btn-lg" href="/dashboard/queue">{$m.block_back}</a>
          {#if isAdmin}
            <button class="btn btn-ghost turn-block-admin" onclick={() => (turnOverride = true)}>{$m.block_admin}</button>
          {/if}
        </div>
      </section>
    </div>
  {:else}
    <div class="content-area">

      <CameraControls
        {cameraMode}
        {shutterSpeed}
        {iso}
        {aperture}
        onCameraModeChange={(m) => cameraMode = m}
        onShutterSpeedChange={(v) => shutterSpeed = v}
        onIsoChange={(v) => iso = v}
        onApertureChange={(v) => aperture = v}
        onDevicesChange={(d) => {
          devices = d;
          const seeded = seedRotation(rotateDeg, d, rotateTouched);
          const settled = settlePendingRotations(rotatePending, d);
          rotatePending = settled.remaining;
          rotateDeg = { ...seeded.rotation, ...Object.fromEntries(settled.remaining) };
          rotateTouched = seeded.touched;
          // Applied through the single writer so the change counts as touched
          // and is saved against the body now identified at that index.
          for (const [cam, deg] of settled.apply) handleRotateDegChange(cam, deg);
        }}
        onRotateDegChange={handleRotateDegChange}
        {rotateDeg}
      />

      <div class="center-column">

        <LiveViewport
          {cameraMode}
          {shutterSpeed}
          {iso}
          {aperture}
          {projectId}
          {projectName}
          {collectionId}
          {devices}
          {rotateDeg}
          onCaptureDone={handleCaptureDone}
          onRotateDegChange={handleRotateDegChange}
          otherModalOpen={inspectedRecord !== null}
          needsStem={volumeNeedsStem}
          {stemFormHref}
          onStemRefused={recheckStem}
        />

        <div class="thumbnail-area">
          <ThumbnailStrip
            {records}
            {selectedRecordId}
            {cameraMode}
            onSelect={(record) => { selectedRecordId = record.id; inspectedRecord = record; }}
          />
        </div>

      </div>

    </div>
  {/if}

</div>

{#snippet guideBar(retaking: boolean)}
  {#if guide && inspectedRecord}
    {@const total = guide.total}
    <div class="lv-guide">
      <p class="lv-guide-title" id="lv-guide-title">{$m.guide_header(guidePosition, total, collectionName)}</p>
      <div class="lv-guide-progress" role="progressbar" aria-labelledby="lv-guide-title" aria-valuemin="0" aria-valuemax={total} aria-valuenow={guideDone}>
        <span style="width: {total > 0 ? (guideDone / total) * 100 : 0}%"></span>
      </div>
      <div class="lv-guide-row">
        <button class="btn btn-ghost" disabled={retaking} onclick={skipGuided}>{$m.guide_skip}</button>
        {#if guideNextFolios}<span class="lv-guide-next">{$m.guide_next(guideNextFolios)}</span>{/if}
      </div>
    </div>
  {/if}
{/snippet}

{#if inspectedRecord}
  <!-- Keyed, so that the next record of the guide opens with a fresh modal. -->
  {#key inspectedRecord.id}
    <ImageViewerModal
      record={inspectedRecord}
      {cameraMode}
      onClose={closeInspected}
      onRetake={handleRetake}
      guide={guide ? guideBar : undefined}
    />
  {/key}
{/if}

<style>
  /* ── The recapture turn (0.2.0) ── */
  .turn-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    overflow-y: auto;
    background: repeating-linear-gradient(135deg, var(--color-bg) 0 22px, var(--color-surface) 22px 44px);
  }
  .turn-block,
  .guide-end {
    width: min(720px, 100%);
    box-sizing: border-box;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background-color: var(--color-surface);
    border-radius: var(--radius-xl);
  }
  .turn-block { border: 2px solid var(--color-highlight); }
  .turn-block-head { display: flex; align-items: center; gap: 14px; }
  .turn-block-icon { font-size: 40px; color: var(--color-highlight); }
  .turn-block-title { margin: 0; font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); }
  .turn-block-body { margin: 0; font-size: var(--text-lead); line-height: 1.5; color: var(--color-light); }
  .turn-block-next {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface-alt-2);
    border: 1px solid rgba(225, 183, 120, 0.5);
    font-size: var(--text-base);
    line-height: 1.5;
    color: var(--color-light);
  }
  .turn-block-next svg { flex-shrink: 0; color: var(--color-highlight); }
  .turn-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .turn-block-admin { margin-left: auto; border-style: dashed; color: var(--color-light-grey); }

  .turn-unlock {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding: 16px 24px;
    background-color: var(--color-success-bg);
    border-bottom: 2px solid var(--color-success);
    flex-shrink: 0;
  }
  .turn-unlock-icon { font-size: 32px; color: var(--color-success); }
  .turn-unlock-text { flex: 1; min-width: 16rem; display: flex; flex-direction: column; gap: 4px; }
  .turn-unlock-title { margin: 0; font-size: var(--text-lead); font-weight: var(--fw-extrabold); color: var(--color-light); }
  .turn-unlock-body { margin: 0; font-size: var(--text-base); line-height: 1.5; color: var(--color-light); }

  .guide-end { align-items: center; text-align: center; border: 1px solid var(--border-color); border-top: 3px solid var(--color-success); }
  .guide-end-icon { font-size: 56px; color: var(--color-success); }
  .guide-end-volume { margin: 0; font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light-grey); }
  .guide-end-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-extrabold); line-height: 1.3; color: var(--color-light); }
  .guide-end .turn-actions { justify-content: center; }
  .guide-paused { border-top-color: var(--color-error); }
  .guide-paused-icon { font-size: 56px; color: var(--color-error); }

  /* The guide inside the retake modal. */
  .lv-guide {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 2px solid var(--color-highlight);
    flex-shrink: 0;
  }
  .lv-guide-title { margin: 0; font-size: var(--text-lead); font-weight: var(--fw-extrabold); color: var(--color-light); }
  .lv-guide-progress { height: 8px; border-radius: var(--radius-full); background-color: var(--color-surface-alt-2); overflow: hidden; }
  .lv-guide-progress span { display: block; height: 100%; background-color: var(--color-highlight); }
  .lv-guide-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .lv-guide-next { margin-left: auto; font-size: var(--text-sm); color: var(--color-light-grey); }
</style>

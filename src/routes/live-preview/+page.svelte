<script lang="ts">
  // Capture screen, at /live-preview?projectId=X&collectionId=Y (optionally
  // &recordId=Z). The page holds the state its children share — camera mode,
  // exposure values, per-camera rotation, the volume's records — and passes it
  // down as props; `CameraControls`, `LiveViewport`, `ThumbnailStrip` and
  // `ImageViewerModal` do the rendering. Only admin and operator may use it;
  // a reviewer is redirected (role guard in `onMount`, NEH-66).

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, recordsApi, projectsApi, collectionsApi, type Record as ApiRecord, type CameraDevice } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { m } from '$lib/i18n';
  import { seedRotation, createOrientationSaver, canSaveRotation, settlePendingRotations } from '$lib/camera-orientation';
  import { isConflict, needsStem } from '$lib/volume-stem';
  import { CaptureFailed, captureErrorText } from '$lib/capture-errors';

  import TopBar from './TopBar.svelte';
  import CameraControls from './CameraControls.svelte';
  import LiveViewport from './LiveViewport.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';

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
  let stemFormHref = $derived(projectId && collectionId
    ? `/dashboard/projects/${projectId}?editVolume=${collectionId}`
    : '');

  let records = $state<ApiRecord[]>([]);
  let selectedRecordId = $state<number | null>(null);

  // The record open in `ImageViewerModal`; null when the modal is closed.
  let inspectedRecord = $state<ApiRecord | null>(null);

  let isLoading = $state(false);

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
      tasks.push(loadRecords());
      tasks.push(
        collectionsApi.get(collectionId)
          .then(c => { collectionName = c.name; volumeNeedsStem = needsStem(c); })
          .catch(e => console.error('[LivePreview] Error loading volume:', e))
      );
    }

    await Promise.all(tasks);

    // With a `recordId` (NEH-209, Book view's "Recapture image" button), open
    // its retake modal directly and set the camera mode to the record's
    // actual `capture_mode`. Otherwise a dual record with `cameraMode` at
    // 'single' (or the reverse) would trip the backend's mode-mismatch guard
    // in cameras.py.
    if (recordId) {
      const target = records.find(r => r.id === recordId);
      if (target) {
        cameraMode = target.capture_mode === 'dual' ? 'double' : 'single';
        selectedRecordId = target.id;
        inspectedRecord = target;
        cameFromRecapture = true;
      }
    }
  });

  async function loadRecords() {
    try {
      isLoading = true;
      const data = await recordsApi.listAll({ collection_id: collectionId });
      records = data;
      if (data.length > 0 && !selectedRecordId) {
        selectedRecordId = data[0].id;
      }
    } catch (error) {
      console.error('[LivePreview] Error loading records:', error);
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
  // no stem. Resolves true when that is why the backend refused.
  async function recheckStem(): Promise<boolean> {
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

</div>

{#if inspectedRecord}
  <ImageViewerModal
    record={inspectedRecord}
    {cameraMode}
    onClose={() => inspectedRecord = null}
    onRetake={handleRetake}
  />
{/if}

<script lang="ts">
  // A volume's gallery: list, grid and spread views of its records, plus
  // export (BagIt, image ZIP, capture manifest) and hand-over for review. The
  // page owns the records and the view state shared by its child views; the
  // top bar (breadcrumb, camera button) is in +layout@.svelte, and the page
  // puts its hand-over controls there through the volume top bar slot.
  //
  // Version: 0.1.0-beta

  import { onMount, untrack } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore, userRole } from '$lib/stores/auth';
  import { recordsApi, collectionsApi, ApiError, type Record } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { formatCount } from '$lib/format-count';
  import JSZip from 'jszip';

  import LeftSidebar from './LeftSidebar.svelte';
  import ListView from './ListView.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';
  import GridView from './GridView.svelte';
  import RightToolbar from './RightToolbar.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import RecordStatusBar from '$lib/components/RecordStatusBar.svelte';
  import HandoverControls from '$lib/components/HandoverControls.svelte';
  import { getVolumeTopbar } from '$lib/volume-topbar';
  import { dismissible } from '$lib/dialog';
  import { fileHoldText } from '$lib/volume-refusals';
  import { freedExportCount } from '$lib/offsite-free';
  import { reconcileInspected, selectionAfterLoad } from '$lib/record-selection';
  import { freedFromBody } from '$lib/image-display';
  import {
    canDownloadCaptureManifest,
    captureManifestErrorText,
    captureManifestFilename,
    captureManifestRefusal,
    type ManifestRefusalView
  } from '$lib/capture-manifest';

  let projectId    = $derived(Number($page.params.projectId) || 0);
  let collectionId = $derived(Number($page.params.collectionId) || 0);
  let collectionName = $derived(($page.data as any).collectionName ?? '');

  let viewMode         = $state<'list' | 'spread' | 'grid'>('list');
  let selectedRecordId = $state<number | null>(null);
  let records          = $state<Record[]>([]);
  let zoom             = $state(1);
  let rotation         = $state(0);
  // Preview adjustments from the left panel, from -100 to 100. They are held
  // here and not in the panel because the viewer needs them too; the panel
  // only sets them. They do not alter the file: the viewer applies them as a
  // CSS filter on the image, as it does the rotation.
  let brightness       = $state(0);
  let contrast         = $state(0);
  let saturation       = $state(0);
  let isLoading        = $state(true);
  // First load finished. Reloads set `isLoading` again, and the hand-over
  // controls must not be unmounted in the middle of a hand-over.
  let hasLoaded        = $state(false);
  // NEH-230: the zoom at which one image pixel fills one device pixel.
  // ImageViewer computes it from the measured reference page; it feeds the
  // "1:1" button and the zoom ceiling in RightToolbar.
  let oneToOne         = $state(1);

  // Record inspected in the modal (opened from the export blockers list)
  let inspectedRecord = $state<Record | null>(null);

  onMount(async () => {
    if (!authStore.requireSession()) {
      return;
    }
    await loadRecords();
  });

  // Volume whose records are on screen. SvelteKit reuses this page when the
  // user navigates from one volume to another (e.g. through the history), so
  // `collectionId` can change without a remount; without this, the previous
  // volume's records would sit beside actions aimed at the new one.
  let loadedFor = $state<number | null>(null);
  // Last volume requested. Not reactive: the effect below depends only on
  // `collectionId`.
  let requestedFor = 0;
  // Number of the last load requested: only that one may write the state.
  // Comparing the volume is not enough, because A→B→A leaves two loads of A
  // in flight, and the older one can arrive last and overwrite the newer.
  let loadSeq = 0;

  // Returns whether the list was updated, so a caller reloading after a
  // change can report it if not. With `inPlace` (NEH-248: what is freed in
  // the volume changed) the view skips the loading state and the selected
  // record is kept if it is still in the volume.
  async function loadRecords({ inPlace = false }: { inPlace?: boolean } = {}): Promise<boolean> {
    const forId = collectionId;
    const seq = ++loadSeq;
    requestedFor = forId;
    try {
      if (!inPlace) isLoading = true;
      const data = await recordsApi.listAll({ collection_id: forId });
      // A response superseded by a later load is discarded.
      if (seq !== loadSeq) return false;
      // Sort by sequence (nulls last), then by id
      records = data.sort((a, b) => {
        if (a.sequence == null && b.sequence == null) return a.id - b.id;
        if (a.sequence == null) return 1;
        if (b.sequence == null) return -1;
        return a.sequence - b.sequence;
      });
      // A different volume from the one shown never keeps the selection.
      selectedRecordId = selectionAfterLoad(records, selectedRecordId, inPlace && loadedFor === forId);
      // An open inspection modal switches to the reloaded copy of its record,
      // or closes if the record is no longer in the volume.
      if (inPlace) inspectedRecord = reconcileInspected(inspectedRecord, records);
      loadedFor = forId;
      return true;
    } catch (err) {
      console.error('[Gallery] Error loading records:', err);
      return false;
    } finally {
      if (seq === loadSeq) {
        isLoading = false;
        hasLoaded = true;
      }
    }
  }

  // On a move to another volume without a remount, load that volume's records.
  $effect(() => {
    const id = collectionId;
    if (requestedFor !== 0 && id !== requestedFor) untrack(() => { reorderNotice = null; renumberedCount = null; loadRecords(); });
  });

  function handlePrev() {
    const idx = records.findIndex(r => r.id === selectedRecordId);
    if (idx > 0) selectedRecordId = records[idx - 1].id;
  }

  function handleNext() {
    const idx = records.findIndex(r => r.id === selectedRecordId);
    if (idx < records.length - 1) selectedRecordId = records[idx + 1].id;
  }

  function handleSelect(id: number) { selectedRecordId = id; }

  // Moving to another folio straightens the view, and nothing else. Rotation
  // belongs to the folio: one page may have been captured sideways and the
  // next not. Exposure belongs to the session — the same lamp and the same
  // settings all day — so a volume that is evenly dark is corrected once and
  // reviewed whole that way.
  //
  // This is an effect and not part of handlePrev/handleNext/handleSelect
  // because the selection also changes from the grid and the list, and a
  // reset spread over five call sites is easy to miss in one of them.
  $effect(() => {
    selectedRecordId;
    rotation = 0;
  });

  function handleViewModeChange(mode: 'list' | 'spread' | 'grid') {
    viewMode = mode;
    zoom = 1;
    rotation = 0;
  }

  function handleRotateLeft()  { rotation = ((rotation - 90) % 360 + 360) % 360; }
  function handleRotateRight() { rotation = (rotation + 90) % 360; }

  // Retake: goes to live-preview with the same project and volume plus the
  // record, so live-preview opens its retake modal for that record directly
  // (NEH-209).
  function handleRetake(record: Record) {
    inspectedRecord = null;
    goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}&recordId=${record.id}`);
  }

  // Recapture from the spread view (NEH-209): same destination as
  // handleRetake, triggered by the left panel's recapture button instead of
  // the inspection modal.
  function handleRecapture(record: Record) {
    goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}&recordId=${record.id}`);
  }

  // Why the last drag in the list or the grid was not saved. Held here and
  // not in the view because the reload after the refusal sets `isLoading`,
  // which unmounts the view that would show it.
  let reorderNotice = $state<string | null>(null);

  // How many records the last renumber touched, held here for the same
  // reason as reorderNotice; null when there is nothing to report.
  let renumberedCount = $state<number | null>(null);

  // Why the last record could not be deleted; null when there is no notice.
  let deleteRecordError = $state<string | null>(null);

  async function handleDeleteRecord(record: Record) {
    try {
      await recordsApi.delete(record.id);
      await loadRecords();
    } catch (err) {
      // The backend's English text goes to the console only.
      console.error('[Gallery] Error deleting record:', err);
      deleteRecordError = fileHoldText(err, $m) ?? $m.col_delete_record_retry;
    } finally {
      inspectedRecord = null;
    }
  }

  // BagIt export
  let showExportModal = $state(false);
  let isExporting     = $state(false);
  let exportResult    = $state<{ zip_filename: string } | null>(null);
  let exportError     = $state<string | null>(null);
  let exportProgress  = $state<{ done: number; total: number } | null>(null);
  // Records that block export: not approved, or without a current image
  let showBlockersModal = $state(false);

  const hasCurrentImage = (r: Record) => (r.images ?? []).some((i) => i.is_current);
  let blockingRecords   = $derived(records.filter(r => r.status !== 'approved' || !hasCurrentImage(r)));

  // Export/download chooser, and the image ZIP built in the browser
  let showChooserModal = $state(false);
  let isZipping        = $state(false);
  let zipProgress      = $state(0);
  let zipError         = $state<string | null>(null);

  // Capture manifest for Fisqua: admin and operator only, as with hand-over
  // for review (the backend refuses the route to other roles).
  let canDownloadManifest = $derived(canDownloadCaptureManifest($userRole));
  let isManifestLoading   = $state(false);
  let manifestRefusal     = $state<ManifestRefusalView | null>(null);
  let manifestError       = $state<string | null>(null);

  async function handleExport() {
    if (!canExport) { showBlockersModal = true; return; }
    showExportModal = true;
    isExporting = true;
    exportResult = null;
    exportError = null;
    exportProgress = null;
    try {
      // Export runs as a background job on the appliance
      const { job_id } = await collectionsApi.exportBagit(collectionId);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 700));
        const st = await collectionsApi.getExportStatus(collectionId, job_id);
        exportProgress = { done: st.done, total: st.total };
        if (st.state === 'done' && st.zip_filename) {
          exportResult = { zip_filename: st.zip_filename };
          break;
        }
        if (st.state === 'failed') {
          // A free that followed the request: the worker checks again (NEH-248).
          const freed = freedExportCount(st.error);
          exportError = freed !== null ? $m.col_export_freed(freed) : (st.error ?? $m.col_err_export);
          break;
        }
      }
    } catch (err: any) {
      // The client checks `canExport` against the local `records`, which can
      // be stale (another user approved or rejected records in the meantime).
      // If the backend still returns a 422 with `blocking_record_ids`, the
      // records are reloaded and the blockers modal is shown instead of the
      // generic error modal.
      const detail = err instanceof ApiError ? (err.detail as { blocking_record_ids?: number[] } | undefined) : undefined;
      if (detail?.blocking_record_ids) {
        showExportModal = false;
        await loadRecords();
        showBlockersModal = true;
      } else {
        // Masters freed from the card are stored offsite, not here: a restore comes first (NEH-248).
        const freed = freedExportCount(err);
        exportError = freed !== null ? $m.col_export_freed(freed) : (fileHoldText(err, $m) ?? err?.message ?? $m.col_err_export);
      }
    } finally {
      isExporting = false;
    }
  }

  // Downloads the manifest under the name the server gives. A 409 carries the
  // list of problems for which Fisqua would reject it (capture-manifest.ts).
  async function downloadCaptureManifest() {
    if (isManifestLoading) return;
    isManifestLoading = true;
    manifestRefusal = null;
    manifestError = null;
    const forId = collectionId;
    try {
      const { blob, contentDisposition } = await collectionsApi.downloadCaptureManifest(forId);
      if (forId !== collectionId) return;
      const name = captureManifestFilename(contentDisposition, await blob.text());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (forId !== collectionId) return;
      const refusal = captureManifestRefusal(e, $m);
      if (refusal) manifestRefusal = refusal;
      else manifestError = captureManifestErrorText(e, $m);
    } finally {
      isManifestLoading = false;
    }
  }

  // A master freed from the card (410 from /file, NEH-248): it is in the
  // offsite copy, not on the appliance, so it cannot go in the ZIP.
  class FreedFromCard extends Error {}

  // Image ZIP built in the browser, without a backend endpoint. Very large
  // volumes would be better served by one.
  async function downloadImagesZip() {
    const items = records.flatMap(r => (r.images ?? []).map(img => ({ img, r })));
    if (items.length === 0) return;
    isZipping = true;
    zipProgress = 0;
    zipError = null;
    try {
      const zip = new JSZip();
      let done = 0;
      for (const { img, r } of items) {
        const res = await fetch(recordsApi.getImageFileUrl(img.id));
        if (res.status === 410 && freedFromBody(410, await res.json().catch(() => null))) throw new FreedFromCard();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = (img.format || img.filename?.split('.').pop() || 'jpg').toLowerCase();
        const base = (r.title || `registro-${r.id}`).replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, '_');
        const seq = String(done + 1).padStart(3, '0');
        zip.file(`${seq}_${base}_${img.id}.${ext}`, blob);
        done++;
        zipProgress = Math.round((done / items.length) * 100);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      const safeName = ((collectionName || `coleccion-${collectionId}`).replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, '_')) || `coleccion-${collectionId}`;
      a.download = `${safeName}-imagenes.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      zipError = e instanceof FreedFromCard ? $m.col_zip_freed : (e?.message ?? $m.col_zip_error);
    } finally {
      isZipping = false;
    }
  }

  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);
  let selectedIndex  = $derived(records.findIndex(r => r.id === selectedRecordId) + 1);
  let canExport      = $derived(records.length > 0 && records.every(r => r.status === 'approved' && hasCurrentImage(r)));

  // Hand-over for review (NEH-260). The controls go in the layout's top bar;
  // the page puts them there because it holds the records. Operator and
  // admin only: the backend refuses promote and take-back to other roles.
  const topbar = getVolumeTopbar();
  let canHandOver = $derived($userRole === 'admin' || $userRole === 'operator');

  $effect(() => {
    if (!topbar) return;
    topbar.actions = canHandOver && hasLoaded && loadedFor === collectionId ? handoverActions : null;
    return () => { topbar.actions = null; };
  });

  // After a free or a restore of the volume (NEH-248), the layout reloads the
  // records so each image's freed state is current.
  $effect(() => {
    if (!topbar) return;
    topbar.reloadRecords = () => loadRecords({ inPlace: true });
    return () => { topbar.reloadRecords = null; };
  });
</script>

{#snippet handoverActions()}
  <!-- Keyed so a dialog open on one volume does not survive into another. -->
  {#key collectionId}
    <HandoverControls {records} {collectionId} onChanged={loadRecords} />
  {/key}
{/snippet}

<div class="gallery-wrapper">

  <!-- In the list view the legend is inside the Reorder bar instead -->
  {#if viewMode !== 'list'}
    <RecordStatusBar {records} />
  {/if}

  {#if reorderNotice}
    <div class="action-notice" role="alert">
      <span class="action-notice-text">{reorderNotice}</span>
      <button class="action-notice-close" onclick={() => (reorderNotice = null)} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-sm">close</span>
      </button>
    </div>
  {/if}

  {#if renumberedCount !== null}
    <div class="action-notice is-success" role="status">
      <span class="action-notice-text">{$m.col_renumber_done(renumberedCount)}</span>
      <button class="action-notice-close" onclick={() => (renumberedCount = null)} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-sm">close</span>
      </button>
    </div>
  {/if}

  <div class="content-area">

    {#if viewMode === 'spread'}
      <LeftSidebar
        {viewMode}
        currentRecord={selectedRecord}
        currentIndex={selectedIndex}
        totalRecords={records.length}
        userRole={$userRole}
        bind:brightness
        bind:contrast
        bind:saturation
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onRecordUpdated={async () => { await loadRecords(); }}
        onRecapture={handleRecapture}
      />
    {/if}

    <div class="center-column">

      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <span>{$m.col_loading_images}</span>
        </div>

      {:else if viewMode === 'grid'}
        <GridView
          {records}
          {collectionId}
          onRecordsUpdate={loadRecords}
          onReorderNotice={(n) => (reorderNotice = n)}
          onRenumbered={(id, n) => { if (id === collectionId) renumberedCount = n; }}
          onRecordClick={(r) => { selectedRecordId = r.id; viewMode = 'spread'; }}
        />

      {:else if viewMode === 'list'}
        <ListView
          {records}
          {collectionId}
          onRecordClick={(r) => { selectedRecordId = r.id; viewMode = 'spread'; }}
          onRecordsUpdate={loadRecords}
          onReorderNotice={(n) => (reorderNotice = n)}
        />

      {:else if viewMode === 'spread'}
        <ImageViewer
          {viewMode}
          {records}
          {selectedRecordId}
          {zoom}
          {rotation}
          {brightness}
          {contrast}
          {saturation}
          onPrev={handlePrev}
          onNext={handleNext}
          onOneToOneChange={(z) => oneToOne = z}
        />
        <div class="thumbnail-area">
          <ThumbnailStrip
            {records}
            {selectedRecordId}
            {viewMode}
            onSelect={handleSelect}
          />
        </div>
      {/if}

    </div>

    <RightToolbar
      {viewMode}
      {zoom}
      {oneToOne}
      {canExport}
      onViewModeChange={handleViewModeChange}
      onZoomChange={(z) => zoom = z}
      onExport={() => showChooserModal = true}
    />

  </div>

</div>

{#if inspectedRecord}
  <ImageViewerModal
    record={inspectedRecord}
    userRole={$userRole}
    onClose={() => inspectedRecord = null}
    onRetake={handleRetake}
    onDelete={handleDeleteRecord}
  />
{/if}

{#if showExportModal}
  <div class="export-modal-backdrop" use:dismissible={{ onDismiss: () => showExportModal = false, escape: !isExporting, backdrop: !isExporting }}>
    <div class="export-modal-card dialog-fit" role="dialog" aria-modal="true">
      {#if isExporting}
        <div class="spinner"></div>
        <h3 class="export-modal-title">{$m.col_export_generating}</h3>
        <p class="export-modal-subtitle">
          {#if exportProgress && exportProgress.total > 0}
            {formatCount(exportProgress.done, $locale)} / {formatCount(exportProgress.total, $locale)}
          {:else}
            {$m.col_export_copying}
          {/if}
        </p>
      {:else if exportResult}
        <span class="material-symbols-outlined icon-lg export-success-icon">check_circle</span>
        <h3 class="export-modal-title">{$m.col_export_done}</h3>
        <p class="export-modal-subtitle">{exportResult.zip_filename}</p>
        <div class="export-modal-actions">
          <a href={collectionsApi.getExportDownloadUrl(collectionId)} download class="btn-primary">
            <span class="material-symbols-outlined icon-sm">download</span>
            {$m.col_download_zip}
          </a>
          <button class="btn-secondary" onclick={() => showExportModal = false}>{$m.common_close}</button>
        </div>
      {:else if exportError}
        <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
        <h3 class="export-modal-title">{$m.col_err_export}</h3>
        <p class="export-modal-subtitle">{exportError}</p>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => showExportModal = false}>{$m.common_close}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
{#if deleteRecordError}
  <div class="export-modal-backdrop" use:dismissible={{ onDismiss: () => deleteRecordError = null }}>
    <div class="export-modal-card dialog-fit" role="dialog" aria-modal="true">
      <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
      <h3 class="export-modal-title">{$m.col_delete_record_error_title}</h3>
      <p class="export-modal-subtitle">{deleteRecordError}</p>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={() => deleteRecordError = null}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}
{#if showBlockersModal}
  <div class="export-modal-backdrop" use:dismissible={{ onDismiss: () => showBlockersModal = false }}>
    <div class="export-modal-card dialog-fit" role="dialog" aria-modal="true">
      <span class="material-symbols-outlined icon-lg export-error-icon">block</span>
      <h3 class="export-modal-title">{$m.col_export_blocked_title}</h3>
      <p class="export-modal-subtitle">{$m.col_export_blocked_desc}</p>
      <ul class="blockers-list">
        {#each blockingRecords as r}
          <li>
            <button class="blocker-item" onclick={() => { showBlockersModal = false; inspectedRecord = r; }}>
              <span class="material-symbols-outlined icon-sm">image</span>
              {r.title || $m.record_fallback_title(r.id)}
            </button>
          </li>
        {/each}
      </ul>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={() => showBlockersModal = false}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}
{#if showChooserModal}
  <div class="export-modal-backdrop" use:dismissible={{ onDismiss: () => showChooserModal = false }}>
    <div class="export-modal-card dialog-fit" role="dialog" aria-modal="true">
      <h3 class="export-modal-title">{$m.col_download_choose_title}</h3>
      <p class="export-modal-subtitle">{$m.col_download_choose_desc}</p>
      <div class="chooser-options">
        <button class="chooser-option" onclick={() => { showChooserModal = false; handleExport(); }}>
          <span class="material-symbols-outlined chooser-icon bagit">inventory_2</span>
          <span class="chooser-text">
            <span class="chooser-title">{$m.col_bagit_option_title}</span>
            <span class="chooser-desc">{$m.col_bagit_option_desc}</span>
            <span class="chooser-chip amber"><span class="material-symbols-outlined">lock</span>{$m.col_bagit_requires_approval}</span>
          </span>
        </button>
        <button class="chooser-option" onclick={() => { showChooserModal = false; downloadImagesZip(); }}>
          <span class="material-symbols-outlined chooser-icon images">image</span>
          <span class="chooser-text">
            <span class="chooser-title">{$m.col_images_option_title}</span>
            <span class="chooser-desc">{$m.col_images_option_desc}</span>
            <span class="chooser-chip green"><span class="material-symbols-outlined">check</span>{$m.col_images_always}</span>
          </span>
        </button>
        {#if canDownloadManifest}
          <button class="chooser-option" onclick={() => { showChooserModal = false; downloadCaptureManifest(); }}>
            <span class="material-symbols-outlined chooser-icon bagit">view_list</span>
            <span class="chooser-text">
              <span class="chooser-title">{$m.col_manifest_option_title}</span>
              <span class="chooser-desc">{$m.col_manifest_option_desc}</span>
              <span class="chooser-chip amber"><span class="material-symbols-outlined">lock</span>{$m.col_manifest_requires}</span>
            </span>
          </button>
        {/if}
      </div>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={() => showChooserModal = false}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}
{#if isZipping || zipError}
  <div class="export-modal-backdrop" use:dismissible={{ onDismiss: () => zipError = null, escape: !isZipping, backdrop: !isZipping }}>
    <div class="export-modal-card dialog-fit" role="dialog" aria-modal="true">
      {#if isZipping}
        <div class="spinner"></div>
        <h3 class="export-modal-title">{$m.col_zip_generating}</h3>
        <p class="export-modal-subtitle">{zipProgress}%</p>
      {:else if zipError}
        <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
        <h3 class="export-modal-title">{$m.col_zip_error}</h3>
        <p class="export-modal-subtitle">{zipError}</p>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => zipError = null}>{$m.common_close}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if isManifestLoading || manifestRefusal || manifestError}
  <div class="export-modal-backdrop" use:dismissible={{ onDismiss: () => { manifestRefusal = null; manifestError = null; }, escape: !isManifestLoading, backdrop: !isManifestLoading }}>
    <div class="export-modal-card dialog-fit" role="dialog" aria-modal="true">
      {#if isManifestLoading}
        <div class="spinner"></div>
        <h3 class="export-modal-title">{$m.col_manifest_preparing}</h3>
      {:else if manifestRefusal}
        <span class="material-symbols-outlined icon-lg export-error-icon">block</span>
        <h3 class="export-modal-title">{$m.col_manifest_refused_title}</h3>
        <p class="export-modal-subtitle">{$m.col_manifest_refused_body}</p>
        <ul class="manifest-problems">
          {#each manifestRefusal.problems as problem, i (i)}
            <li>
              <span>{problem.text}</span>
              {#if problem.records}
                <span class="manifest-problem-records">{problem.records}</span>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => manifestRefusal = null}>{$m.common_close}</button>
        </div>
      {:else if manifestError}
        <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
        <h3 class="export-modal-title">{$m.col_manifest_err_title}</h3>
        <p class="export-modal-subtitle">{manifestError}</p>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => manifestError = null}>{$m.common_close}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes spin { to { transform: rotate(360deg); } }

  .chooser-options { display: flex; flex-direction: column; gap: 12px; width: 100%; margin: 6px 0 4px; }
  .chooser-option {
    display: flex; gap: 14px; text-align: left; width: 100%;
    padding: 14px; border: 1px solid var(--border-color); border-radius: 12px;
    background: var(--color-surface); color: var(--color-light); cursor: pointer;
    font-family: var(--font-family);
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
  }
  .chooser-option:hover { background: var(--color-surface-alt-2); border-color: var(--color-primary); }
  .chooser-icon { flex-shrink: 0; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .chooser-icon.bagit { background: rgba(90,140,98,0.16); color: var(--color-primary); }
  .chooser-icon.images { background: rgba(150,177,240,0.15); color: var(--color-secondary); }
  .chooser-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .chooser-title { font-size: 15px; font-weight: var(--fw-semibold); }
  .chooser-desc { font-size: 12.5px; color: var(--color-light-grey); line-height: 1.5; }
  .chooser-chip { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 11px; padding: 3px 9px; border-radius: var(--radius-full); width: fit-content; }
  .chooser-chip .material-symbols-outlined { font-size: 13px; }
  .chooser-chip.amber { color: var(--color-highlight); background: rgba(225,183,120,0.14); }
  .chooser-chip.green { color: var(--color-primary); background: rgba(90,140,98,0.14); }
  .blockers-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .blocker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .blocker-item:hover { background: var(--color-surface-alt-2); }
  .manifest-problems {
    margin: 0;
    padding: 0 0 0 20px;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    text-align: left;
    font-size: var(--text-sm);
    color: var(--color-light);
    line-height: 1.5;
  }
  .manifest-problems li { display: flex; flex-direction: column; gap: 2px; }
  .manifest-problem-records { color: var(--color-light-grey); font-size: 12.5px; }
</style>

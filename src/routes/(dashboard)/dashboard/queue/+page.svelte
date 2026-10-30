<script lang="ts">
  // ============================================================================
  // Cola (0.2.0): the digitisation lists imported on this unit, each item in
  // list order with its action, its notes in full, its volume's stage and a
  // button that opens the volume for capture.
  //
  // The lists come from GET /imports/digitisation-lists, newest import first;
  // the page shows one at a time, with a picker when there are several. The
  // next item and the done ones are decided in $lib/queue; an admin or a
  // reviewer can also mark an item done by hand, or take the mark off
  // (PUT .../items/{position}/done), and the mark the backend returns goes
  // straight into the item. Importing a list
  // posts the picked file to POST /imports/digitisation-list and shows the
  // report: what was created, and each skipped item with its reason, an item
  // already on the unit apart from the errors.
  //
  // The items not done are shown in three sections (0.3.1), decided in
  // $lib/queue: first what is in progress, then recaptures and rescans, then
  // new material, each numbered among the sections shown; the done items
  // follow, below them, except one whose volume still owes retakes, which
  // stays in the second section. While recaptures are pending on the unit (0.2.0, GET
  // /records/to-retake/summary), the page says whose turn it is, and each
  // item whose volume has retakes, in the second section, shows "N de M
  // pendientes" and a Recapturar that opens its first pending record; during
  // the retake turn only new material carries the line that says a new
  // volume must wait. Siguiente is the first item of the first section that
  // has one to capture.
  //
  // The digitisation queue synced with Fisqua (contract 1.7) is one more list
  // in the answer, with `source` `queue`; the page shows it first, labelled
  // as Fisqua's, and the file lists stay in the picker. An operator sees the
  // queue items assigned to them and the unassigned ones; an admin sees every
  // item, with a Mine / Unassigned / Everyone filter. Each queue item names
  // its assignee. Withdrawn items, and items whose volume a withdrawn entry
  // hid, are not shown, on any list. A spot recapture with retakes shows how
  // many page pairs it asks for and lists them as Por recapturar names the
  // records. A queue item's done mark sends its itemId; a 409 means the
  // queue moved, so the page reads it again and says so.
  // ============================================================================
  //
  // Version: 0.3.2

  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { importsApi, recordsApi, ApiError, AuthError, type ImportReport, type QueueItem, type QueueList, type RecordToRetake, type RetakeSummary } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { authStore, userRole } from '$lib/stores/auth';
  import { formatApiDate } from '$lib/format-date';
  import { formatCount } from '$lib/format-count';
  import { barSegments, placeVolume, type BarStatus, type PipelineStage } from '$lib/pipeline';
  import {
    actionsPresent, captureUrl, defaultListId, filterByAction, filterByAssignee, isItemDone, isItemShown,
    isLockedForTurn, isOnUnitReject, isQueueList, itemsForUser, nextItemPosition, queueSections, retakePairs, retakeUrl,
    type AssigneeFilter, type QueueSectionKey
  } from '$lib/queue';
  import { readRetakeSummary, retakeProgress, retakeVolumeMap } from '$lib/recapture-turn';
  import { actionLabel, importErrorText, importReasonText } from '$lib/queue-labels';

  // Capture and import are admin and operator only, as the capture screen
  // and the import route are.
  let canOperate = $derived($userRole === 'admin' || $userRole === 'operator');
  // Marking an item done is a review decision: admin and reviewer, as the
  // backend allows.
  let canMarkDone = $derived($userRole === 'admin' || $userRole === 'reviewer');
  // The signed-in user's username, for the queue's assignees (contract 1.7).
  let username = $derived($authStore.user?.username ?? null);

  // ---------------------------------------------------------------------------
  // Lists
  // ---------------------------------------------------------------------------
  let lists = $state<QueueList[] | null>(null);
  // The first load failed: nothing to show.
  let loadError = $state(false);
  // A later reload failed: the lists already on screen stay, with a notice.
  let refreshError = $state(false);
  // Each load takes a number; only the latest one's answer is kept, so an
  // older answer arriving late cannot overwrite a newer one.
  let loadSequence = 0;
  let selectedListId = $state<string | null>(null);

  async function loadLists(select?: string) {
    const sequence = ++loadSequence;
    try {
      const data = await importsApi.lists();
      if (sequence !== loadSequence) return;
      lists = data;
      loadError = false;
      refreshError = false;
      if (select && data.some(l => l.listId === select)) selectedListId = select;
      // The Fisqua queue is shown first when there is one (contract 1.7).
      else if (!data.some(l => l.listId === selectedListId)) selectedListId = defaultListId(data);
    } catch (err) {
      // A 401 is a dead session: apiRequest already sends the user to /login.
      if (sequence !== loadSequence) return;
      if (err instanceof AuthError && err.status === 401) return;
      console.error('[Queue] Error loading lists:', err);
      if (lists === null) loadError = true;
      else refreshError = true;
    }
  }

  // Records waiting for recapture, counted per volume from
  // GET /records/to-retake. Without them the page shows no counts. The rows
  // also name a spot recapture's pairs (contract 1.7).
  let retakeCounts = $state<Map<number, number>>(new Map());
  let retakeRows = $state<RecordToRetake[]>([]);

  async function loadRetakeCounts() {
    try {
      const rows = await recordsApi.toRetake();
      const counts = new Map<number, number>();
      for (const row of rows) {
        if (row.collectionId != null) counts.set(row.collectionId, (counts.get(row.collectionId) ?? 0) + 1);
      }
      retakeCounts = counts;
      retakeRows = rows;
    } catch (err) {
      console.error('[Queue] Error loading records to retake:', err);
    }
  }

  // The recapture summary; null until it arrives, and when it cannot be
  // loaded, which shows the list as one, with no turn.
  let retakeSummary = $state<RetakeSummary | null>(null);

  async function loadRetakeSummary() {
    try {
      retakeSummary = readRetakeSummary(await recordsApi.toRetakeSummary());
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) return;
      console.error('[Queue] Error loading the recapture summary:', err);
    }
  }

  onMount(() => { loadLists(); loadRetakeCounts(); loadRetakeSummary(); });

  let retakeVolumes = $derived(retakeVolumeMap(retakeSummary));
  let turn = $derived(retakeSummary && retakeSummary.pendingRecords > 0 ? retakeSummary.turn : null);
  // A new volume waits for the retakes of one volume.
  let newVolumeLocked = $derived(turn?.state === 'recaptures');
  // The volumes with retakes, while something is pending and the turn says
  // so; empty otherwise, and the second section then holds only rescans.
  let retakeSet = $derived<ReadonlySet<number>>(
    turn !== null && turn.state !== 'free' ? new Set(retakeVolumes.keys()) : new Set()
  );
  let splitByRetakes = $derived(retakeSet.size > 0);

  let list = $derived(lists?.find(l => l.listId === selectedListId) ?? null);
  let isQueue = $derived(isQueueList(list));
  // The items this user works from: withdrawn and hidden ones left out, and
  // for an operator only their own and the unassigned ones. Siguiente and
  // the action filter count only these.
  let items = $derived(itemsForUser((list?.items ?? []).filter(isItemShown), $userRole, username));
  let nextPosition = $derived(nextItemPosition(items, retakeSet));
  let actions = $derived(actionsPresent(items));

  // null shows every item. A filter whose action the chosen list does not
  // have falls back to every item.
  let actionFilter = $state<string | null>(null);
  // The admin's assignee filter on the queue (contract 1.7); Everyone
  // elsewhere.
  let showAssigneeFilter = $derived(isQueue && $userRole === 'admin');
  let assigneeFilter = $state<AssigneeFilter>('everyone');
  let assigneeItems = $derived(filterByAssignee(items, showAssigneeFilter ? assigneeFilter : 'everyone', username));
  let shownItems = $derived(filterByAction(assigneeItems, actions.includes(actionFilter ?? '') ? actionFilter : null));
  let assigneeOptions = $derived<{ value: AssigneeFilter; label: string }[]>([
    { value: 'mine', label: $m.queue_assignee_mine },
    { value: 'unassigned', label: $m.queue_unassigned },
    { value: 'everyone', label: $m.queue_assignee_everyone },
  ]);
  // What the queue says when nothing is left to show.
  let queueEmptyText = $derived(
    !isQueue || shownItems.length > 0 ? null
      : showAssigneeFilter && assigneeFilter !== 'everyone' ? $m.queue_assignee_empty
      : $userRole === 'operator' ? $m.queue_operator_empty
      : $m.queue_items_empty
  );
  let sectioned = $derived(queueSections(shownItems, retakeSet));
  let sectionText = $derived<{ [K in QueueSectionKey]: { title: (n: number) => string; sub: string } }>({
    progress: { title: $m.section_progress_title, sub: $m.section_progress_sub },
    rework: { title: $m.section_rework_title, sub: $m.section_rework_sub },
    new: { title: $m.section_new_title, sub: $m.section_new_sub },
  });

  // The filter hides the next item: say so, since its mark is not on screen.
  let nextHidden = $derived(nextPosition !== null && !shownItems.some(i => i.position === nextPosition));

  function formatDate(iso: string): string {
    return formatApiDate(iso, $locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // A list's name in the picker; the queue is labelled as Fisqua's.
  function listOption(l: QueueList): string {
    if (isQueueList(l)) return l.importedAt ? $m.queue_fisqua_option(l.listName, formatDate(l.importedAt)) : $m.queue_fisqua_name(l.listName);
    return l.importedAt ? $m.queue_list_option(l.listName, formatDate(l.importedAt)) : l.listName;
  }

  function formatWhen(iso: string): string {
    return formatApiDate(iso, $locale, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  // Who marked the item done and when, with whatever the mark records.
  function markText(item: QueueItem): string {
    const mark = item.doneMark;
    if (!mark) return '';
    if (mark.by && mark.at) return $m.queue_done_by(mark.by, formatWhen(mark.at));
    if (mark.by) return $m.queue_done_by_who(mark.by);
    if (mark.at) return $m.queue_done_on(formatWhen(mark.at));
    return $m.queue_done_marked;
  }

  // ---------------------------------------------------------------------------
  // Manual done marks
  // ---------------------------------------------------------------------------
  let markingPosition = $state<number | null>(null);
  let markError = $state<string | null>(null);

  async function setDone(item: QueueItem, done: boolean) {
    if (!list) return;
    const listId = list.listId;
    markingPosition = item.position;
    markError = null;
    // A queue item's mark goes by its itemId (contract 1.7); a file's item
    // has none, and its request is as before.
    const itemId = item.itemId ?? null;
    try {
      const doneMark = itemId
        ? await importsApi.setDone(listId, item.position, done, itemId)
        : await importsApi.setDone(listId, item.position, done);
      const target = lists?.find(l => l.listId === listId)?.items
        .find(i => i.position === item.position && (itemId === null || i.itemId === itemId));
      if (target) target.doneMark = doneMark;
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) return;
      console.error('[Queue] Error changing the done mark:', err);
      const status = err instanceof ApiError ? err.status : undefined;
      if (status === 409) {
        // The item at this position is another queue entry now: read the
        // queue again, so that what is on screen is what Fisqua sent.
        markError = $m.queue_mark_conflict;
        await loadLists();
        return;
      }
      markError = status === 503 ? $m.queue_mark_error_busy : $m.queue_mark_error;
    } finally {
      markingPosition = null;
    }
  }

  // The order number: the list's sequence, or the item's place in the file
  // when it has none.
  function orderOf(item: QueueItem): number {
    return item.sequence ?? item.position;
  }

  let stageTitle = $derived<{ [K in PipelineStage]: string }>({
    capture: $m.dash_stage_capture,
    recapture: $m.dash_stage_recapture,
    review: $m.dash_stage_review,
    approved: $m.dash_stage_approved,
  });

  let statusLabel = $derived<{ [K in BarStatus]: string }>({
    captured: $m.status_captured_plural,
    rejected: $m.status_rejected_plural,
    in_review: $m.status_in_review,
    approved: $m.status_approved_plural,
  });

  function recordTotal(item: QueueItem): number {
    const s = item.status;
    // Excluded records (Fisqua contract 1.6) count, as in record_count.
    return s ? s.captured + s.in_review + s.rejected + s.approved + s.excluded : 0;
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------
  let fileInput = $state<HTMLInputElement | null>(null);
  let importButton = $state<HTMLButtonElement | null>(null);
  let reportHeading = $state<HTMLHeadingElement | null>(null);
  let importing = $state(false);
  let report = $state<ImportReport | null>(null);
  let importError = $state<string | null>(null);

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared, so that picking the same file again fires `change` again.
    input.value = '';
    if (!file) return;
    importing = true;
    importError = null;
    report = null;
    try {
      report = await importsApi.importList(file);
      // The import may add volumes with retakes: the turn and the sections
      // follow it (0.2.0).
      await Promise.all([loadLists(report.listId), loadRetakeSummary()]);
    } catch (err) {
      importing = false;
      if (err instanceof AuthError && err.status === 401) return;
      // The backend's text is English; the console keeps it.
      console.error('[Queue] Import refused:', err);
      const status = err instanceof ApiError || err instanceof AuthError ? err.status : undefined;
      importError = importErrorText($m, status);
      // The button was disabled during the import, which drops its focus.
      await tick();
      importButton?.focus();
      return;
    }
    importing = false;
    // The report replaces what the button did: focus goes to its heading,
    // and the live region around it announces it.
    await tick();
    reportHeading?.focus();
  }
</script>

<!-- Stacked status bar, as in "Digitalizaciones en curso": decorative, with
     the counts in visually hidden text beside it. -->
{#snippet statusBar(item: QueueItem)}
  {@const segs = item.status ? barSegments(item.status) : []}
  <div class="pl-bar" aria-hidden="true">
    {#each segs as seg (seg.status)}
      <span class="pl-seg seg-{seg.status}" style="width: {seg.percent}%"></span>
    {/each}
  </div>
  {#if segs.length > 0}
    <span class="visually-hidden">
      {#each segs as seg, i (seg.status)}{statusLabel[seg.status]}: {formatCount(seg.count, $locale)}{i < segs.length - 1 ? ', ' : ''}{/each}
    </span>
  {/if}
{/snippet}

{#snippet queueRow(item: QueueItem)}
  {@const done = isItemDone(item)}
  {@const isNext = item.position === nextPosition}
  {@const projectId = item.projectId}
  {@const retake = item.collectionId != null ? retakeVolumes.get(item.collectionId) : undefined}
  <li class="q-row" class:is-next={isNext} class:is-done={done}>
    <span class="q-order"><span aria-hidden="true">{orderOf(item)}</span><span class="visually-hidden">{$m.queue_order_label(orderOf(item))}</span></span>

    <div class="q-main">
      <div class="q-head">
        <span class="q-title">{item.title ?? item.referenceCode ?? '—'}</span>
        {#if isNext}
          <span class="q-mark q-mark-next">{$m.queue_next}</span>
        {:else if done}
          <span class="q-mark q-mark-done">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            <span>{$m.queue_done}</span>
          </span>
        {/if}
      </div>
      <div class="q-meta">
        {#if item.referenceCode}<span class="q-code">{item.referenceCode}</span>{/if}
        {#if item.action}<span class="q-action">{actionLabel($m, item.action)}</span>{/if}
        {#if isQueue}
          <span class="q-assignee">{item.assignee ? $m.queue_assignee(item.assignee) : $m.queue_unassigned}</span>
        {/if}
      </div>
      {#if typeof item.notes === 'string' && item.notes.trim()}
        <p class="q-notes">{item.notes}</p>
      {/if}
      {#if item.action === 'spot-recapture' && item.retakes && item.retakes.length > 0}
        {@const pairs = retakePairs(item.retakes, retakeRows)}
        <div class="q-pairs">
          <span class="q-pairs-count">{$m.vol_band_title(pairs.length)}</span>
          <ul class="q-pair-list">
            {#each pairs as pair, i (i)}
              <li class="q-pair">
                {#if pair.title !== null}
                  <span class="q-pair-title">{pair.title}</span>
                  {#if pair.sequence !== null}<span class="q-pair-sequence">{$m.retakes_sequence(pair.sequence)}</span>{/if}
                {:else}
                  <span class="q-pair-title">{$m.queue_retake_record(pair.recordId)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if item.doneMark}
        <span class="q-done-note">{markText(item)}</span>
      {:else if done}
        <span class="q-done-note">{$m.queue_done_approved}</span>
      {/if}
    </div>

    <div class="q-progress">
      {#if splitByRetakes && retake}
        {@const progress = retakeProgress(retake)}
        <!-- The records that miss a side (0.3.2) are pending with the
             others; retakeProgress adds them to the total. -->
        <span class="q-pending">{$m.retake_pending_of(progress.pending, progress.total)}</span>
        <div class="q-retake-bar" aria-hidden="true">
          <span style="width: {progress.donePercent}%"></span>
        </div>
      {:else if item.collectionId == null || item.status == null}
        <span class="q-no-volume">{$m.queue_no_volume}</span>
      {:else}
        <span class="q-stage">{stageTitle[placeVolume(item.status)]}</span>
        {@render statusBar(item)}
        <span class="pl-count">{$m.dash_records_count(recordTotal(item))}</span>
        {@const toRetake = retakeCounts.get(item.collectionId) ?? 0}
        {#if toRetake > 0}
          <a class="q-retake" href="/dashboard/retakes?collectionId={item.collectionId}">{$m.q_to_retake(toRetake)}</a>
        {/if}
      {/if}
    </div>

    <div class="q-actions">
      {#if splitByRetakes && retake}
        {#if canOperate}
          <a class="btn btn-recapture q-recapture" href={retakeUrl(retake.projectId, retake.collectionId, retake.firstPendingRecordId)}>{$m.retake_cta}</a>
        {/if}
      {:else if canOperate && item.collectionId != null && projectId != null}
        <button class="btn ip-btn ip-btn-capture" onclick={() => goto(captureUrl(projectId, item.collectionId as number))}>
          <!-- New material waits for its turn (0.2.0, 0.3.1): the capture screen says why. -->
          <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">{isLockedForTurn(item, retakeSet, turn?.state) ? 'lock' : 'photo_camera'}</span>
          <span>{$m.col_live_preview}</span>
        </button>
      {/if}
      {#if canMarkDone && !done}
        <button class="btn ip-btn ip-btn-mark" disabled={markingPosition !== null} onclick={() => setDone(item, true)}>
          <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">check</span>
          <span>{$m.queue_mark_done}</span>
        </button>
      {:else if canMarkDone && item.doneMark}
        <button class="btn ip-btn ip-btn-unmark" disabled={markingPosition !== null} onclick={() => setDone(item, false)}>
          {$m.queue_unmark_done}
        </button>
      {/if}
    </div>
  </li>
{/snippet}

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="page-title">{$m.queue_title}</h1>
      <p class="page-subtitle">{$m.queue_subtitle}</p>
    </div>
    {#if canOperate}
      <input
        bind:this={fileInput}
        class="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label={$m.queue_import_file_label}
        tabindex="-1"
        onchange={handleFile}
      />
      <button bind:this={importButton} class="btn btn-primary" disabled={importing} onclick={() => fileInput?.click()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {importing ? $m.queue_importing : $m.queue_import}
      </button>
    {/if}
  </div>

  {#if turn?.state === 'recaptures'}
    <p class="turn-pill is-recaptures" role="status">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
      <strong>{$m.turn_recap_title}</strong>
      <span>{$m.turn_recap_body}</span>
    </p>
  {:else if turn?.state === 'new'}
    <p class="turn-pill is-new" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
      <strong>{$m.turn_new_title}</strong>
      {#if turn.unlockedBy}<span>{$m.turn_new_body(turn.unlockedBy.name)}</span>{/if}
    </p>
  {/if}

  {#if importError}
    <p class="notice is-error" role="alert">{importError}</p>
  {/if}

  <!-- Always present, so that a screen reader announces the report when it
       appears inside. -->
  <div aria-live="polite">
  {#if report}
    <section class="report" aria-labelledby="import-report-title">
      <div class="report-head">
        <h2 bind:this={reportHeading} id="import-report-title" class="report-title" tabindex="-1">{$m.queue_report_title(report.listName)}</h2>
        <button class="btn btn-ghost report-close" onclick={() => (report = null)}>{$m.common_close}</button>
      </div>
      {#if report.projectCreated}
        <p class="report-line">{$m.queue_report_project_created(report.projectName)}</p>
      {/if}
      <p class="report-line">{$m.queue_report_created(report.created)}</p>
      <p class="report-line">{$m.queue_report_skipped(report.skipped)}</p>
      {#if report.listStored === false}
        <p class="report-line is-warning">{$m.queue_report_list_not_stored}</p>
      {/if}
      {#if report.rejects.length > 0}
        <ul class="skips">
          {#each report.rejects as reject (reject.position)}
            <li class="skip" class:is-error={!isOnUnitReject(reject)}>
              <span class="skip-item">{$m.queue_report_item(reject.position, reject.referenceCode)}</span>
              <span class="skip-reason">{importReasonText($m, reject.reason)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
  </div>

  {#if markError}
    <p class="notice is-error" role="alert">{markError}</p>
  {/if}
  {#if refreshError}
    <p class="notice is-error" role="status">{$m.queue_refresh_error}</p>
  {/if}

  {#if loadError}
    <p class="notice is-error" role="status">{$m.queue_load_error}</p>
  {:else if lists === null}
    <p class="notice" role="status">{$m.common_loading_ellipsis}</p>
  {:else if lists.length === 0}
    <p class="empty">{$m.queue_empty}</p>
  {:else if list}
    <div class="toolbar">
      {#if lists.length > 1}
        <label class="picker">
          <span class="picker-label">{$m.queue_list_label}</span>
          <select class="picker-select" bind:value={selectedListId}>
            {#each lists as l (l.listId)}
              <option value={l.listId}>{listOption(l)}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="list-name">
          <strong>{isQueue ? $m.queue_fisqua_name(list.listName) : list.listName}</strong>
          {#if list.importedAt}<span>{isQueue ? $m.queue_updated_at(formatDate(list.importedAt)) : $m.queue_imported_at(formatDate(list.importedAt))}</span>{/if}
        </p>
      {/if}

      {#if showAssigneeFilter}
        <div class="view-switch" role="group" aria-label={$m.queue_assignee_filter_label}>
          {#each assigneeOptions as option (option.value)}
            <button type="button" class="view-btn" aria-pressed={assigneeFilter === option.value} onclick={() => (assigneeFilter = option.value)}>
              {option.label}
            </button>
          {/each}
        </div>
      {/if}

      {#if actions.length > 0}
        <div class="view-switch" role="group" aria-label={$m.queue_filter_label}>
          <button type="button" class="view-btn" aria-pressed={!actions.includes(actionFilter ?? '')} onclick={() => (actionFilter = null)}>
            {$m.queue_filter_all}
          </button>
          {#each actions as action (action)}
            <button type="button" class="view-btn" aria-pressed={actionFilter === action} onclick={() => (actionFilter = action)}>
              {actionLabel($m, action)}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if list.listFileMissing}
      <p class="empty">{$m.queue_list_file_missing}</p>
    {:else}
      {#if nextHidden}
        <p class="notice" role="status">{$m.queue_next_hidden}</p>
      {/if}
      {#if queueEmptyText}
        <p class="empty">{queueEmptyText}</p>
      {:else}
        {#each sectioned.sections as section (section.key)}
          {@const locked = section.key === 'new' && newVolumeLocked}
          <section
            class="q-section q-{section.key}"
            class:q-first={section.ordinal === 1}
            class:is-locked={locked}
            aria-labelledby="q-{section.key}-title"
          >
            <div class="q-section-head">
              <h2 id="q-{section.key}-title" class="q-section-title">{sectionText[section.key].title(section.ordinal)}</h2>
              {#if locked}
                <span class="q-locked">
                  <span class="material-symbols-outlined" aria-hidden="true">lock</span>
                  <span>{$m.q_new_locked}</span>
                </span>
              {/if}
            </div>
            <p class="q-section-sub">{sectionText[section.key].sub}</p>
            <ol class="queue">
              {#each section.items as item (item.position)}
                {@render queueRow(item)}
              {/each}
            </ol>
          </section>
        {/each}
        {#if sectioned.done.length > 0}
          <!-- The done items, below the sections and in none. -->
          <ol class="queue q-done-list">
            {#each sectioned.done as item (item.position)}
              {@render queueRow(item)}
            {/each}
          </ol>
        {/if}
      {/if}
    {/if}
  {/if}
</div>

<style>
  .page { padding: 32px; max-width: 1200px; }

  /* Same values as the users page header. */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px 16px;
    margin-bottom: 24px;
  }
  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .notice { margin: 0 0 16px; font-size: var(--text-sm); color: var(--color-light-grey); }
  .notice.is-error { color: var(--color-error); }
  .empty { margin: 0; padding: 24px; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--color-light-grey); font-size: var(--text-sm); line-height: 1.5; }

  /* ── Import report ── */
  .report {
    margin-bottom: 24px;
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
  }
  .report-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .report-title { margin: 0; font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); overflow-wrap: anywhere; }
  .report-close { padding: 6px 14px; font-size: var(--text-sm); }
  .report-line { margin: 0 0 4px; font-size: var(--text-sm); color: var(--color-light); }
  .report-line.is-warning { color: var(--color-warning); }
  .skips { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .skip {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--color-light-grey);
    background-color: var(--color-surface-alt);
    font-size: var(--text-sm);
  }
  .skip.is-error { border-left-color: var(--color-error); }
  .skip-item { font-weight: var(--fw-bold); color: var(--color-light); }
  .skip-reason { color: var(--color-light-grey); overflow-wrap: anywhere; }
  .skip.is-error .skip-reason { color: var(--color-error); }

  /* ── Toolbar: list picker and action filter ── */
  .toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 16px; }
  .picker { display: flex; align-items: center; gap: 10px; }
  .picker-label { font-size: var(--text-xs); font-weight: var(--fw-bold); letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-light-grey); }
  .picker-select {
    min-height: var(--touch-target-min);
    max-width: 100%;
    padding: 0 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt-2);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: var(--text-sm);
  }
  .list-name { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; font-size: var(--text-sm); color: var(--color-light-grey); }
  .list-name strong { color: var(--color-light); font-size: var(--text-base); }

  /* Same switch as "Digitalizaciones en curso". */
  .view-switch {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-lg);
    background-color: var(--color-surface-alt-2);
    border: 1px solid var(--border-color);
  }
  .view-btn {
    min-height: var(--touch-target-min);
    padding: 0 16px;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-light-grey);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }
  .view-btn:hover { color: var(--color-light); }
  .view-btn[aria-pressed='true'] { background-color: var(--color-light); color: var(--color-bg); }
  .view-btn:focus-visible { outline: 2px solid var(--color-primary-focus); outline-offset: 2px; }

  /* ── The list ── */
  .queue {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
    container-type: inline-size;
  }
  .q-row {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) minmax(9rem, 14rem) max-content;
    gap: 8px 20px;
    align-items: center;
    padding: 14px 16px;
  }
  .q-row + .q-row { border-top: 1px solid var(--border-color); }
  .q-row.is-next { background-color: rgba(90, 140, 98, 0.12); box-shadow: inset 3px 0 0 var(--color-primary); }
  .q-row.is-done .q-title { color: var(--color-light-grey); }

  .q-order {
    align-self: start;
    font-size: var(--text-lead);
    font-weight: var(--fw-black);
    color: var(--color-light-grey);
    font-variant-numeric: tabular-nums;
  }

  .q-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .q-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; }
  .q-title { font-weight: var(--fw-bold); color: var(--color-light); overflow-wrap: anywhere; }
  .q-mark {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .q-mark-next { padding: 2px 8px; border-radius: var(--radius-full); background-color: var(--color-primary); color: var(--color-light); }
  .q-mark-done { color: var(--color-success); }
  .q-mark-done .material-symbols-outlined { font-size: 15px; }
  .q-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: var(--text-sm); color: var(--color-light-grey); }
  .q-code { overflow-wrap: anywhere; }
  .q-assignee { overflow-wrap: anywhere; }
  .q-action { color: var(--color-highlight); font-weight: var(--fw-bold); }
  /* Folio lists are read in full: they wrap, never cut. */
  .q-notes {
    margin: 2px 0 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-light);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* A spot recapture's page pairs (contract 1.7), as Por recapturar names them. */
  .q-pairs { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
  .q-pairs-count { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-highlight); }
  .q-pair-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .q-pair { display: flex; flex-wrap: wrap; gap: 0 8px; font-size: var(--text-sm); color: var(--color-light); }
  .q-pair-sequence { color: var(--color-light-grey); }

  .q-progress { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .q-stage { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light); }
  .q-retake { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-error); }
  .q-retake:hover,
  .q-retake:focus-visible { text-decoration: underline; }
  .q-done-note { font-size: var(--text-xs); color: var(--color-success); }
  .q-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .q-no-volume { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.4; }

  /* ── The recapture turn (0.2.0) ── */
  .turn-pill {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    width: fit-content;
    max-width: 100%;
    margin: 0 0 20px;
    padding: 10px 16px;
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
  }
  .turn-pill strong { font-weight: var(--fw-black); }
  .turn-pill .material-symbols-outlined { font-size: 20px; }
  .turn-pill.is-recaptures { background-color: var(--color-highlight); color: var(--color-bg); }
  .turn-pill.is-new { border: 1px solid var(--color-success); color: var(--color-success); background-color: var(--color-success-bg); }

  .q-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
  .q-first {
    padding: 20px;
    border-radius: var(--radius-lg);
    border: 2px solid var(--color-highlight);
    background-color: rgba(225, 183, 120, 0.08);
  }
  .q-section-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
  .q-section-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-extrabold); color: var(--color-light); }
  .q-first .q-section-title { color: var(--color-highlight); }
  .q-section-sub { margin: 0; font-size: var(--text-sm); color: var(--color-light); }
  .q-locked { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--color-light-grey); }
  .q-locked .material-symbols-outlined { font-size: 18px; }
  .q-section.is-locked .queue { opacity: 0.6; }
  .q-first .queue { background-color: var(--color-surface); }
  .q-recapture { padding: 8px 18px; font-size: var(--text-sm); }
  .q-pending { font-size: var(--text-sm); font-weight: var(--fw-extrabold); color: var(--color-highlight); }
  .q-retake-bar { width: 100%; height: 6px; border-radius: var(--radius-full); background-color: var(--color-surface-alt-2); overflow: hidden; }
  .q-retake-bar span { display: block; height: 100%; background-color: var(--color-highlight); }

  /* ── Stacked status bar, as in InProgress.svelte ── */
  .pl-bar {
    display: flex;
    width: 100%;
    height: 8px;
    border-radius: var(--radius-full);
    overflow: hidden;
    background-color: var(--color-surface-alt-2);
  }
  .pl-seg { display: block; height: 100%; }
  .pl-seg.seg-captured  { background-color: var(--color-primary); }
  .pl-seg.seg-rejected  { background-color: var(--color-error); }
  .pl-seg.seg-in_review { background-color: var(--color-warning); }
  .pl-seg.seg-approved  { background-color: var(--color-success); }
  .pl-count { font-size: var(--text-sm); color: var(--color-light-grey); white-space: nowrap; }

  /* The capture button of "Digitalizaciones en curso". */
  .ip-btn { padding: 8px 14px; font-size: var(--text-sm); background-color: transparent; }
  .ip-btn-capture { border-color: var(--color-primary); color: var(--color-primary); }
  .ip-btn-capture:hover,
  .ip-btn-capture:focus-visible { background-color: var(--color-primary); color: var(--color-light); }
  .ip-btn-mark { border-color: var(--color-success); color: var(--color-success); }
  .ip-btn-mark:hover,
  .ip-btn-mark:focus-visible { background-color: var(--color-success); color: var(--color-bg); }
  .ip-btn-unmark { border-color: var(--color-light-grey); color: var(--color-light-grey); }
  .ip-btn-unmark:hover,
  .ip-btn-unmark:focus-visible { border-color: var(--color-light); color: var(--color-light); }
  .report-title:focus { outline: none; }
  .report-title:focus-visible { outline: 2px solid var(--color-primary-focus); outline-offset: 2px; }

  /* Narrow (the Pi's 800x480 screen with the sidebar open): order number
     beside the text, and progress and button underneath. */
  @container (max-width: 44rem) {
    .q-row { grid-template-columns: 2.5rem minmax(0, 1fr); }
    .q-progress,
    .q-actions { grid-column: 2; }
  }
</style>

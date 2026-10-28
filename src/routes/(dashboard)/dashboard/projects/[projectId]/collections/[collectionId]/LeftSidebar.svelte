<script lang="ts">
  // Left sidebar of the spread view: a strip of three icons, each of which opens
  // or closes a panel. The panel starts closed.
  //
  //   'info'     — per-image details of the current record
  //   'edit'     — rotation and the brightness/contrast/saturation preview sliders
  //   'comments' — annotations (error marks and notes) and the review actions
  //                (NEH-209), all in one panel with no modals so that approving
  //                or rejecting does not send the reviewer's eyes elsewhere on
  //                the screen. Reject and Approve stay visible after a decision
  //                so a mistake can be undone, behind a confirmation popup.
  //
  // Annotations are stored in the backend (`recordsApi.*Annotation*`), scoped to
  // the current record, and reloaded whenever the current record's id changes.
  //
  // Version: 0.2.0

  import type { Record, RecordImage, RecordAnnotation, PredefinedRejectionReason } from '$lib/api';
  import { recordsApi, ApiError } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { formatApiDate } from '$lib/format-date';
  import { formatCount } from '$lib/format-count';
  import { REJECTION_REASONS, rejectionReasonText } from '$lib/rejectionReasons';
  import { REJECTION_COMMENT_MAX_LENGTH, isCommentTooLong, showsCommentCount } from '$lib/rejection-comment';
  import { dismissible } from '$lib/dialog';

  let {
    viewMode,
    currentRecord,
    currentIndex,
    totalRecords,
    userRole = null,
    brightness = $bindable(0),
    contrast = $bindable(0),
    saturation = $bindable(0),
    onRotateLeft,
    onRotateRight,
    onRecordUpdated,
    onRecapture,
  }: {
    viewMode: 'list' | 'spread' | 'grid';
    currentRecord: Record | null;
    currentIndex: number;
    totalRecords: number;
    userRole?: string | null;
    // Preview adjustments, -100 to 100. The parent owns them because the viewer
    // needs them too; the panel only moves them. They do not modify the file —
    // they apply as a CSS filter on the image on screen, as rotation does.
    brightness?: number;
    contrast?: number;
    saturation?: number;
    onRotateLeft: () => void;
    onRotateRight: () => void;
    // May be async (`loadRecords` is). `confirmPendingAction` awaits it so that
    // `currentRecord` reflects the new status before the user can click again;
    // otherwise, for a moment `currentRecord.status` still holds the old status,
    // and a quick click on the opposite button computes the wrong confirmation
    // message.
    onRecordUpdated: () => void | Promise<void>;
    onRecapture: (record: Record) => void;
  } = $props();

  const canReview = $derived(userRole === 'reviewer' || userRole === 'admin');
  // A retake fires the camera, so only admin/operator may start one, as on
  // /live-preview itself (which redirects a reviewer, NEH-66).
  const canOperate = $derived(userRole === 'admin' || userRole === 'operator');

  let activeTab = $state<'info' | 'edit' | 'comments'>('info');

  let isExpanded = $state(false);

  function toggleTab(tab: 'info' | 'edit' | 'comments') {
    if (isExpanded && activeTab === tab) {
      isExpanded = false;
    } else {
      activeTab = tab;
      isExpanded = true;
    }
  }

  let annotations = $state<RecordAnnotation[]>([]);
  let annotationsError = $state<string | null>(null);
  let isSavingAnnotation = $state(false);

  // Error types offered under "Mark error". The ids and colors live in
  // `$lib/rejectionReasons`, with the translated labels and glosses.
  const ERROR_TYPES = $derived(REJECTION_REASONS.map(r => ({ ...r, ...rejectionReasonText($m, r.id) })));

  // The effect below reloads the annotations whenever the active record
  // changes, so one record's annotations are never shown on another. It also
  // clears the "Add note"/"Mark error" state (NEH-209); otherwise a half-written
  // reason or note for one record would carry over to the next.
  // The load below and the saves and deletes made while it is in flight can
  // reach the list in any order: the load can answer after a save committed
  // (the annotation would show twice), before it (it would be lost), or
  // before a delete (it would come back). So the list is merged by id, minus
  // what was deleted meanwhile, and kept in the backend's order, newest
  // first, whatever path each annotation took: firstFlaggedReason reads the
  // oldest from the end.
  function byNewest(a: RecordAnnotation, b: RecordAnnotation): number {
    const t = (b.created_at ?? '').localeCompare(a.created_at ?? '');
    return t !== 0 ? t : b.id - a.id;
  }
  // Annotations deleted, or being deleted, from this panel. Annotation ids
  // are unique across records, so the set is not reset when the record
  // changes: a delete still in flight on a record left and reopened stays
  // out of its reload. A failed delete takes its id back out. Not reactive.
  const deletedIds = new Set<number>();
  function withAnnotation(list: RecordAnnotation[], added: RecordAnnotation): RecordAnnotation[] {
    const rest = list.filter(a => a.id !== added.id);
    return (deletedIds.has(added.id) ? rest : [...rest, added]).sort(byNewest);
  }
  function mergeLoaded(loaded: RecordAnnotation[], local: RecordAnnotation[]): RecordAnnotation[] {
    const merged = [...local.filter(a => !loaded.some(l => l.id === a.id)), ...loaded];
    return merged.filter(a => !deletedIds.has(a.id)).sort(byNewest);
  }

  // Keyed on the id, not the object: after a free or a restore (NEH-248) the
  // page reloads its records in place and passes a new object for the same
  // record, which must not erase a note or reasons the operator has not saved.
  const currentRecordId = $derived(currentRecord?.id ?? null);

  $effect(() => {
    const recordId = currentRecordId;
    annotations = [];
    annotationsError = null;
    noteText = '';
    selectedReasons = [];
    isReasonCardExpanded = false;
    isNoteCardExpanded = false;
    reviewError = null;
    pendingAction = null;
    if (recordId == null) return;

    let cancelled = false;
    recordsApi.getAnnotations(recordId)
      .then(data => { if (!cancelled) annotations = mergeLoaded(data, annotations); })
      .catch(err => {
        if (cancelled) return;
        console.error('[LeftSidebar] Error loading annotations:', err);
        annotationsError = $m.col_annotation_load_error;
      });

    return () => { cancelled = true; };
  });

  // "Mark error" and "Add note" are two independent accordions, each with its
  // own "Done" button, and each creates its OWN annotation (only `error_types`,
  // or only `note`) rather than combining into one — by explicit request, the
  // two stay separate. The formal rejection endpoint accepts a single
  // `predefined_reason`, so "Reject" uses the one from the oldest saved error
  // annotation (see `firstFlaggedReason` below), not the live checkbox
  // selection.
  let noteText = $state('');
  let selectedReasons = $state<PredefinedRejectionReason[]>([]);
  let isReasonCardExpanded = $state(false);
  let isNoteCardExpanded = $state(false);

  // A rejected record accepts no more annotations: "Mark error" and "Add note"
  // stay disabled until the record leaves `rejected` — undoing the rejection
  // and a retake both return it to `in_review`. Only `rejected` locks them.
  let annotationsLocked = $derived(currentRecord?.status === 'rejected');

  // Reject/Approve (NEH-209) stay visible after a decision so a mistaken
  // approval or rejection can be undone. A button is disabled when the record
  // already has that status (no approving or rejecting twice), while the record
  // is still `captured`, and, for Reject, while an `other` rejection lacks its
  // note. Each click asks for confirmation first (`pendingAction`).
  let isRejecting = $state(false);
  let isApproving = $state(false);
  let reviewError = $state<string | null>(null);
  let pendingAction = $state<'approve' | 'reject' | null>(null);
  // Shown when the reviewer tries "Reject" before marking at least one error
  // type, so the reason the rejection cannot go ahead is stated.
  let showNoReasonPopup = $state(false);

  function getErrorLabel(id: string) {
    return ERROR_TYPES.find(e => e.id === id)?.label ?? id;
  }

  function getErrorColor(id: string) {
    return ERROR_TYPES.find(e => e.id === id)?.color ?? '#666';
  }

  function toggleReason(id: PredefinedRejectionReason) {
    selectedReasons = selectedReasons.includes(id)
      ? selectedReasons.filter(r => r !== id)
      : [...selectedReasons, id];
  }

  // The reason sent on rejection: the first error type of the OLDEST saved
  // annotation that has one (not the chips selected right now, which are
  // cleared on every "Done"). `annotations` is sorted newest first (`byNewest`),
  // so the oldest is the last in the array.
  let firstFlaggedReason: PredefinedRejectionReason | null = $derived.by(() => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const reason = annotations[i].error_types[0];
      if (reason) return reason as PredefinedRejectionReason;
    }
    return null;
  });

  // The comment sent with a formal rejection, whatever the reason: the note
  // being typed, or else the newest saved note (`annotations` is newest
  // first). A reviewer who saved the note with "Done" has emptied the
  // textarea, and the note still goes with the rejection. The backend
  // refuses `other` without a comment (422).
  let rejectionComment = $derived(
    noteText.trim() || annotations.find(a => a.note?.trim())?.note?.trim() || undefined
  );

  // A formal rejection for `other` waits for a note; the button stays
  // disabled and a hint says why. Undoing an approval sends no reason.
  let rejectNeedsNote = $derived(
    currentRecord?.status === 'in_review' && firstFlaggedReason === 'other' && !rejectionComment
  );

  // The confirmation message depends on the requested action AND the record's
  // current status: "Reject" on an `approved` record undoes the approval (it is
  // not a formal rejection), and the same in reverse (NEH-209).
  // A `captured` record has not yet been handed over for review: the backend
  // does not allow captured -> approved, and rejection requires `in_review`. So
  // neither action applies, and both buttons stay disabled.
  let notReviewable = $derived(currentRecord?.status === 'captured');

  let pendingActionMessage = $derived.by(() => {
    if (!pendingAction || !currentRecord) return '';
    if (pendingAction === 'approve') {
      return currentRecord.status === 'rejected'
        ? $m.col_review_confirm_undo_reject
        : $m.col_review_confirm_approve;
    }
    return currentRecord.status === 'approved'
      ? $m.col_review_confirm_undo_approve
      : $m.col_review_confirm_reject;
  });

  // "Done" under "Mark error": saves the marked error types as their own
  // annotation (no note) and collapses the card.
  async function handleSaveErrors() {
    if (selectedReasons.length === 0 || !currentRecord || isSavingAnnotation) return;
    const recordId = currentRecord.id;
    isSavingAnnotation = true;
    annotationsError = null;
    try {
      const created = await recordsApi.addAnnotation(recordId, {
        error_types: selectedReasons,
        note: undefined,
      });
      // If the active record changed while the request was in flight, the load
      // effect has already replaced `annotations` with the new record's; adding
      // it here would show an annotation from the previous record.
      if (currentRecord?.id === recordId) {
        annotations = withAnnotation(annotations, created);
      }
      selectedReasons = [];
      isReasonCardExpanded = false;
    } catch (err) {
      console.error('[LeftSidebar] Error saving the error reason:', err);
      annotationsError = $m.col_annotation_save_error;
    } finally {
      isSavingAnnotation = false;
    }
  }

  // "Done" under "Add note": saves the note as its own annotation (no error
  // types) and collapses the card.
  async function handleSaveComment() {
    const note = noteText.trim();
    if (!note || !currentRecord || isSavingAnnotation) return;
    const recordId = currentRecord.id;
    isSavingAnnotation = true;
    annotationsError = null;
    try {
      const created = await recordsApi.addAnnotation(recordId, {
        error_types: [],
        note,
      });
      if (currentRecord?.id === recordId) {
        annotations = withAnnotation(annotations, created);
      }
      noteText = '';
      isNoteCardExpanded = false;
    } catch (err) {
      console.error('[LeftSidebar] Error saving the note:', err);
      annotationsError = $m.col_annotation_save_error;
    } finally {
      isSavingAnnotation = false;
    }
  }

  // Asks for confirmation before rejecting (or undoing an approval). A formal
  // rejection (from `in_review`) requires at least one saved error annotation;
  // without one, a popup says so instead of the confirmation (undoing an
  // approval does not need one).
  function requestReject() {
    if (!currentRecord || notReviewable || currentRecord.status === 'rejected' || isRejecting || rejectNeedsNote) return;
    if (currentRecord.status === 'in_review' && firstFlaggedReason === null) {
      showNoReasonPopup = true;
      return;
    }
    pendingAction = 'reject';
  }

  function closeNoReasonPopup() {
    showNoReasonPopup = false;
  }

  // Asks for confirmation before approving (or undoing a rejection).
  function requestApprove() {
    if (!currentRecord || notReviewable || currentRecord.status === 'approved' || isApproving) return;
    pendingAction = 'approve';
  }

  function cancelPendingAction() {
    pendingAction = null;
  }

  // Runs the action confirmed in the popup. If the record already has the
  // "opposite" status (approved when rejecting, rejected when approving), the
  // action is an undo: the record returns to `in_review` with no reason and no
  // rejection audit, instead of the formal action (NEH-209).
  async function confirmPendingAction() {
    if (!currentRecord || !pendingAction) return;
    const recordId = currentRecord.id;
    const status = currentRecord.status;
    reviewError = null;

    if (pendingAction === 'approve') {
      isApproving = true;
      try {
        await recordsApi.updateStatus(recordId, status === 'rejected' ? 'in_review' : 'approved');
        // Await the refresh (it may be async) before clearing `isApproving`;
        // otherwise, for a moment `currentRecord.status` still holds the old
        // status while the buttons are enabled again, and a quick click on the
        // opposite button would compute the wrong confirmation message (or
        // action).
        await onRecordUpdated();
      } catch (err) {
        console.error('[LeftSidebar] Error approving the record:', err);
        reviewError = $m.col_review_approve_error;
      } finally {
        isApproving = false;
      }
    } else {
      isRejecting = true;
      try {
        if (status === 'approved') {
          await recordsApi.updateStatus(recordId, 'in_review');
        } else {
          await recordsApi.reject(recordId, {
            predefined_reason: firstFlaggedReason!,
            comment: rejectionComment,
          });
          // A rejected record accepts no more annotations, so collapse any card
          // left open. `annotationsLocked` already disables the "Mark
          // error"/"Add note" buttons; this also discards anything unsaved.
          isReasonCardExpanded = false;
          isNoteCardExpanded = false;
          selectedReasons = [];
          noteText = '';
        }
        await onRecordUpdated();
      } catch (err) {
        console.error('[LeftSidebar] Error rejecting the record:', err);
        // The backend answers 422 to a comment over 2,000 characters, and to
        // `other` without a comment; its own message is not the interface's.
        reviewError = isCommentTooLong(err)
          ? $m.col_reject_comment_too_long(REJECTION_COMMENT_MAX_LENGTH)
          : err instanceof ApiError && err.status === 422 && firstFlaggedReason === 'other'
            ? $m.col_reject_other_note_error
            : $m.col_reject_error;
      } finally {
        isRejecting = false;
      }
    }
    pendingAction = null;
  }

  async function handleDeleteAnnotation(id: number) {
    if (annotationsLocked) return;
    const recordId = currentRecord?.id ?? null;
    const removed = annotations.find(a => a.id === id);
    deletedIds.add(id);
    annotations = annotations.filter(a => a.id !== id);
    try {
      await recordsApi.deleteAnnotation(id);
      // A load that answered while the delete was in flight may have put it
      // back.
      annotations = annotations.filter(a => a.id !== id);
    } catch (err) {
      console.error('[LeftSidebar] Error deleting annotation:', err);
      deletedIds.delete(id);
      // Restore only if the same record is still active: if it changed, the
      // load effect has already loaded the new record's list, and restoring
      // here would overwrite it with the previous record's data. Only the
      // annotation that could not be deleted goes back, not the earlier list,
      // so anything saved meanwhile is kept.
      if (currentRecord?.id === recordId) {
        if (removed) annotations = withAnnotation(annotations, removed);
        annotationsError = $m.col_annotation_delete_error;
      }
    }
  }

  function formatTime(dateStr?: string): string {
    if (!dateStr) return '';
    return formatApiDate(dateStr, $locale, { hour: '2-digit', minute: '2-digit' });
  }

  function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  function formatDateTime(dateStr: string): string {
    return formatApiDate(dateStr, $locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  let sortedImages = $derived(
    [...(currentRecord?.images ?? [])].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    })
  );

  function roleLabel(img: RecordImage): string {
    if (img.role === 'left')  return 'L';
    if (img.role === 'right') return 'R';
    return '·';
  }

  function roleName(img: RecordImage, i: number): string {
    if (img.role === 'left')  return $m.col_role_left;
    if (img.role === 'right') return $m.col_role_right;
    if (img.role === 'overview') return $m.col_role_overview;
    return $m.col_image_n(i + 1);
  }
</script>

<!-- Closed: the 60px strip only. Open: strip plus panel, 320px in all. -->
<div class="sidebar" class:expanded={isExpanded}>

  <div class="icon-strip">
    <!-- Info -->
    <button
      class="strip-btn"
      class:active={activeTab === 'info' && isExpanded}
      onclick={() => toggleTab('info')}
      aria-label={$m.col_tab_info}
      title={$m.col_tab_info}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </button>

    <button
      class="strip-btn"
      class:active={activeTab === 'edit' && isExpanded}
      onclick={() => toggleTab('edit')}
      aria-label={$m.col_tab_edit}
      title={$m.col_tab_edit}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>

    <button
      class="strip-btn"
      class:active={activeTab === 'comments' && isExpanded}
      onclick={() => toggleTab('comments')}
      aria-label={$m.col_tab_comments}
      title={$m.col_tab_comments}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  </div>

  {#if isExpanded}
    <div class="panel-content">

      {#if activeTab === 'info'}
        <div class="panel-section">
          <h3 class="panel-title">{$m.col_tab_info}</h3>

            {#if currentRecord}

              <div class="record-overview">
                <span class="overview-name">{currentRecord.title || '—'}</span>
                <span class="overview-pos">{formatCount(currentIndex, $locale)} / {formatCount(totalRecords, $locale)}</span>
              </div>

              {#if sortedImages.length === 0}
                <p class="empty-text">{$m.col_no_images}</p>

              {:else}
                {#each sortedImages as img, i}
                  <div class="img-section" class:first={i === 0}>

                    <div class="img-section-header">
                      <span class="role-pill" class:role-right={img.role === 'right'} class:role-single={img.role !== 'left' && img.role !== 'right'}>
                        {roleLabel(img)}
                      </span>
                      <span class="img-section-title">{roleName(img, i)}</span>
                    </div>

                    <div class="info-rows">

                      {#if img.format}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_format}</span>
                          <span class="info-value">{img.format.toUpperCase()}</span>
                        </div>
                      {/if}

                      {#if img.resolution_width && img.resolution_height}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_dimensions}</span>
                          <span class="info-value">{img.resolution_width} × {img.resolution_height}</span>
                        </div>
                      {/if}

                      {#if img.file_size}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_size}</span>
                          <span class="info-value">{formatFileSize(img.file_size)}</span>
                        </div>
                      {/if}

                      {#if img.sequence != null}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_sequence}</span>
                          <span class="info-value">{img.sequence}</span>
                        </div>
                      {/if}

                      {#if img.filename}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_file}</span>
                          <span class="info-value filename-val" title={img.filename}>{img.filename}</span>
                        </div>
                      {/if}

                      {#if img.created_at}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_captured}</span>
                          <span class="info-value">{formatDateTime(img.created_at)}</span>
                        </div>
                      {/if}

                    </div>
                  </div>
                {/each}
              {/if}

            {:else}
              <p class="empty-text">{$m.col_select_record}</p>
            {/if}
          </div>

        {:else if activeTab === 'edit'}
          <div class="panel-section">
            <div class="preview-card">
              <h3 class="panel-title">{$m.col_tab_edit}</h3>

            <div class="control-group">
              <label class="control-label">{$m.col_rotate}</label>
              <div class="rotate-row">
                <button class="rotate-btn" onclick={onRotateLeft}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"/>
                  </svg>
                  <span>{$m.col_rotate_left}</span>
                </button>
                <button class="rotate-btn" onclick={onRotateRight}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                  </svg>
                  <span>{$m.col_rotate_right}</span>
                </button>
              </div>
            </div>

            <!-- Brightness -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  <span>{$m.col_brightness}</span>
                </div>
                <button
                  class="slider-val"
                  class:is-set={brightness !== 0}
                  disabled={brightness === 0}
                  onclick={() => (brightness = 0)}
                  title={$m.col_slider_reset}
                  aria-label={$m.col_slider_reset}
                >{brightness > 0 ? `+${brightness}` : brightness}</button>
              </div>
              <!-- The track gradient fills up to the current value -->
              <input type="range" min="-100" max="100" bind:value={brightness}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((brightness+100)/200)*100}%, var(--color-surface) {((brightness+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

            <!-- Contrast -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z"/>
                  </svg>
                  <span>{$m.col_contrast}</span>
                </div>
                <button
                  class="slider-val"
                  class:is-set={contrast !== 0}
                  disabled={contrast === 0}
                  onclick={() => (contrast = 0)}
                  title={$m.col_slider_reset}
                  aria-label={$m.col_slider_reset}
                >{contrast > 0 ? `+${contrast}` : contrast}</button>
              </div>
              <input type="range" min="-100" max="100" bind:value={contrast}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((contrast+100)/200)*100}%, var(--color-surface) {((contrast+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

            <!-- Saturation -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                  <span>{$m.col_saturation}</span>
                </div>
                <button
                  class="slider-val"
                  class:is-set={saturation !== 0}
                  disabled={saturation === 0}
                  onclick={() => (saturation = 0)}
                  title={$m.col_slider_reset}
                  aria-label={$m.col_slider_reset}
                >{saturation > 0 ? `+${saturation}` : saturation}</button>
              </div>
              <input type="range" min="-100" max="100" bind:value={saturation}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((saturation+100)/200)*100}%, var(--color-surface) {((saturation+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

          </div>
        </div>

      {:else if activeTab === 'comments'}
        <div class="panel-section">
          <div class="preview-card">

            <div class="annotations-header">
              <div class="annotations-title-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <h3 class="panel-title" style="margin:0">{$m.col_tab_comments}</h3>
              </div>
              <span class="annotation-count">{formatCount(annotations.length, $locale)}</span>
            </div>

            {#if annotationsError}
              <p class="annotations-error">{annotationsError}</p>
            {/if}

            <div class="annotations-list">
              {#if annotations.length === 0}
                <p class="empty-text">{$m.col_no_annotations}</p>
              {:else}
                {#each annotations as ann}
                  <div class="annotation-card">
                    <div class="annotation-body">
                      {#if ann.error_types.length > 0}
                        <div class="error-tags">
                          {#each ann.error_types as errorId}
                            <div class="error-tag">
                              <div class="error-dot" style="background-color: {getErrorColor(errorId)}"></div>
                              <span>{getErrorLabel(errorId)}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      {#if ann.note}
                        <p class="annotation-text">{ann.note}</p>
                      {/if}
                    </div>
                    <div class="annotation-footer">
                      <span class="annotation-time">{formatTime(ann.created_at)}</span>
                      <!-- Delete button (shown on hover). A rejected record
                           allows no changes to its annotations, deletion
                           included. -->
                      {#if !annotationsLocked}
                        <button class="delete-annotation-btn" onclick={() => handleDeleteAnnotation(ann.id)} aria-label={$m.col_delete_annotation}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            {#if canReview}
              <div class="review-section">
                <button
                  type="button"
                  class="annotation-toggle"
                  disabled={annotationsLocked}
                  onclick={() => isReasonCardExpanded = !isReasonCardExpanded}
                  aria-expanded={isReasonCardExpanded}
                >
                  <span class="material-symbols-outlined icon-sm">warning</span>
                  <span>{$m.col_mark_error_btn}</span>
                </button>

                {#if isReasonCardExpanded}
                  <div class="expandable-card">
                    <div class="reason-options">
                      {#each ERROR_TYPES as errType}
                        <button
                          type="button"
                          class="error-type-btn"
                          class:selected={selectedReasons.includes(errType.id)}
                          aria-label={errType.label}
                          aria-describedby="et-gloss-{errType.id}"
                          onclick={() => toggleReason(errType.id)}
                        >
                          <div class="et-dot" style="background-color: {errType.color}"></div>
                          <span class="et-text">
                            <span>{errType.label}</span>
                            <span id="et-gloss-{errType.id}" class="et-gloss text-xs text-muted">{errType.gloss}</span>
                          </span>
                          {#if selectedReasons.includes(errType.id)}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2.5" class="et-check"><polyline points="20 6 9 17 4 12"/></svg>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <button
                      class="modal-btn confirm reason-done-btn"
                      disabled={selectedReasons.length === 0 || !currentRecord || isSavingAnnotation}
                      onclick={handleSaveErrors}
                    >
                      {$m.col_reason_done}
                    </button>
                  </div>
                {/if}
              </div>

              <div class="review-section review-section--tight">
                <button
                  type="button"
                  class="annotation-toggle"
                  disabled={annotationsLocked}
                  onclick={() => isNoteCardExpanded = !isNoteCardExpanded}
                  aria-expanded={isNoteCardExpanded}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>{$m.col_add_note}</span>
                </button>

                {#if isNoteCardExpanded}
                  <div class="expandable-card">
                    <textarea
                      class="note-textarea"
                      bind:value={noteText}
                      maxlength={REJECTION_COMMENT_MAX_LENGTH}
                      placeholder={firstFlaggedReason === 'other'
                        ? $m.col_annotation_note_required_placeholder
                        : $m.col_annotation_comment_placeholder}
                      disabled={!currentRecord}
                    ></textarea>
                    {#if showsCommentCount(noteText.length)}
                      <p class="note-count" aria-live="polite">
                        {$m.col_annotation_note_count(noteText.length, REJECTION_COMMENT_MAX_LENGTH)}
                      </p>
                    {/if}
                    <button
                      class="modal-btn confirm reason-done-btn"
                      disabled={!noteText.trim() || !currentRecord || isSavingAnnotation}
                      onclick={handleSaveComment}
                    >
                      {$m.col_reason_done}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Reject / Approve / Retake (NEH-209). A reviewer or admin sees
                 Approve and either Reject or, on a rejected record for an
                 admin, Retake; the button matching the current status is
                 disabled and the other stays enabled to undo a mistake. An
                 operator sees only "Recapture image", on a rejected record — an
                 operator does not approve or reject, but may capture again.
                 Each Reject/Approve click asks for confirmation
                 (`pendingAction`) first. -->
            {#if canReview || (canOperate && currentRecord?.status === 'rejected')}
              <div class="review-section">
                {#if reviewError}
                  <p class="annotations-error">{reviewError}</p>
                {/if}

                <!-- Why both buttons are disabled on a captured record: the
                     operator has not yet handed it over for review (NEH-260).
                     The touch screen has no tooltip. -->
                {#if canReview && notReviewable}
                  <p class="review-hint">{$m.col_review_not_sent_hint}</p>
                {/if}
                {#if canReview && rejectNeedsNote}
                  <p class="review-hint">{$m.col_reject_other_needs_note}</p>
                {/if}

                <div class="review-actions">
                  {#if currentRecord?.status === 'rejected' && canOperate}
                    <button
                      class="btn-review recapture"
                      onclick={() => onRecapture(currentRecord!)}
                    >
                      <span class="material-symbols-outlined icon-sm">photo_camera</span>
                      {$m.col_recapture_btn}
                    </button>
                  {:else if canReview}
                    <button
                      class="btn-review reject"
                      disabled={!currentRecord || notReviewable || currentRecord.status === 'rejected' || isRejecting || rejectNeedsNote}
                      onclick={requestReject}
                    >
                      <span class="material-symbols-outlined icon-sm">cancel</span>
                      {$m.col_reject}
                    </button>
                  {/if}
                  {#if canReview}
                    <button
                      class="btn-review approve"
                      data-tour="aprobar"
                      disabled={!currentRecord || notReviewable || currentRecord.status === 'approved' || isApproving}
                      onclick={requestApprove}
                    >
                      <span class="material-symbols-outlined icon-sm">check_circle</span>
                      {$m.col_approve}
                    </button>
                  {/if}
                </div>
              </div>
            {/if}

          </div>
        </div>
      {/if}

    </div>
  {/if}

</div>

<!-- Confirmation popup for Approve/Reject, undo included (NEH-209) -->
{#if pendingAction}
  <div class="confirm-backdrop" use:dismissible={{ onDismiss: cancelPendingAction }}>
    <div class="confirm-card dialog-fit" role="dialog" aria-modal="true">
      <p class="confirm-message">{pendingActionMessage}</p>
      <div class="confirm-actions">
        <button class="modal-btn cancel" onclick={cancelPendingAction}>{$m.common_cancel}</button>
        <button class="modal-btn confirm" onclick={confirmPendingAction}>{$m.common_confirm}</button>
      </div>
    </div>
  </div>
{/if}

<!-- Popup: rejecting needs a saved error reason first -->
{#if showNoReasonPopup}
  <div class="confirm-backdrop" use:dismissible={{ onDismiss: closeNoReasonPopup }}>
    <div class="confirm-card dialog-fit" role="dialog" aria-modal="true">
      <p class="confirm-message">{$m.col_reject_needs_reason}</p>
      <div class="confirm-actions">
        <button class="modal-btn confirm" onclick={closeNoReasonPopup}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    display: flex;
    background-color: var(--color-surface-alt);
    border-right: 1px solid var(--border-color);
    height: 100%;
    flex-shrink: 0;
    z-index: 10;
    width: 60px;
    transition: width var(--transition-base);
  }

  .sidebar.expanded { width: 320px; }

  .icon-strip {
    width: 60px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;
    gap: 12px;
    border-right: 1px solid var(--border-color);
    background-color: var(--color-surface);
  }

  .strip-btn {
    width: 40px; height: 40px;
    border-radius: var(--radius-md);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-light-grey);
    background: none;
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .strip-btn:hover { color: var(--color-light-grey); background-color: rgba(255,255,255,0.04); }

  .strip-btn.active {
    background-color: rgba(90,140,98,0.2);
    color: var(--color-primary);
    border: 1.5px solid var(--color-primary);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .panel-content::-webkit-scrollbar { width: 3px; }
  .panel-content::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .panel-section { padding: 20px 16px; }

  .panel-title {
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 16px;
  }

  /* Info rows */
  .info-rows { display: flex; flex-direction: column; }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 7px 0;
    border-bottom: 1px solid var(--border-color);
    gap: 8px;
  }

  .info-label { font-size: 12px; color: var(--color-light-grey); flex-shrink: 0; }
  .info-value { font-size: 12px; color: var(--color-light); font-weight: var(--fw-medium); text-align: right; }

  .filename-val {
    word-break: break-all;
    white-space: normal;
    font-size: 11px;
    max-width: 140px;
  }

  /* Record overview */
  .record-overview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color);
    gap: 8px;
  }

  .overview-name {
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .overview-pos {
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    flex-shrink: 0;
  }

  /* Per-image section */
  .img-section {
    margin-bottom: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
  }

  .img-section.first { border-top: none; padding-top: 0; }

  .img-section-header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }

  .img-section-title {
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
  }

  .role-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: var(--fw-bold);
    flex-shrink: 0;
    background: rgba(90, 140, 98, 0.2);
    color: var(--color-primary);
    border: 1px solid rgba(90, 140, 98, 0.35);
  }

  .role-pill.role-right {
    background: rgba(192, 132, 252, 0.15);
    color: #c084fc;
    border-color: rgba(192, 132, 252, 0.3);
  }

  .role-pill.role-single {
    background: rgba(147, 197, 253, 0.15);
    color: #93c5fd;
    border-color: rgba(147, 197, 253, 0.3);
  }

  /* Preview card (edit + comments) */
  .preview-card {
    background-color: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  .control-group { margin-bottom: 20px; }

  .control-label {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    display: block;
    margin-bottom: 10px;
  }

  .rotate-row { display: flex; gap: 8px; }

  .rotate-btn {
    flex: 1;
    height: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--font-family);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
  }

  .rotate-btn:hover { background-color: rgba(90,140,98,0.12); border-color: var(--color-primary); color: var(--color-primary); }

  /* Sliders */
  .slider-group { margin-bottom: 16px; }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .slider-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-light-grey);
  }

  /* The number is the slider's reset button: tapping it returns the slider to
     zero. It is not a separate button because there are three sliders, the
     panel is narrow, and on the touch screen each separate button would cost
     44px of height. While the slider is at zero there is nothing to reset and
     the number is inert. */
  .slider-val {
    min-width: 44px;
    min-height: 32px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    font-family: monospace;
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    text-align: right;
    cursor: default;
    transition: all var(--transition-fast);
  }
  .slider-val.is-set {
    cursor: pointer;
    color: var(--color-light);
    border-color: var(--border-color);
  }
  .slider-val.is-set:hover,
  .slider-val.is-set:focus-visible {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .slider-group input[type="range"] {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    outline: none;
  }

  .slider-group input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: white;
    border: 2px solid rgba(0,0,0,0.15);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: grab;
  }

  .annotations-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .annotations-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-light);
  }

  .annotation-count {
    font-size: 13px;
    color: var(--color-light-grey);
  }

  .annotations-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow-y: auto;
    margin-bottom: 12px;
  }

  .annotations-list::-webkit-scrollbar { width: 3px; }
  .annotations-list::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .annotation-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    transition: border-color var(--transition-fast);
  }

  .annotation-card:hover { border-color: rgba(90,140,98,0.5); }

  .annotation-body { margin-bottom: 6px; }

  .error-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }

  .error-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background-color: rgba(0,0,0,0.3);
    border-radius: 4px;
    font-size: 11px;
    color: var(--color-light-grey);
  }

  .error-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .annotation-text { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.5; margin: 0; }

  .annotation-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .annotation-time { font-size: 11px; color: var(--color-light-grey); opacity: 0.6; }

  .delete-annotation-btn {
    background: none; border: none;
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
  }

  .annotation-card:hover .delete-annotation-btn { opacity: 1; }
  .delete-annotation-btn:hover { color: var(--color-error); background-color: rgba(214,103,74,0.1); }

  /* Inline sections of the review panel (NEH-209): mark error, add note,
     reject/approve — no modals. */
  .review-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  /* No divider between "Mark error" and "Add note": they are sibling
     accordions, not separate sections of the panel. */
  .review-section--tight {
    margin-top: 8px;
    padding-top: 0;
    border-top: none;
  }

  .annotations-error {
    font-size: var(--text-xs);
    color: var(--color-error);
    background-color: rgba(214,103,74,0.1);
    border: 1px solid rgba(214,103,74,0.3);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    margin: 0 0 12px;
  }

  .empty-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    opacity: 0.5;
    text-align: center;
    padding: 16px 0;
    margin: 0;
  }

  /* "Mark error" / "Add note": two independent accordions, each a neutral
     button (icon + label) that takes a single row when collapsed and expands
     inline into its own card with "Done". */
  .annotation-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
  }
  .annotation-toggle:hover { border-color: rgba(90,140,98,0.5); }
  .annotation-toggle:disabled { opacity: 0.5; cursor: not-allowed; }

  .expandable-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }

  .reason-options { display: flex; flex-direction: column; gap: 6px; }

  .error-type-btn {
    width: 100%;
    padding: 8px 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    min-height: var(--touch-target-min);
  }

  .error-type-btn:hover { border-color: rgba(90,140,98,0.5); }
  .error-type-btn.selected { background-color: rgba(255,255,255,0.06); border-color: var(--color-primary); color: var(--color-light); }

  .et-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .et-check { margin-left: auto; flex-shrink: 0; }
  .et-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .et-gloss { font-weight: var(--fw-regular); }

  .reason-done-btn { width: 100%; }

  .note-textarea {
    width: 100%;
    height: 120px;
    padding: 10px 12px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    resize: none;
    outline: none;
    transition: border-color var(--transition-base);
  }

  .note-textarea::placeholder { color: var(--color-light-grey); opacity: 0.5; }
  .note-textarea:focus { border-color: var(--color-primary); }
  /* Shown as the note nears the 2,000 characters Fisqua keeps. */
  .note-count { margin: 4px 0 0; font-size: var(--text-sm); color: var(--color-light-grey); text-align: right; }
  .note-textarea:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Reject / Approve (NEH-209): stacked, not side by side. */
  .review-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }

  .review-hint {
    margin: 0 0 8px;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-light-grey);
  }

  .btn-review {
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
    min-height: var(--touch-target-min);
  }

  .btn-review.reject { background-color: var(--color-surface); color: var(--color-error); border-color: rgba(214,103,74,0.4); }
  .btn-review.reject:hover { background-color: rgba(214,103,74,0.12); }
  .btn-review.approve { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .btn-review.approve:hover { background-color: var(--color-primary-hover); }
  .btn-review.recapture { background-color: var(--color-highlight); color: var(--color-bg); border-color: var(--color-highlight); }
  .btn-review.recapture:hover { opacity: 0.9; }
  .btn-review:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Confirmation popup (NEH-209), for approving/rejecting and for undoing an
     earlier approval or rejection. */
  .confirm-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .confirm-card {
    background-color: var(--color-surface-alt);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 24px;
    width: 100%;
    max-width: 400px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .confirm-message { font-size: var(--text-base); color: var(--color-light); margin: 0; line-height: 1.5; }

  .confirm-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
    min-height: var(--touch-target-min);
  }

  .modal-btn.cancel { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover { color: var(--color-light); border-color: rgba(90,140,98,0.5); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
  .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

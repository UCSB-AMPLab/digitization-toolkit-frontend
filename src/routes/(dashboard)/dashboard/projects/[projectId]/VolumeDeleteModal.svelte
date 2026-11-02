<script lang="ts">
  // The delete dialog of a volume, for the project page and Volúmenes
  // (NEH-313), as the project page had it: it counts the volume's records
  // when it opens; a volume with records needs a target among `moveTargets`
  // (its project's other volumes), and its records are moved there first; a
  // volume that reserves its stem cannot be deleted, and the dialog says why;
  // sub-volumes block the delete. The backend's English goes to the console
  // only. `onChanged` reloads the page's list; `onClose` closes the dialog.
  //
  // Version: 0.3.3
  import { onMount, untrack } from 'svelte';
  import { m } from '$lib/i18n';
  import { collectionsApi, recordsApi, type Collection } from '$lib/api';
  import { deleteRefused, stemConflict } from '$lib/volume-stem';
  import { isNotEmptyRefusal, notEmptyCounts, volumeDeleteErrorText } from '$lib/volume-errors';
  import { dismissible } from '$lib/dialog';

  let {
    volume,
    moveTargets,
    onClose,
    onChanged,
  }: {
    volume: Collection;
    moveTargets: Collection[];
    onClose: () => void;
    onChanged: () => void | Promise<void>;
  } = $props();

  let deletingCol            = $state<Collection>(untrack(() => volume));
  let deleteColRecordCount   = $state(0);
  let deleteMoveColTarget    = $state<number | ''>('');
  let isDeletingCol          = $state(false);
  let deleteColError         = $state('');
  let isLoadingDeleteColInfo = $state(true);
  // Set when the backend refused the delete because the volume still holds
  // sub-volumes. This dialog cannot move those, so it offers no target, the
  // delete stays disabled, and records are never moved.
  let deleteBlockedBySubvolumes = $state(false);

  onMount(async () => {
    try {
      deleteColRecordCount = await recordsApi.count({ collection_id: deletingCol.id });
    } catch (err) {
      console.error('[VolumeDelete] Error fetching collection info:', err);
    } finally {
      isLoadingDeleteColInfo = false;
    }
  });

  async function executeDeleteCol() {
    if (deleteRefused(deletingCol) || deleteBlockedBySubvolumes) return;
    isDeletingCol = true;
    deleteColError = '';
    try {
      if (deleteMoveColTarget !== '') {
        // The list may be older than the volume's last capture. Moving the
        // records out of a volume the backend then refuses to delete would
        // leave them moved and the volume still there, so the volume is read
        // again first and the move is skipped once it reserves its stem.
        const fresh = await collectionsApi.get(deletingCol.id);
        if (deleteRefused(fresh)) {
          deletingCol = fresh;
          isDeletingCol = false;
          await onChanged();
          return;
        }
        await collectionsApi.moveRecords(deletingCol.id, Number(deleteMoveColTarget));
      }
      await collectionsApi.delete(deletingCol.id);
      await onChanged();
      onClose();
    } catch (err) {
      const conflict = stemConflict(err);
      if (conflict === 'stem_reserved') {
        // The backend refused: the modal switches to the reserved notice,
        // which says why, and the delete stays disabled.
        deletingCol = { ...deletingCol, stem_reserved: true };
        await onChanged();
      } else if (isNotEmptyRefusal(err)) {
        console.error('[VolumeDelete] Error deleting volume:', err);
        const counts = notEmptyCounts(err);
        if (counts && counts.subVolumes > 0) {
          // Sub-volumes block the delete, with or without records: moving
          // the records would not be enough, so no target is offered.
          deleteBlockedBySubvolumes = true;
          deleteMoveColTarget = '';
          deleteColError = $m.pd_err_delete_has_subvolumes;
        } else if (deleteMoveColTarget === '') {
          // The modal opened believing the volume was empty, and it is not.
          // The count is read again so the target select appears here.
          try {
            deleteColRecordCount = await recordsApi.count({ collection_id: deletingCol.id });
          } catch (countErr) {
            console.error('[VolumeDelete] Error fetching collection info:', countErr);
          }
          if (deleteColRecordCount === 0) {
            // The count could not be read, or the records left meanwhile.
            deleteColError = volumeDeleteErrorText(err, $m);
          }
        } else {
          deleteColError = volumeDeleteErrorText(err, $m);
        }
      } else {
        // The backend's English text goes to the console only.
        deleteColError = volumeDeleteErrorText(err, $m);
        console.error('[VolumeDelete] Error deleting volume:', err);
      }
      isDeletingCol = false;
    }
  }
</script>

<div class="modal-backdrop" use:dismissible={{ onDismiss: onClose, escape: !isDeletingCol, backdrop: !isDeletingCol }}>
  <div class="modal-card delete-modal-card dialog-fit" role="dialog" aria-modal="true">

    <div class="modal-header">
      <div>
        <h3 class="modal-title">{$m.pd_delete_collection_title}</h3>
        <p class="modal-subtitle">{deletingCol.name}</p>
      </div>
      <button class="modal-close" onclick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    {#if deleteRefused(deletingCol)}
      <!-- The backend refuses this delete (409); nothing is moved first. -->
      <div class="delete-warning" role="note">
        <div class="delete-warning-icon">
          <span class="material-symbols-outlined icon-md">lock</span>
        </div>
        <p class="delete-warning-body">{$m.pd_delete_stem_reserved}</p>
      </div>
    {:else if deleteBlockedBySubvolumes}
      <!-- No target select: the error below says why the delete is refused. -->
    {:else if isLoadingDeleteColInfo}
      <div class="delete-loading">
        <div class="spinner"></div>
        {$m.pd_delete_loading}
      </div>
    {:else if deleteColRecordCount > 0}
      <div class="delete-warning">
        <div class="delete-warning-icon">
          <span class="material-symbols-outlined icon-md">warning</span>
        </div>
        <div>
          <p class="delete-warning-title">{$m.pd_col_not_empty}</p>
          <p class="delete-warning-body">
            {$m.proj_contains_pre}<strong>{$m.pd_records_count(deleteColRecordCount)}</strong>.
            {$m.pd_delete_warning}
          </p>
        </div>
      </div>

      <div class="delete-move-section">
        <!-- The backend refuses to delete a volume that still has records,
             so a target is required and the empty option is a placeholder. -->
        <label class="field-label" for="delete-move-target">{$m.pd_move_label}</label>
        <select id="delete-move-target" class="field-input" bind:value={deleteMoveColTarget} required aria-required="true">
          <option value="" disabled>{$m.pd_move_none}</option>
          {#each moveTargets.filter(c => c.id !== deletingCol.id) as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
        {#if deleteMoveColTarget === ''}
          <p class="delete-move-hint">{$m.pd_move_hint_none}</p>
        {:else}
          <p class="delete-move-hint">{$m.pd_move_hint_selected}</p>
        {/if}
      </div>
    {:else}
      <p class="delete-confirm-text">
        {$m.pd_delete_confirm_pre}<strong>"{deletingCol.name}"</strong>? {$m.common_irreversible}
      </p>
    {/if}

    {#if deleteColError}
      <div class="create-error">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        {deleteColError}
      </div>
    {/if}

    <div class="modal-actions">
      <button class="btn-ghost" onclick={onClose} disabled={isDeletingCol}>{$m.common_cancel}</button>
      <button
        class="btn-danger"
        onclick={executeDeleteCol}
        disabled={isDeletingCol || isLoadingDeleteColInfo || deleteRefused(deletingCol)
          || deleteBlockedBySubvolumes
          || (deleteColRecordCount > 0 && deleteMoveColTarget === '')}
      >
        <span class="material-symbols-outlined icon-sm">delete</span>
        {isDeletingCol ? $m.common_deleting : (deleteMoveColTarget !== '' ? $m.proj_move_and_delete : $m.pd_delete_collection_title)}
      </button>
    </div>

  </div>
</div>

<style>
  /* As the project page drew it. */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 24px;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .modal-title  { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 4px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-secondary); margin: 0; }

  .modal-close {
    width: 28px; height: 28px;
    background: none; border: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .modal-close:hover { background-color: var(--color-surface); color: var(--color-light); }

  .field-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .field-input {
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 12px;
    outline: none;
    transition: border-color var(--transition-base);
    width: 100%;
  }

  .field-input { min-height: var(--touch-target-min); }
  .field-input:focus { border-color: var(--color-primary); }

  .create-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background-color: var(--color-error-bg);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-error);
    line-height: 1.4;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 7px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 14px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
    white-space: nowrap;
  }

  .btn-ghost:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  .spinner {
    width: 30px; height: 30px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Delete collection modal ─────────────────────────────── */
  .delete-modal-card { max-width: 460px; }

  .delete-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    color: var(--color-light-grey);
    font-size: var(--text-sm);
  }

  .delete-warning {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    background: rgba(220, 80, 60, 0.08);
    border: 1px solid rgba(220, 80, 60, 0.25);
    border-radius: var(--radius-md);
    padding: 14px 16px;
  }

  .delete-warning-icon {
    color: var(--color-error);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding-top: 1px;
  }

  .delete-warning-title {
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-error);
    margin: 0 0 4px;
  }

  .delete-warning-body {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.5;
  }

  .delete-move-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .delete-move-hint {
    font-size: 12px;
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.4;
  }

  .delete-confirm-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.5;
  }

  .btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background-color: var(--color-error);
    color: white;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    border: none;
    border-radius: var(--radius-md);
    padding: 9px 18px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    transition: filter var(--transition-base);
  }

  .btn-danger:hover:not(:disabled) { filter: brightness(1.15); }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

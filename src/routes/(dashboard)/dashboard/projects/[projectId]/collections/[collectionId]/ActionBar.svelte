<script lang="ts">
  import type { Record } from '$lib/api';
  import { m } from '$lib/i18n';

  type RecordStatus = Record['status'];
  type UserRole = 'admin' | 'operator' | 'reviewer';

  interface Props {
    selectedCount: number;
    userRole: UserRole | null;
    onBulkStatusChange: (status: RecordStatus, rejectionNote?: string) => void;
    onDeselect: () => void;
  }

  let { selectedCount, userRole, onBulkStatusChange, onDeselect }: Props = $props();

  // Rejection note modal state
  let showRejectionModal = $state(false);
  let rejectionNote      = $state('');

  const canReview  = $derived(userRole === 'reviewer' || userRole === 'admin');
  const canOperate = $derived(userRole === 'operator' || userRole === 'admin');

  function handleReject() {
    showRejectionModal = true;
    rejectionNote = '';
  }

  function confirmReject() {
    onBulkStatusChange('rejected', rejectionNote || undefined);
    showRejectionModal = false;
    rejectionNote = '';
  }

  function cancelReject() {
    showRejectionModal = false;
    rejectionNote = '';
  }
</script>

{#if selectedCount > 0}
  <div class="action-bar">
    <div class="action-bar-left">
      <span class="action-bar-count">{selectedCount}</span>
      <span class="action-bar-label">{$m.col_selected_label(selectedCount)}</span>
    </div>

    <div class="action-bar-actions">
      {#if canOperate}
        <button class="action-bar-btn btn-in-review" onclick={() => onBulkStatusChange('in_review')}>
          <span class="material-symbols-outlined icon-sm">rate_review</span>
          {$m.col_send_to_review}
        </button>
      {/if}

      {#if canReview}
        <button class="action-bar-btn btn-approved" onclick={() => onBulkStatusChange('approved')}>
          <span class="material-symbols-outlined icon-sm">check_circle</span>
          {$m.col_approve}
        </button>

        <button class="action-bar-btn btn-rejected" onclick={handleReject}>
          <span class="material-symbols-outlined icon-sm">cancel</span>
          {$m.col_reject}
        </button>
      {/if}

      {#if canOperate}
        <button class="action-bar-btn btn-captured" onclick={() => onBulkStatusChange('captured')}>
          <span class="material-symbols-outlined icon-sm">photo_camera</span>
          {$m.col_return_to_captured}
        </button>
      {/if}
    </div>

    <div class="action-bar-right">
      <button class="action-bar-deselect" onclick={onDeselect}>
        <span class="material-symbols-outlined icon-sm">close</span>
        {$m.col_deselect}
      </button>
    </div>
  </div>
{/if}

{#if showRejectionModal}
  <div class="rejection-modal-backdrop" role="dialog" aria-modal="true">
    <div class="rejection-modal-card">
      <div class="rejection-modal-header">
        <h3 class="rejection-modal-title">{$m.col_reject_modal_title}</h3>
        <button class="rejection-modal-close" onclick={cancelReject} aria-label={$m.common_close}>
          <span class="material-symbols-outlined icon-sm">close</span>
        </button>
      </div>
      <p class="rejection-note-label">
        {$m.col_reject_note_label(selectedCount)}
      </p>
      <textarea
        class="rejection-note-textarea"
        bind:value={rejectionNote}
        placeholder={$m.col_reject_note_placeholder}
        rows="4"
      ></textarea>
      <div class="rejection-modal-actions">
        <button class="btn-secondary" onclick={cancelReject}>{$m.common_cancel}</button>
        <button class="btn-danger" onclick={confirmReject}>
          <span class="material-symbols-outlined icon-sm">cancel</span>
          {$m.col_reject_confirm}
        </button>
      </div>
    </div>
  </div>
{/if}

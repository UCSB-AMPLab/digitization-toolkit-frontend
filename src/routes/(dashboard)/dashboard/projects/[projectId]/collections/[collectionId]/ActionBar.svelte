<script lang="ts">
  import type { Record } from '$lib/api';
  import { m } from '$lib/i18n';

  // NEH-209: 'rejected' is deliberately excluded — rejection is single-record
  // only, via the mandatory-reason POST /records/{id}/reject (see Book
  // view's RejectReasonModal), not a bulk generic-status transition.
  type BulkRecordStatus = 'in_review' | 'approved';
  type UserRole = 'admin' | 'operator' | 'reviewer';

  interface Props {
    selectedCount: number;
    userRole: UserRole | null;
    onBulkStatusChange: (status: BulkRecordStatus) => void;
    onDeselect: () => void;
  }

  let { selectedCount, userRole, onBulkStatusChange, onDeselect }: Props = $props();

  const canReview  = $derived(userRole === 'reviewer' || userRole === 'admin');
  const canOperate = $derived(userRole === 'operator' || userRole === 'admin');
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

<script lang="ts">
  import type { Record } from '$lib/api';

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
      <span class="action-bar-label">
        {selectedCount === 1 ? 'registro seleccionado' : 'registros seleccionados'}
      </span>
    </div>

    <div class="action-bar-actions">
      {#if canOperate}
        <button class="action-bar-btn btn-in-review" onclick={() => onBulkStatusChange('in_review')}>
          <span class="material-symbols-outlined icon-sm">rate_review</span>
          Enviar a revisión
        </button>
      {/if}

      {#if canReview}
        <button class="action-bar-btn btn-approved" onclick={() => onBulkStatusChange('approved')}>
          <span class="material-symbols-outlined icon-sm">check_circle</span>
          Aprobar
        </button>

        <button class="action-bar-btn btn-rejected" onclick={handleReject}>
          <span class="material-symbols-outlined icon-sm">cancel</span>
          Rechazar
        </button>
      {/if}

      {#if canOperate}
        <button class="action-bar-btn btn-captured" onclick={() => onBulkStatusChange('captured')}>
          <span class="material-symbols-outlined icon-sm">photo_camera</span>
          Volver a capturado
        </button>
      {/if}
    </div>

    <div class="action-bar-right">
      <button class="action-bar-deselect" onclick={onDeselect}>
        <span class="material-symbols-outlined icon-sm">close</span>
        Deseleccionar
      </button>
    </div>
  </div>
{/if}

{#if showRejectionModal}
  <div class="rejection-modal-backdrop" role="dialog" aria-modal="true">
    <div class="rejection-modal-card">
      <div class="rejection-modal-header">
        <h3 class="rejection-modal-title">Rechazar registros</h3>
        <button class="rejection-modal-close" onclick={cancelReject} aria-label="Cerrar">
          <span class="material-symbols-outlined icon-sm">close</span>
        </button>
      </div>
      <p class="rejection-note-label">
        Nota de rechazo para los {selectedCount} registros seleccionados (opcional):
      </p>
      <textarea
        class="rejection-note-textarea"
        bind:value={rejectionNote}
        placeholder="Describe el motivo del rechazo..."
        rows="4"
      ></textarea>
      <div class="rejection-modal-actions">
        <button class="btn-secondary" onclick={cancelReject}>Cancelar</button>
        <button class="btn-danger" onclick={confirmReject}>
          <span class="material-symbols-outlined icon-sm">cancel</span>
          Confirmar rechazo
        </button>
      </div>
    </div>
  </div>
{/if}

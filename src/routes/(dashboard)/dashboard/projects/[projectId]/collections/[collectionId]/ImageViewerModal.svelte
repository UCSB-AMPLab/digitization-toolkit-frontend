<script lang="ts">
  // ============================================================================
  // COMPONENTE: ImageViewerModal (Gallery)
  //
  // Modal de inspección de imagen para la vista de galería.
  // Muestra todas las imágenes del registro con badge L/R cuando corresponde.
  //
  // Props:
  //   record    — registro a inspeccionar
  //   onClose   — callback para cerrar el modal
  //   onRetake  — callback para volver a capturar (navega a live-preview)
  //   onDelete  — callback para eliminar el registro completo
  // ============================================================================

  import { recordsApi, type Record, type RecordImage } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    record,
    onClose,
    onRetake,
    onDelete,
  }: {
    record: Record;
    onClose: () => void;
    onRetake: (record: Record) => void;
    onDelete: (record: Record) => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------
  let confirmAction = $state<null | 'retake' | 'delete'>(null);

  // Imágenes del registro, ordenadas por rol (left primero, right después)
  const images = $derived(() => {
    const imgs = record.images ?? [];
    return [...imgs].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    });
  });

  const isDouble = $derived(() => images().some(i => i.role === 'left' || i.role === 'right'));

  function roleLabel(img: RecordImage): string | null {
    if (img.role === 'left')  return 'L';
    if (img.role === 'right') return 'R';
    return null;
  }
</script>

<!-- ============================================================
     BACKDROP: click fuera cierra el modal
     ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="img-viewer-backdrop" onclick={onClose}>

  <!-- Contenido del modal -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="img-viewer-content" onclick={(e) => e.stopPropagation()}>

    <!-- ── Cabecera ── -->
    <div class="img-viewer-header">
      <span class="img-viewer-title">
        {record.title || `Registro #${record.id}`}
      </span>
      <button class="img-viewer-close-btn" onclick={onClose} aria-label="Cerrar">
        <span class="material-symbols-outlined icon-md">close</span>
      </button>
    </div>

    <!-- ── Área de imágenes ── -->
    <div class="img-viewer-images">
      {#each images() as img}
        <div class="img-viewer-frame">
          <!-- Badge L/R en captura doble -->
          {#if isDouble() && roleLabel(img)}
            <span class="img-viewer-badge">
              {roleLabel(img)}
            </span>
          {/if}

          <img
            src={recordsApi.getImageFileUrl(img.id)}
            alt={record.title || `Image ${img.id}`}
            class="img-viewer-img"
          />
        </div>
      {/each}

      {#if images().length === 0}
        <div class="img-viewer-frame">
          <span class="material-symbols-outlined icon-lg" style="--c: var(--color-light-grey)">
            image_not_supported
          </span>
        </div>
      {/if}
    </div>

    <!-- ── Pie de página ── -->
    <div class="img-viewer-footer">

      {#if confirmAction === null}
        <!-- Acciones normales -->
        <button class="btn btn-secondary" onclick={onClose}>
          <span class="material-symbols-outlined icon-sm">close</span>
          Cerrar
        </button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-warning" onclick={() => confirmAction = 'retake'}>
            <span class="material-symbols-outlined icon-sm">refresh</span>
            Retomar
          </button>
          <button class="btn btn-danger" onclick={() => confirmAction = 'delete'}>
            <span class="material-symbols-outlined icon-sm">delete</span>
            Eliminar
          </button>
        </div>

      {:else if confirmAction === 'retake'}
        <!-- Confirmación de retoma -->
        <span class="img-viewer-confirm-msg">
          ¿Descartar este registro y volver a capturar desde la vista en vivo?
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmAction = null}>
            Cancelar
          </button>
          <button class="btn btn-warning" onclick={() => { confirmAction = null; onRetake(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            Confirmar
          </button>
        </div>

      {:else if confirmAction === 'delete'}
        <!-- Confirmación de eliminación -->
        <span class="img-viewer-confirm-msg">
          ¿Eliminar permanentemente este registro y todas sus imágenes?
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmAction = null}>
            Cancelar
          </button>
          <button class="btn btn-danger" onclick={() => { confirmAction = null; onDelete(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            Eliminar
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .btn-warning {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-warning, #d97706);
    background: transparent;
    color: var(--color-warning, #d97706);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .btn-warning:hover { background-color: rgba(217, 119, 6, 0.12); }
</style>

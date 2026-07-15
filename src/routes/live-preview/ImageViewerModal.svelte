<script lang="ts">
  // ============================================================================
  // COMPONENTE: ImageViewerModal
  // Archivo: src/routes/live-preview/ImageViewerModal.svelte
  //
  // Modal de inspección de imagen con zoom y opción de retoma.
  //
  // Props:
  //   record       — registro a inspeccionar (con sus imágenes)
  //   cameraMode   — 'single' | 'double'
  //   onClose      — callback para cerrar el modal
  //   onRetake     — callback para volver a capturar el registro
  //
  // Comportamiento:
  //   - En modo 'double': muestra imagen L e imagen R en paralelo
  //   - En modo 'single': muestra la única imagen centrada
  //   - Botón "Volver a capturar": pide confirmación antes de ejecutar
  //   - Click en el backdrop cierra el modal (sin confirmar)
  // ============================================================================

  import { recordsApi, type Record as ApiRecord } from '$lib/api';
  import { m } from '$lib/i18n';

  let {
    record,
    cameraMode,
    onClose,
    onRetake,
  }: {
    record: ApiRecord;
    cameraMode: 'single' | 'double';
    onClose: () => void;
    onRetake: (record: ApiRecord) => void;
  } = $props();

  // Estado de confirmación de retoma
  let confirmRetake = $state(false);

  // Imágenes del registro, ordenadas por rol (left primero, right después)
  const images = $derived(() => {
    const imgs = record.images ?? [];
    return [...imgs].sort((a, b) => {
      const order: { [key: string]: number } = { left: 0, single: 0, right: 1 };
      return (order[a.role ?? 'single'] ?? 0) - (order[b.role ?? 'single'] ?? 0);
    });
  });
</script>

<!-- ============================================================
     BACKDROP: click fuera cierra el modal
     ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="img-viewer-backdrop" onclick={onClose}>

  <!-- Contenido del modal: stopPropagation para no cerrar al hacer click dentro -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="img-viewer-content" onclick={(e) => e.stopPropagation()}>

    <!-- ── Cabecera ── -->
    <div class="img-viewer-header">
      <span class="img-viewer-title">
        {record.title || $m.record_fallback_title(record.id)}
      </span>
      <button class="img-viewer-close-btn" onclick={onClose} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-md">close</span>
      </button>
    </div>

    <!-- ── Área de imágenes ── -->
    <div class="img-viewer-images">
      {#each images() as img}
        <div class="img-viewer-frame">
          <!-- Badge L/R en modo doble cámara -->
          {#if cameraMode === 'double' && img.role && img.role !== 'single'}
            <span class="img-viewer-badge">
              {img.role === 'left' ? $m.badge_left : $m.badge_right}
            </span>
          {/if}

          <img
            src={recordsApi.getImageFileUrl(img.id)}
            alt={record.title || $m.col_image_alt(img.id)}
            class="img-viewer-img"
          />
        </div>
      {/each}

      {#if images().length === 0}
        <div class="img-viewer-frame">
          <span style="--c: var(--color-light-grey)" class="material-symbols-outlined icon-lg">image_not_supported</span>
        </div>
      {/if}
    </div>

    <!-- ── Pie de página ── -->
    <div class="img-viewer-footer">
      {#if !confirmRetake}
        <!-- Acciones normales -->
        <button class="btn btn-secondary" onclick={onClose}>
          <span class="material-symbols-outlined icon-sm">close</span>
          {$m.common_close}
        </button>
        <button class="btn btn-danger" onclick={() => confirmRetake = true}>
          <span class="material-symbols-outlined icon-sm">refresh</span>
          {$m.lvm_retake}
        </button>
      {:else}
        <!-- Confirmación de retoma -->
        <span class="img-viewer-confirm-msg">
          {$m.lvm_retake_confirm}
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmRetake = false}>
            {$m.common_cancel}
          </button>
          <button class="btn btn-danger" onclick={() => { confirmRetake = false; onRetake(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            {$m.common_confirm}
          </button>
        </div>
      {/if}
    </div>

  </div>
</div>

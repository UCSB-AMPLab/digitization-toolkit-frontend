<script lang="ts">
  // ============================================================================
  // COMPONENTE: TopBar
  // Archivo: src/routes/live-preview/TopBar.svelte
  //
  // Barra superior de la interfaz Live Preview / Gallery.
  // Contiene:
  //   - Botón volver + breadcrumb proyecto / volumen (izquierda)
  //   - Botón "Ir a revisión" + avatar de usuario (derecha)
  //
  // Hasta mayo de 2026 esta barra tenía tabs "Live Scan / Gallery". El markup se
  // quitó en 84acac1 y quedaron las props, el estado y el CSS. La navegación que
  // disparaban vive ahora en el botón "Ir a revisión"; el resto se retira aquí.
  //
  // El breadcrumb replica el de la vista de colección a propósito: al entrar a
  // capturar, el operador no debe perder de vista dónde se están guardando las
  // imágenes.
  //
  // Props:
  //   onBack          → callback al hacer click en volver
  //   onGoToReview    → callback para salir a la vista de revisión del volumen
  //   projectName     → nombre del proyecto ('' mientras carga)
  //   collectionName  → nombre del volumen ('' mientras carga)
  // ============================================================================

  import { m } from '$lib/i18n';
  import UserMenu from '$lib/components/UserMenu.svelte';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    onBack,
    onGoToReview,
    projectName = '',
    collectionName = '',
  }: {
    onBack: () => void;
    onGoToReview: () => void;
    projectName?: string;
    collectionName?: string;
  } = $props();

</script>

<!-- ============================================================
     BARRA SUPERIOR
     Altura fija 72px, fondo surface, borde verde inferior
     ============================================================ -->
<div class="topbar">

  <!-- ── Lado izquierdo: botón volver ── -->
  <div class="topbar-left">
    <button
      class="btn-circle"
      onclick={onBack}
      aria-label={$m.tb_back}
    >
      <!-- Ícono flecha izquierda -->
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>

    <!-- Breadcrumb: dónde se están guardando las capturas -->
    {#if projectName || collectionName}
      <nav class="breadcrumb" aria-label={$m.tb_breadcrumb_nav}>
        {#if projectName}
          <span class="bc-item bc-project">{projectName}</span>
        {/if}
        {#if projectName && collectionName}
          <span class="bc-item bc-sep" aria-hidden="true">/</span>
        {/if}
        {#if collectionName}
          <span class="bc-item bc-collection">{collectionName}</span>
        {/if}
      </nav>
    {/if}
  </div>

  <!-- ── Lado derecho: ir a revisión + avatar ── -->
  <div class="topbar-right">
    <!-- Simétrico al botón "Ir a captura" de la vista de colección: misma
         esquina, mismo estilo, sentido contrario. -->
    <button
      class="btn-review"
      onclick={onGoToReview}
      title={$m.tb_go_to_review_title}
    >
      <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">rate_review</span>
      <span>{$m.tb_go_to_review}</span>
    </button>

    <!-- Identidad + salir. El avatar abre el menú (NEH-234). -->
    <UserMenu label={$m.tb_current_user} />
  </div>

</div>

<style>
  /* Barra completa: 72px de alto, fondo surface oscuro */
  .topbar {
    height: 72px;
    width: 100%;
    background-color: var(--color-surface-alt);
    /* Borde inferior verde — color primario del design system */
    border-bottom: 2px solid var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    flex-shrink: 0;
    position: relative;
    z-index: 20;
  }

  /* ── Lados izquierdo y derecho ── */
  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 120px;
  }

  .topbar-left {
    min-width: 0;
    flex: 1;
  }

  .topbar-right {
    justify-content: flex-end;
    flex-shrink: 0;
  }

  /* Botón circular (volver) */
  .btn-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--color-surface);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light);
    cursor: pointer;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .btn-circle:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }

  /* ── Botón "Ir a revisión": espejo de .btn-camera de la vista de colección ── */
  .btn-review {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    min-height: var(--touch-target-min);
    border-radius: var(--radius-full);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: var(--fw-bold);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-base);
  }

  .btn-review:hover {
    background-color: var(--color-primary-hover);
  }

  /* ── Breadcrumb: mismos valores que la vista de colección ── */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    min-width: 0;
  }
  .bc-item {
    color: var(--color-light-grey);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bc-sep { flex-shrink: 0; }
  .bc-collection {
    color: var(--color-light);
    font-weight: var(--fw-bold);
  }

</style>

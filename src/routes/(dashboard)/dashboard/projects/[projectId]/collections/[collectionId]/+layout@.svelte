<script lang="ts">
  // ============================================================================
  // LAYOUT: Detalle de colección — galería full-screen
  //
  // El @ en el nombre rompe la herencia del layout (dashboard) y hereda
  // directamente del layout raíz. Esto evita el sidebar de navegación.
  //
  // Proporciona:
  //   - Auth guard
  //   - Topbar minimalista con breadcrumb y acceso a live-preview
  //   - Slot de contenido que ocupa el resto de la pantalla
  // ============================================================================

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { m } from '$lib/i18n';

  let { children } = $props();

  // ---------------------------------------------------------------------------
  // PARÁMETROS
  // ---------------------------------------------------------------------------
  let projectId    = $derived(Number($page.params.projectId) || 0);
  let collectionId = $derived(Number($page.params.collectionId) || 0);

  // ---------------------------------------------------------------------------
  // AUTH + USUARIO
  // ---------------------------------------------------------------------------
  let currentUser = $state<any>(null);

  onMount(() => {
    const unsub = authStore.subscribe((s) => {
      currentUser = s.user;
      // Guard centralizado (NEH-66): mismo chequeo de "hay token" que antes
      // vivía copy-pasteado acá, en live-preview y en la página hija.
      authStore.requireSession();
    });
    return unsub;
  });

  // Roles que pueden abrir la cámara
  let canOpenCamera = $derived(
    currentUser?.role === 'admin' || currentUser?.role === 'operator'
  );

  // Iniciales del usuario para el avatar
  let userInitials = $derived(
    currentUser?.username?.slice(0, 2).toUpperCase() ?? '?'
  );

  // ---------------------------------------------------------------------------
  // BREADCRUMB — nombres de proyecto y colección
  // Los recibimos del load de +layout.ts (si existe) o del store de la página
  // ---------------------------------------------------------------------------
  let projectName    = $derived(($page.data as any).projectName    ?? '—');
  let collectionName = $derived(($page.data as any).collectionName ?? '—');
</script>

<!-- ============================================================
     TOP BAR MINIMALISTA
     ============================================================ -->
<div class="gallery-shell">

  <div class="topbar">

    <!-- Volver a la lista del proyecto -->
    <div class="topbar-left">
      <button
        class="btn-back"
        onclick={() => goto(`/dashboard/projects/${projectId}`)}
        aria-label={$m.col_back_to_project}
      >
        <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
      </button>

      <!-- Breadcrumb -->
      <nav class="breadcrumb" aria-label={$m.col_breadcrumb_nav}>
        <span class="bc-item bc-project">{projectName}</span>
        <span class="bc-sep">/</span>
        <span class="bc-item bc-collection">{collectionName}</span>
      </nav>
    </div>

    <!-- Derecha: botón cámara (solo operador/admin) + avatar -->
    <div class="topbar-right">

      {#if canOpenCamera}
        <button
          class="btn-camera"
          onclick={() => goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`)}
          title={$m.col_open_in_camera}
        >
          <span class="material-symbols-outlined" style="font-size:18px">photo_camera</span>
          <span>{$m.col_live_preview}</span>
        </button>
      {/if}

      <div class="user-avatar" aria-label={$m.col_current_user}>{userInitials}</div>

    </div>
  </div>

  <!-- Contenido de la página hija (galería) -->
  <div class="gallery-content">
    {@render children?.()}
  </div>

</div>

<style>
  .gallery-shell {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background-color: var(--color-bg);
    overflow: hidden;
  }

  /* ── TOPBAR ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 72px;
    flex-shrink: 0;
    /* Antes: var(--color-sidebar), una variable que no existe en ningún
       lado del proyecto — sin fallback, el fondo caía en transparente.
       Ahora usa el mismo fondo + borde que el topbar de Live Preview. */
    background-color: var(--color-surface-alt);
    border-bottom: 2px solid var(--color-primary);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Botón cámara — misma forma/estructura que el badge "En revisión" de
     Live Preview (TopBar.svelte: .status-badge — píldora, sin borde), pero
     en verde primario del design system en vez de sand, y con min-height
     táctil (44px) porque este SÍ es clickeable, a diferencia del badge. */
  .btn-camera {
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
  .btn-camera:hover { background-color: var(--color-primary-hover); }

  /* Botón volver */
  .btn-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: var(--color-bg);
    color: var(--color-light);
    cursor: pointer;
  }
  .btn-back:hover { background: var(--border-color); }

  /* Breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .bc-item {
    color: var(--color-light-grey);
  }
  .bc-collection {
    color: var(--color-light);
    font-weight: var(--fw-bold);
  }
  .bc-sep { color: var(--color-light-grey); }

  /* Avatar */
  .user-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background-color: var(--color-primary);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: var(--fw-bold);
    flex-shrink: 0;
  }

  /* Contenido: ocupa el resto de la pantalla */
  .gallery-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

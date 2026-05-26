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
      if (!s.token) goto('/login');
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
        aria-label="Volver al proyecto"
      >
        <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
      </button>

      <!-- Breadcrumb -->
      <nav class="breadcrumb" aria-label="Navegación">
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
          title="Abrir en cámara"
        >
          <span class="material-symbols-outlined" style="font-size:18px">photo_camera</span>
          <span>Live Scan</span>
        </button>
      {/if}

      <div class="user-avatar" aria-label="Usuario actual">{userInitials}</div>

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
    height: 52px;
    flex-shrink: 0;
    background-color: var(--color-sidebar);
    border-bottom: 1px solid var(--border-color);
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

  /* Botón cámara */
  .btn-camera {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: transparent;
    color: var(--color-light);
    font-size: 13px;
    cursor: pointer;
  }
  .btn-camera:hover { background: var(--color-bg); border-color: var(--color-primary); color: var(--color-primary); }

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

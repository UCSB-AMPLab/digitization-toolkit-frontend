<script lang="ts">
  // ============================================================================
  // COMPONENTE: TopBar (Gallery)
  // Archivo: src/routes/gallery/[collectionId]/TopBar.svelte
  //
  // Idéntico al TopBar del live-preview.
  // La única diferencia es que el tab activo por defecto es 'gallery'.
  //
  // Para compartir este componente con live-preview en el futuro,
  // moverlo a src/lib/components/TopBar.svelte y actualizar los imports.
  // ============================================================================

  import { authStore } from '$lib/stores/auth';

  let {
    activeTab = 'gallery',
    showFinalize = false,
    isFinalized  = false,
    onTabChange,
    onBack,
    onFinalizeClick,
  }: {
    activeTab: 'live' | 'gallery';
    showFinalize: boolean;
    isFinalized: boolean;
    onTabChange: (tab: 'live' | 'gallery') => void;
    onBack: () => void;
    onFinalizeClick: () => void;
  } = $props();

  // Iniciales del usuario para el avatar
  let userInitials = $derived(() => {
    let username = '';
    authStore.subscribe(s => { username = s.user?.username ?? ''; })();
    return username.slice(0, 2).toUpperCase() || '?';
  });
</script>

<div class="topbar">

  <!-- Volver -->
  <div class="topbar-left">
    <button class="btn-circle" onclick={onBack} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </div>

  <!-- Tabs centrados -->
  <div class="tabs-container">
    <div class="tabs-pill">
      <button class="tab-btn" class:active={activeTab === 'live'} onclick={() => onTabChange('live')}>
        Live Scan
      </button>
      <button class="tab-btn" class:active={activeTab === 'gallery'} onclick={() => onTabChange('gallery')}>
        Gallery
      </button>
    </div>
  </div>

  <!-- Derecha: badge + avatar -->
  <div class="topbar-right">
    <div class="status-badge">In review</div>
    <div class="user-avatar">{userInitials()}</div>
  </div>

  <!-- Derecha: Finalizar (opcional) + Badge de estado + Avatar -->
  <div class="topbar-right">

    <!--
      Botón "Finalizar"
      Solo visible cuando showFinalize = true, es decir:
        - vista grid activa
        - hay al menos una imagen
        - el proyecto no está finalizado aún
    -->
    {#if showFinalize}
      <button class="btn-finalizar" onclick={onFinalizeClick}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>Finalizar</span>
      </button>
    {/if}

    <!--
      Badge de estado del proyecto
      - Sin finalizar → "In review" (fondo sand/naranja, --color-highlight)
      - Finalizado    → "Terminado" (fondo rojo, --color-error)
      Para cambiar los textos, edita los strings aquí.
    -->
    <div class="status-badge" class:finalized={isFinalized}>
      {isFinalized ? 'Terminado' : 'In review'}
    </div>

    <!-- Avatar circular con iniciales del usuario -->
    <div class="user-avatar" aria-label="Usuario actual">
      {userInitials()}
    </div>

  </div>

</div>

<style>
  .topbar {
    height: 72px;
    width: 100%;
    background-color: var(--color-surface-alt);
    border-bottom: 2px solid var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    flex-shrink: 0;
    position: relative;
    z-index: 20;
  }

  .topbar-left, .topbar-right {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 120px;
  }

  .topbar-right { justify-content: flex-end; }

  .btn-circle {
    width: 40px; height: 40px;
    border-radius: 50%;
    background-color: var(--color-surface);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn-circle:hover { background-color: rgba(255,255,255,0.08); }

  .tabs-container {
    position: absolute;
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
  }

  .tabs-pill {
    background-color: var(--color-surface);
    padding: 4px;
    border-radius: var(--radius-lg);
    display: flex;
  }

  .tab-btn {
    padding: 8px 24px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    background: none;
    border: none;
    cursor: pointer;
    transition: all var(--transition-base);
    min-height: var(--touch-target-min);
    white-space: nowrap;
  }

  .tab-btn:hover { color: var(--color-light); }
  .tab-btn.active { background-color: var(--color-primary); color: var(--color-light); }

  .status-badge {
    padding: 6px 16px;
    border-radius: var(--radius-full);
    background-color: var(--color-highlight);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: var(--fw-bold);
    white-space: nowrap;
  }

  /* ── Botón Finalizar ── */
  /* Verde, aparece justo a la izquierda del badge de estado */
  .btn-finalizar {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--color-primary);
    color: white;
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    border: none;
    border-radius: var(--radius-full);  /* pill shape igual que el badge */
    padding: 8px 18px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(90,140,98,0.3);
    transition: all var(--transition-base);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-finalizar:hover { background-color: var(--color-primary-hover); }
  .btn-finalizar:active { transform: scale(0.97); }

  /* ── Badge de estado ── */
  /* Forma pill idéntica al botón Finalizar para coherencia visual */


  /* Finalizado: fondo rojo */
  .status-badge.finalized {
    background-color: var(--color-error);
  }

  .user-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background-color: var(--color-primary);
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light);
    font-family: var(--font-family);
    font-weight: var(--fw-bold);
    font-size: var(--text-sm);
    flex-shrink: 0;
    user-select: none;
  }
</style>

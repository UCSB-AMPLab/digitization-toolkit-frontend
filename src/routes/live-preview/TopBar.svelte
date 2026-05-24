<script lang="ts">
  // ============================================================================
  // COMPONENTE: TopBar
  // Archivo: src/routes/live-preview/TopBar.svelte
  //
  // Barra superior de la interfaz Live Preview / Gallery.
  // Contiene:
  //   - Botón volver (izquierda)
  //   - Tabs "Live Scan" / "Gallery" (centro)
  //   - Badge de estado + avatar de usuario (derecha)
  //
  // Props:
  //   activeTab       → tab activo ('live' | 'gallery')
  //   onTabChange     → callback al cambiar de tab
  //   onBack          → callback al hacer click en volver
  // ============================================================================

  import { authStore } from '$lib/stores/auth';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    activeTab,
    onTabChange,
    onBack,
  }: {
    activeTab: 'live' | 'gallery';
    onTabChange: (tab: 'live' | 'gallery') => void;
    onBack: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // INICIALES DEL USUARIO para el avatar
  // Lee el username del store de auth y toma las dos primeras letras
  // Si no hay usuario, muestra '?'
  // ---------------------------------------------------------------------------
  let userInitials = $derived(() => {
    let username = '';
    authStore.subscribe(s => { username = s.user?.username ?? ''; })();
    return username.slice(0, 2).toUpperCase() || '?';
  });
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
      aria-label="Volver"
    >
      <!-- Ícono flecha izquierda -->
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>
  </div>

  <!-- ── Lado derecho: badge de estado + avatar ── -->
  <div class="topbar-right">
    <!-- Badge "In Review" — estilo sand/naranja del design system -->
    <!-- Para cambiar el texto o el color, modifica aquí -->
    <div class="status-badge">
      In review
    </div>

    <!-- Avatar circular con iniciales del usuario -->
    <!-- El color verde viene del design system (--color-primary) -->
    <div class="user-avatar" aria-label="Usuario actual">
      {userInitials()}
    </div>
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

  .topbar-right {
    justify-content: flex-end;
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

  /* ── Tabs centrados (posición absoluta para centrado perfecto) ── */
  .tabs-container {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  /* Contenedor pill de los tabs */
  .tabs-pill {
    background-color: var(--color-surface);
    padding: 4px;
    border-radius: var(--radius-lg);
    display: flex;
    gap: 0;
  }

  /* Cada botón tab */
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
    transition: color var(--transition-base), background-color var(--transition-base);
    min-height: var(--touch-target-min);
    white-space: nowrap;
  }

  .tab-btn:hover {
    color: var(--color-light);
  }

  /* Tab activo: fondo verde primario */
  .tab-btn.active {
    background-color: var(--color-primary);
    color: var(--color-light);
  }

  /* ── Badge de estado ── */
  .status-badge {
    padding: 6px 16px;
    border-radius: var(--radius-full);
    background-color: var(--color-highlight);  /* sand/naranja del design system */
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: var(--fw-bold);
    white-space: nowrap;
  }

  /* ── Avatar del usuario ── */
  .user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background-color: var(--color-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
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

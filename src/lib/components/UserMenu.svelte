<script lang="ts">
  // ==========================================================================
  // COMPONENTE: UserMenu (NEH-234)
  //
  // El avatar de usuario de las barras superiores de captura y de volumen.
  // Antes era un <div> inerte: mostraba dos iniciales y no hacía nada, y
  // ninguna de esas dos pantallas tenía forma de cerrar sesión — que son
  // justo las dos pantallas en las que vive el operador en modo kiosco.
  //
  // Vive en $lib/components y no copiado en cada barra a propósito: duplicar
  // a mano un bloque idéntico en dos sitios es el error que arrastraba
  // NEH-237.
  //
  // El menú se cierra al tocar fuera y con Escape. En la pantalla táctil del
  // Pi no hay hover ni tecla, así que tocar fuera es la única salida real;
  // Escape está para el teclado de escritorio.
  // ==========================================================================

  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { m, roleLabel } from '$lib/i18n';

  // La etiqueta accesible del disparador la pone quien lo usa, porque cada
  // pantalla ya tiene su propia cadena traducida para esto.
  let { label }: { label: string } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | undefined>(undefined);

  let user     = $derived($authStore.user);
  let initials = $derived((user?.username ?? '').slice(0, 2).toUpperCase() || '?');

  function handleLogout() {
    open = false;
    authStore.clearSession();
    goto('/');
  }

  // Cerrar al tocar fuera o con Escape. Se escucha en fase de captura (true)
  // para que un control que detenga la propagación no deje el menú abierto.
  $effect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open = false;
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

<div class="user-menu" bind:this={root}>
  <button
    class="user-avatar"
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {initials}
  </button>

  {#if open}
    <div class="menu" role="menu">
      <div class="menu-identity">
        <span class="menu-name">{user?.username ?? '—'}</span>
        <span class="menu-role">{$roleLabel(user?.role)}</span>
      </div>

      <div class="menu-sep"></div>

      <button class="menu-logout" role="menuitem" onclick={handleLogout}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>{$m.nav_logout}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .user-menu { position: relative; flex-shrink: 0; }

  /* 44px: el avatar era de 30 y de 40 px en cada barra, por debajo del mínimo
     táctil. Las dos barras miden 72px de alto, así que cabe sin estirarlas. */
  .user-avatar {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    border-radius: var(--radius-full);
    background-color: var(--color-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--color-light);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    padding: 0;
    transition: background-color var(--transition-base);
  }
  .user-avatar:hover,
  .user-avatar[aria-expanded='true'] { background-color: var(--color-primary-hover); }

  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 100;
    min-width: 180px;
    padding: 4px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .menu-identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    min-width: 0;
  }
  .menu-name {
    color: var(--color-light);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu-role {
    color: var(--color-light-grey);
    font-size: var(--text-sm);
  }

  .menu-sep { height: 1px; background-color: var(--border-color); margin: 0 4px; }

  .menu-logout {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--touch-target-min);
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-md);
    background-color: transparent;
    /* Rojo como el "Salir" de la barra lateral del tablero. Allí el color está
       escrito a mano como rgba(214,103,74,...); aquí se usan los tokens, que
       es el mismo valor. */
    color: var(--color-error);
    font-family: var(--font-family);
    font-size: var(--text-base);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--transition-base);
  }
  .menu-logout:hover,
  .menu-logout:focus-visible {
    background-color: var(--color-error-bg);
  }
</style>

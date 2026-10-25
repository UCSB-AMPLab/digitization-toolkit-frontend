<script lang="ts">
  // User avatar menu for the capture and volume top bars (NEH-234). Those are
  // the two screens an operator works in on the kiosk, and they have no
  // sidebar, so this menu is where they sign out and reopen the tour. Both
  // bars use this one component rather than each keeping its own copy.
  //
  // The menu closes on a tap outside and on Escape. The Pi's touch screen has
  // no hover and no keyboard, so a tap outside is the real way out; Escape is
  // for a desktop keyboard.

  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { m, roleLabel } from '$lib/i18n';
  import { tour } from '$lib/tour';

  // The caller supplies the trigger's accessible label, because each screen
  // already has its own translated string for it.
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

  // pointerdown is heard in the capture phase (true) so that a control that
  // stops propagation cannot leave the menu open.
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

      <!-- Help: on the capture and volume screens, which have no sidebar,
           this menu is the only place to reopen the tour (NEH-95). -->
      <button class="menu-item" role="menuitem" onclick={() => { open = false; tour.start(); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{$m.nav_help}</span>
      </button>

      <button class="menu-item menu-logout" role="menuitem" onclick={handleLogout}>
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

  /* 44px, the touch minimum. Both bars are 72px tall, so it fits without
     stretching them. */
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

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--touch-target-min);
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-md);
    background-color: transparent;
    color: var(--color-light-grey);
    font-family: var(--font-family);
    font-size: var(--text-base);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--transition-base);
  }
  .menu-item:hover,
  .menu-item:focus-visible {
    background-color: rgba(255, 255, 255, 0.05);
    color: var(--color-light);
  }

  /* Red only on sign-out, like the button in the dashboard sidebar. There
     the colour is written by hand as rgba(214,103,74,...); here the tokens
     carry the same base colour. */
  .menu-logout { color: var(--color-error); }
  .menu-logout:hover,
  .menu-logout:focus-visible {
    background-color: var(--color-error-bg);
    color: var(--color-error);
  }
</style>

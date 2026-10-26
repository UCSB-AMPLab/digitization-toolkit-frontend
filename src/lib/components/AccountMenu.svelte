<script lang="ts">
  // The account menu: Help, shut down, restart, sign out (NEH-189, NEH-95).
  // The avatar in the capture and volume top bars (UserMenu) and the user row
  // in the dashboard sidebar both open it, so the entries, the closing rules
  // and the power confirmation exist once and the two menus cannot differ.
  // The caller supplies the trigger, and optionally an identity header.
  //
  // The menu closes on a tap outside and on Escape. The Pi's touch screen has
  // no hover and no keyboard, so a tap outside is the real way out; Escape is
  // for a desktop keyboard, and it returns focus to the trigger.
  //
  // Version: 0.1.0-beta

  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { m } from '$lib/i18n';
  import { tour } from '$lib/tour';
  import type { PowerAction } from '$lib/api';
  import PowerControl from './PowerControl.svelte';

  let {
    trigger,
    identity,
    placement = 'below-end',
    fill = false,
  }: {
    trigger: Snippet<[{ open: boolean; toggle: () => void }]>;
    identity?: Snippet;
    // 'below-end' hangs the menu under the trigger, aligned to its right edge.
    // 'above-start' opens it upward from the trigger's left edge, for a
    // trigger at the bottom of the screen; it is positioned against the
    // viewport so that the sidebar's overflow clipping cannot cut it off.
    placement?: 'below-end' | 'above-start';
    // Stretch the wrapper to the width of its container.
    fill?: boolean;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | undefined>(undefined);
  let anchor = $state('');

  function toggle() {
    if (!open && placement === 'above-start' && root) {
      const rect = root.getBoundingClientRect();
      anchor = `left: ${rect.left}px; bottom: ${window.innerHeight - rect.top + 8}px;`;
    }
    open = !open;
  }

  // Rendered outside the menu, which closes as soon as an entry is chosen,
  // so that the confirmation and the blocking state outlive it.
  let power = $state<ReturnType<typeof PowerControl> | undefined>(undefined);

  function askPower(action: PowerAction) {
    open = false;
    power?.ask(action);
  }

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
      if (event.key !== 'Escape') return;
      open = false;
      root?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

<div class="account-menu" class:fill bind:this={root}>
  {@render trigger({ open, toggle })}

  {#if open}
    <div
      class="menu"
      class:above-start={placement === 'above-start'}
      style={placement === 'above-start' ? anchor : undefined}
      role="menu"
    >
      {#if identity}
        {@render identity()}
        <div class="menu-sep"></div>
      {/if}

      <!-- On the capture and volume screens, which have no sidebar, this is
           the only place to reopen the tour (NEH-95). -->
      <button class="menu-item" role="menuitem" onclick={() => { open = false; tour.start(); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>{$m.nav_help}</span>
      </button>

      <div class="menu-sep"></div>

      <!-- One entry per action: each goes straight to its own confirmation.
           Same icons as the buttons in Settings. -->
      <button class="menu-item" role="menuitem" onclick={() => askPower('poweroff')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
          <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
        <span>{$m.config_shutdown_label}</span>
      </button>

      <button class="menu-item" role="menuitem" onclick={() => askPower('reboot')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        <span>{$m.config_reboot_label}</span>
      </button>

      <div class="menu-sep"></div>

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

<PowerControl bind:this={power} />

<style>
  .account-menu { position: relative; flex-shrink: 0; }
  .account-menu.fill { width: 100%; }

  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 100;
    min-width: 204px;
    padding: 4px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .menu.above-start {
    position: fixed;
    top: auto;
    right: auto;
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
    /* The menu hangs from a small trigger, so without this its labels would
       wrap at min-width instead of widening it. */
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--transition-base);
  }
  .menu-item:hover,
  .menu-item:focus-visible {
    background-color: rgba(255, 255, 255, 0.05);
    color: var(--color-light);
  }

  .menu-logout { color: var(--color-error); }
  .menu-logout:hover,
  .menu-logout:focus-visible {
    background-color: var(--color-error-bg);
    color: var(--color-error);
  }
</style>

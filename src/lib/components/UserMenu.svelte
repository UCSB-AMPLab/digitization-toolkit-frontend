<script lang="ts">
  // User avatar menu for the capture and volume top bars (NEH-234). Those are
  // the two screens an operator works in on the kiosk, and they have no
  // sidebar, so the avatar is where they sign out, reopen the tour, and shut
  // down or restart the unit (NEH-189). The entries, the closing rules and the
  // power confirmation are AccountMenu's, which the dashboard sidebar's user
  // row opens too; this file adds the avatar trigger and the identity header.
  //
  // Version: 0.1.0-beta

  import { authStore } from '$lib/stores/auth';
  import { roleLabel } from '$lib/i18n';
  import AccountMenu from './AccountMenu.svelte';

  // The caller supplies the trigger's accessible label, because each screen
  // already has its own translated string for it.
  let { label }: { label: string } = $props();

  let user     = $derived($authStore.user);
  let initials = $derived((user?.username ?? '').slice(0, 2).toUpperCase() || '?');
</script>

<AccountMenu>
  {#snippet trigger({ open, toggle })}
    <button
      class="user-avatar"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={toggle}
    >
      {initials}
    </button>
  {/snippet}

  {#snippet identity()}
    <div class="menu-identity">
      <span class="menu-name">{user?.username ?? '—'}</span>
      <span class="menu-role">{$roleLabel(user?.role)}</span>
    </div>
  {/snippet}
</AccountMenu>

<style>
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
</style>

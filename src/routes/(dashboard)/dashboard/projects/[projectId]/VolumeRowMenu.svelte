<script module lang="ts">
  import { writable } from 'svelte/store';
  // The volume whose menu is open, shared by every row, so opening one menu
  // closes the others.
  const openVolumeId = writable<number | null>(null);
</script>

<script lang="ts">
  // A volume row's action menu (Editar, Eliminar), for the project page and
  // Volúmenes (NEH-313). The pages show it to admins and operators only, the
  // roles the backend lets edit or delete a volume; what each action does is
  // the page's (the volume form, the delete dialog). A click anywhere else
  // closes it.
  //
  // Version: 0.3.3
  import { onDestroy } from 'svelte';
  import { m } from '$lib/i18n';
  import type { Collection } from '$lib/api';

  let {
    volume,
    onEdit,
    onDelete,
  }: {
    volume: Collection;
    onEdit: (volume: Collection) => void;
    onDelete: (volume: Collection) => void;
  } = $props();

  let open = $derived($openVolumeId === volume.id);

  // A menu left open when its row goes (another page, a reload) is closed,
  // so it does not come back open with the next list.
  onDestroy(() => {
    if (open) openVolumeId.set(null);
  });

  $effect(() => {
    if (open) {
      const close = () => openVolumeId.set(null);
      document.addEventListener('click', close, { once: true });
      return () => document.removeEventListener('click', close);
    }
  });

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    openVolumeId.set(open ? null : volume.id);
  }

  function act(e: MouseEvent, action: (volume: Collection) => void) {
    e.stopPropagation();
    openVolumeId.set(null);
    action(volume);
  }
</script>

<div class="action-menu-wrap">
  <button class="btn-menu" onclick={toggle} title={$m.common_actions}>
    <span class="material-symbols-outlined icon-sm">more_vert</span>
  </button>
  {#if open}
    <div class="action-menu">
      <button class="action-item" onclick={(e) => act(e, onEdit)}>
        <span class="material-symbols-outlined icon-sm">edit</span>
        {$m.common_edit}
      </button>
      <button class="action-item action-item-danger" onclick={(e) => act(e, onDelete)}>
        <span class="material-symbols-outlined icon-sm">delete</span>
        {$m.common_delete}
      </button>
    </div>
  {/if}
</div>

<style>
  /* As the project page drew it. */
  .action-menu-wrap { position: relative; display: inline-flex; justify-content: flex-end; }

  .btn-menu {
    width: 32px; height: 32px;
    background: none; border: 1px solid transparent;
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-menu:hover { background-color: var(--color-surface-alt); border-color: var(--border-color); color: var(--color-light); }

  .action-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 140px;
    z-index: 50;
    overflow: hidden;
  }

  .action-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 9px 14px;
    background: none; border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .action-item:hover { background-color: var(--color-surface); color: var(--color-light); }
  .action-item-danger:hover { color: var(--color-error); }
</style>

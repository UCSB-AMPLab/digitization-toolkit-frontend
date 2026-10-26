<script lang="ts">
  // Full-screen shell for a volume's gallery. The `@` in the filename makes
  // this layout inherit from the root layout instead of the (dashboard) one,
  // so the dashboard navigation sidebar is not rendered. It holds the session
  // guard and the top bar (breadcrumb, offsite copy line, camera button); the
  // page fills the rest of the screen.
  //
  // Version: 0.1.0-beta

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { m } from '$lib/i18n';
  import UserMenu from '$lib/components/UserMenu.svelte';
  import VolumeOffsiteIndicator from '$lib/components/VolumeOffsiteIndicator.svelte';
  import VolumeOffsiteActions from '$lib/components/VolumeOffsiteActions.svelte';
  import { setVolumeTopbar, type VolumeTopbarSlot } from '$lib/volume-topbar';
  import type { VolumeOffsiteState } from '$lib/api';
  import { freedAfterRead, freedCountsOf, type FreedCounts } from '$lib/offsite-free';

  let { children } = $props();

  // Controls the page puts in the bar: send for review and take back (NEH-260).
  const topbarSlot = $state<VolumeTopbarSlot>({ actions: null, reloadRecords: null });
  setVolumeTopbar(topbarSlot);

  let projectId    = $derived(Number($page.params.projectId) || 0);
  let collectionId = $derived(Number($page.params.collectionId) || 0);

  let currentUser = $state<any>(null);

  onMount(() => {
    const unsub = authStore.subscribe((s) => {
      currentUser = s.user;
      // Shared session guard (NEH-66), also used by live-preview and the page.
      authStore.requireSession();
    });
    return unsub;
  });

  let canOpenCamera = $derived(
    currentUser?.role === 'admin' || currentUser?.role === 'operator'
  );

  // Space on the card (NEH-248): free and restore, admin only. The button
  // sits next to the breadcrumb and the offsite copy line, which is what
  // shows what is freed. The backend refuses these routes to other roles.
  let isAdmin = $derived(currentUser?.role === 'admin');
  // The last state the line read: a poll that fails keeps it, so an open
  // dialog is not closed under the admin; it is matched to the volume shown.
  let offsiteState = $state<VolumeOffsiteState | null>(null);
  let offsiteRefresh = $state(0);
  // What the line last read as freed. When it changes on the volume shown, a
  // free or a restore has moved files, whether or not its dialog was still
  // open, so the page reloads the records and their freed state.
  let lastFreed: FreedCounts | null = null;

  function offsiteRead(s: VolumeOffsiteState | null) {
    if (!s) return;
    offsiteState = s;
    const next = freedCountsOf(s);
    // Advanced only once the records reloaded; a failed reload is tried
    // again on the next poll (freedAfterRead).
    const forId = collectionId;
    freedAfterRead(lastFreed, next, forId, topbarSlot.reloadRecords).then((last) => {
      if (collectionId === forId) lastFreed = last;
    });
  }

  // A job's end, for the volume it was started for: ask the line again. A
  // job of a volume no longer shown changes nothing here.
  function offsiteChanged(forId: number) {
    if (forId === collectionId) offsiteRefresh += 1;
  }

  // Project and volume names come from the load in +layout.ts.
  let projectName    = $derived(($page.data as any).projectName    ?? '—');
  let collectionName = $derived(($page.data as any).collectionName ?? '—');
</script>

<div class="gallery-shell">

  <div class="topbar">

    <div class="topbar-left">
      <button
        class="btn-back"
        onclick={() => goto(`/dashboard/projects/${projectId}`)}
        aria-label={$m.col_back_to_project}
      >
        <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
      </button>

      <!-- Breadcrumb, with the volume's offsite copy line below it (NEH-248) -->
      <div class="topbar-title">
        <nav class="breadcrumb" aria-label={$m.col_breadcrumb_nav}>
          <span class="bc-item bc-project">{projectName}</span>
          <span class="bc-sep">/</span>
          <span class="bc-item bc-collection">{collectionName}</span>
        </nav>
        <VolumeOffsiteIndicator {collectionId} refresh={offsiteRefresh} onState={offsiteRead} />
      </div>
      {#if isAdmin && offsiteState && offsiteState.collection_id === collectionId}
        {#key collectionId}
          <VolumeOffsiteActions {collectionId} offsite={offsiteState} onChanged={offsiteChanged} />
        {/key}
      {/if}
    </div>

    <!-- Camera button for operator and admin only -->
    <div class="topbar-right">

      {@render topbarSlot.actions?.()}

      {#if canOpenCamera}
        <button
          class="btn-camera"
          data-tour="capturar"
          onclick={() => goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`)}
          title={$m.col_open_in_camera}
        >
          <span class="material-symbols-outlined" style="font-size:18px">photo_camera</span>
          <span>{$m.col_live_preview}</span>
        </button>
      {/if}

      <!-- Identity and sign-out. The avatar opens the menu (NEH-234). -->
      <UserMenu label={$m.col_current_user} />

    </div>
  </div>

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
    /* Same background and border as the Live Preview top bar. */
    background-color: var(--color-surface-alt);
    border-bottom: 2px solid var(--color-primary);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Mirrored by `.btn-review` in live-preview/TopBar.svelte: keep the two
     in step. Touch-target minimum height (44px). */
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


  .gallery-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

<script lang="ts">
  // Top bar of the capture page: the back button and the project / volume
  // breadcrumb on the left, the go-to-review button and the user menu on the
  // right. The breadcrumb mirrors the collection view's on purpose, so the
  // operator can see where the images are being stored while capturing.
  // projectName and collectionName are '' while they load. With
  // onCheckCameras, "Check cameras" opens the camera check (NEH-339), in the
  // review button's shape, outlined so that it reads as secondary to Review;
  // below 600px wide it shows its icon only.
  //
  // Version: 0.3.3

  import { m } from '$lib/i18n';
  import UserMenu from '$lib/components/UserMenu.svelte';

  let {
    onBack,
    onGoToReview,
    onCheckCameras,
    checkCamerasDisabled = false,
    projectName = '',
    collectionName = '',
  }: {
    onBack: () => void;
    onGoToReview: () => void;
    onCheckCameras?: () => void;
    checkCamerasDisabled?: boolean;
    projectName?: string;
    collectionName?: string;
  } = $props();

</script>

<div class="topbar">

  <div class="topbar-left">
    <button
      class="btn-circle"
      onclick={onBack}
      aria-label={$m.tb_back}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
    </button>

    {#if projectName || collectionName}
      <nav class="breadcrumb" aria-label={$m.tb_breadcrumb_nav}>
        {#if projectName}
          <span class="bc-item bc-project">{projectName}</span>
        {/if}
        {#if projectName && collectionName}
          <span class="bc-item bc-sep" aria-hidden="true">/</span>
        {/if}
        {#if collectionName}
          <span class="bc-item bc-collection">{collectionName}</span>
        {/if}
      </nav>
    {/if}
  </div>

  <div class="topbar-right">
    {#if onCheckCameras}
      <button class="btn-review is-quiet" onclick={onCheckCameras} disabled={checkCamerasDisabled} aria-label={$m.camcheck_open} title={$m.camcheck_open}>
        <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">photo_camera</span>
        <span class="tb-check-label">{$m.camcheck_open}</span>
      </button>
    {/if}

    <!-- Symmetric with the collection view's go-to-capture button: same
         corner, same style, opposite direction. -->
    <button
      class="btn-review"
      onclick={onGoToReview}
      title={$m.tb_go_to_review_title}
    >
      <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">rate_review</span>
      <span>{$m.tb_go_to_review}</span>
    </button>

    <!-- Identity and sign-out. The avatar opens the menu (NEH-234). -->
    <UserMenu label={$m.tb_current_user} />
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

  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 120px;
  }

  .topbar-left {
    min-width: 0;
    flex: 1;
  }

  .topbar-right {
    justify-content: flex-end;
    flex-shrink: 0;
  }

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

  /* Mirrors .btn-camera in the collection view */
  .btn-review {
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

  .btn-review:hover {
    background-color: var(--color-primary-hover);
  }

  /* The review button's shape, outlined: secondary to Review. */
  .btn-review.is-quiet {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--color-light-grey);
    font-weight: var(--fw-semibold);
  }
  .btn-review.is-quiet:hover {
    background-color: rgba(255, 255, 255, 0.05);
    color: var(--color-light);
  }
  .btn-review:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Narrower than the unit's 800px screen, the icon alone, so that the
     breadcrumb keeps its room. */
  @media (max-width: 600px) {
    .tb-check-label { display: none; }
    .btn-review.is-quiet { padding: 10px 12px; }
  }

  /* Same values as the collection view's breadcrumb */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    min-width: 0;
  }
  .bc-item {
    color: var(--color-light-grey);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bc-sep { flex-shrink: 0; }
  .bc-collection {
    color: var(--color-light);
    font-weight: var(--fw-bold);
  }

</style>

<script lang="ts">
  // Decides what an inspection viewer shows of a record image (NEH-139) and
  // lets the viewer draw the <img> with its own snippet, so the viewer keeps
  // its scoped classes, its pan/zoom transform and its bind:naturalWidth.
  //
  // Candidates, in order (see displayCandidates in $lib/image-display):
  //   - JPEG/PNG/WebP: /preview (the master itself), then /thumbnail.
  //   - RAW: /preview (its JPEG preview), then /thumbnail.
  //   - Any other format (TIFF): /thumbnail only; /preview returns 404.
  // When the <img> fails to load a candidate, the next one is tried. With no
  // candidates left, an explicit state names the file — never the broken-image
  // icon, which invites a retake. In that state /file is asked whether the
  // original is on disk, and it is reported as stored only when the backend
  // confirms it. The /file URL never goes in an <img>: for a RAW it returns
  // RAW bytes. The preview and the thumbnail carry a badge.
  //
  // A file freed from the card (NEH-248) returns 410 with a body saying it is
  // in the offsite copy. The <img> does not say why it failed, so when
  // /preview fails it is asked again with fetch (probeFreed). A freed file
  // gets a calm notice over the thumbnail, or on its own when there is no
  // thumbnail: the file is off the unit, nothing is lost and an admin can
  // restore the volume. It is never shown as missing or as an error. A format
  // shown only through its thumbnail (TIFF) never requests /preview, so the
  // record's master_freed_at decides there (freedFromMetadata).
  //
  // Over a thumbnail the notice is one line, so the operator keeps the page to
  // compare against the volume; a toggle opens the rest. On its own it is whole.
  //
  // Version: 0.2.0

  import { untrack, type Snippet } from 'svelte';
  import { recordsApi, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import {
    checkMasterStored,
    displayCandidates,
    formatOf,
    isBrowserDisplayable,
    isRawImage,
    freedFromMetadata,
    previewFreedByMetadata,
    probeFreed,
    type FreedFile,
    type MasterCheck,
  } from '$lib/image-display';

  let {
    image,
    children,
    onMasterFreed,
  }: {
    image: Pick<RecordImage, 'id' | 'format' | 'filename' | 'master_freed_at' | 'preview_freed_at'>;
    /** Draws the <img>: receives the URL to show and the error handler. */
    children: Snippet<[string, () => void]>;
    /** Told whether a 410 has said the master itself is freed, whatever the
     *  record's master_freed_at says; a freed RAW preview does not count. */
    onMasterFreed?: (freed: boolean) => void;
  } = $props();

  // Resolve again only when the image changes, not each time the parent
  // passes a new object with the same data (e.g. when the list reloads).
  const imageKey = $derived(
    `${image.id}|${image.format}|${image.filename}|${image.master_freed_at ?? ''}|${image.preview_freed_at ?? ''}`,
  );

  const candidates = $derived.by(() => {
    void imageKey;
    return untrack(() => displayCandidates(image, recordsApi));
  });

  const raw = $derived.by(() => { void imageKey; return untrack(() => isRawImage(image)); });
  // A format the browser cannot display (TIFF) is named in the text. When the
  // format can be displayed (a JPEG that failed to load) or is unknown, the
  // text is generic.
  const unsupportedExt = $derived.by(() => {
    void imageKey;
    return untrack(() => {
      const fmt = formatOf(image);
      return fmt && !isRawImage(image) && !isBrowserDisplayable(image) ? fmt.toUpperCase() : null;
    });
  });

  // Index of the candidate on screen; candidates.length = none.
  let index = $state(0);
  let master = $state<MasterCheck | 'checking'>('checking');
  // The freed file a candidate's 410 described; null otherwise.
  let freed = $state<FreedFile | null>(null);
  // Whether the compact notice over a thumbnail shows its explanation.
  let freedOpen = $state(false);
  // Aborts the probeFreed requests when the image changes or on unmount.
  let probes: AbortController | null = null;

  $effect.pre(() => {
    void candidates;
    index = 0;
    master = 'checking';
    freed = untrack(() => freedFromMetadata(image));
    freedOpen = false;
    probes?.abort();
    probes = null;
  });

  $effect(() => () => probes?.abort());

  // When the record says /preview is freed but the <img> may still hold the
  // preview it loaded (the URL does not change on an in-place reload), ask
  // /preview again past the browser's cache, and on its 410 move on to the
  // thumbnail. The 410 decides, as in handleError.
  $effect(() => {
    const first = candidates[0];
    if (!first || first.kind === 'thumbnail' || !untrack(() => previewFreedByMetadata(image))) return;
    probes ??= new AbortController();
    const signal = probes.signal;
    const noStore: typeof fetch = (u, init) => fetch(u, { ...init, cache: 'no-store' });
    probeFreed(first.url, noStore, signal).then((f) => {
      if (!f || signal.aborted) return;
      freed = f;
      if (index === 0) index = 1;
    });
  });

  $effect(() => {
    onMasterFreed?.(freed?.kind === 'capture' || master === 'freed');
  });

  const current = $derived(index < candidates.length ? candidates[index] : null);

  // With nothing left to show, ask whether the original is stored. The
  // request in flight is aborted on unmount or when the image changes.
  $effect(() => {
    if (current !== null) return;
    const id = untrack(() => image.id);
    const controller = new AbortController();
    checkMasterStored(recordsApi.getImageFileUrl(id), fetch, controller.signal).then((r) => {
      if (!controller.signal.aborted) master = r;
    });
    return () => controller.abort();
  });

  function handleError() {
    if (!current) return;
    // A freed file's thumbnail stays on the unit; only /preview can return
    // 410 for a freed file the viewer was about to show.
    if (current.kind !== 'thumbnail') {
      probes ??= new AbortController();
      const signal = probes.signal;
      probeFreed(current.url, fetch, signal).then((f) => {
        if (f && !signal.aborted) freed = f;
      });
    }
    index += 1;
  }

  const isFreed = $derived(freed !== null || master === 'freed');

  const thumbnailHint = $derived(
    raw ? $m.raw_thumbnail_hint : unsupportedExt ? $m.image_thumbnail_hint_format(unsupportedExt) : $m.image_thumbnail_hint,
  );
</script>

{#snippet freedPanel(overThumbnail: boolean)}
  {#if overThumbnail}
    <div class="freed-panel freed-panel-over freed-panel-compact" data-testid="image-freed" role="note">
      <div class="freed-panel-line">
        <span class="material-symbols-outlined freed-panel-icon" aria-hidden="true">archive</span>
        <strong class="freed-panel-title">{$m.freed_title}</strong>
        <button type="button" class="freed-panel-toggle" aria-expanded={freedOpen} onclick={() => (freedOpen = !freedOpen)}>
          {freedOpen ? $m.lv_instruction_show_less : $m.lv_instruction_show_all}
        </button>
      </div>
      {#if freedOpen}
        <span>{$m.freed_where}</span>
        <span>{$m.freed_nothing_lost}</span>
        <span>{$m.freed_restore_hint}</span>
        <span class="freed-panel-note">{$m.freed_thumbnail_note}</span>
      {/if}
    </div>
  {:else}
    <div class="freed-panel" data-testid="image-freed" role="note">
      <span class="material-symbols-outlined freed-panel-icon" aria-hidden="true">archive</span>
      <strong class="freed-panel-title">{$m.freed_title}</strong>
      <span>{$m.freed_where}</span>
      <span>{$m.freed_nothing_lost}</span>
      <span>{$m.freed_restore_hint}</span>
    </div>
  {/if}
{/snippet}

{#if current}
  {@render children(current.url, handleError)}
  {#if current.kind === 'thumbnail' && isFreed}
    {@render freedPanel(true)}
  {:else if current.kind === 'preview'}
    <span class="raw-badge" title={$m.raw_preview_hint}>{$m.raw_preview_badge}</span>
  {:else if current.kind === 'thumbnail'}
    <span class="raw-badge" title={thumbnailHint}>{raw ? $m.raw_thumbnail_badge : $m.image_thumbnail_badge}</span>
  {/if}
{:else if isFreed}
  {@render freedPanel(false)}
{:else if master === 'missing'}
  <div class="raw-state" data-testid="image-missing">
    <span class="material-symbols-outlined icon-lg">image_not_supported</span>
    <span class="raw-filename">{image.filename}</span>
    <span>{$m.image_file_missing}</span>
  </div>
{:else}
  <div class="raw-state" data-testid="image-unviewable">
    <span class="material-symbols-outlined icon-lg">{raw ? 'raw_on' : 'hide_image'}</span>
    <strong>{raw ? $m.raw_unviewable_title : $m.image_unviewable_title}</strong>
    <span class="raw-filename">{image.filename}</span>
    <span>
      {raw
        ? $m.raw_unviewable_body
        : unsupportedExt
          ? $m.image_unviewable_body_format(unsupportedExt)
          : $m.image_unviewable_body}
    </span>
    {#if master === 'stored'}
      <span>{$m.image_original_stored}</span>
    {/if}
  </div>
{/if}

<style>
  .raw-badge {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 5;
    background: rgba(0, 0, 0, 0.7);
    color: var(--color-light);
    font-size: 11px;
    font-weight: var(--fw-bold);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    pointer-events: auto;
  }

  .raw-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    max-width: 320px;
    padding: 16px;
    text-align: center;
    color: var(--color-light-grey);
    font-size: var(--text-sm);
  }

  .raw-filename {
    font-family: monospace;
    word-break: break-all;
    color: var(--color-light);
  }

</style>

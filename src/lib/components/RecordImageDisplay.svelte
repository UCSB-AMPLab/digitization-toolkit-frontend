<script lang="ts">
  // ============================================================================
  // COMPONENTE: RecordImageDisplay (NEH-139)
  //
  // Decide qué se muestra de una imagen de registro en un visor de inspección
  // y deja que el visor pinte el <img> con su propio snippet (así conserva sus
  // clases con alcance, su transform de pan/zoom y sus bind:naturalWidth).
  //
  //   - Imagen no RAW: el snippet recibe la URL de /file, como antes.
  //   - Imagen RAW: nunca se pone la URL de /file en un <img> a ciegas. Se pide
  //     con fetch y solo si el backend responde con una imagen (la vista previa
  //     JPEG que sirve en lugar del RAW) se muestra, como blob:. Si responde con
  //     los bytes del RAW, o falla la red, se muestra la miniatura. Si la
  //     miniatura tampoco carga, se muestra un estado explícito con el nombre
  //     del archivo — nunca el ícono de imagen rota, que invita a retomar.
  //     Un 404 de /file se muestra como archivo no encontrado.
  //   - La vista previa y la miniatura llevan una etiqueta que dice que son una
  //     vista previa de un RAW.
  // ============================================================================

  import { untrack, type Snippet } from 'svelte';
  import { recordsApi, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import { displayCandidates, probeImage } from '$lib/image-display';

  let {
    image,
    children,
  }: {
    image: Pick<RecordImage, 'id' | 'format' | 'filename'>;
    /** Pinta el <img>: recibe la URL a mostrar y el handler de error. */
    children: Snippet<[string, () => void]>;
  } = $props();

  type View =
    | { phase: 'loading' }
    | { phase: 'show'; url: string; kind: 'original' | 'preview' | 'thumbnail' }
    | { phase: 'unviewable' }
    | { phase: 'missing' };

  // Solo se vuelve a resolver si cambia la imagen, no cada vez que el padre
  // pasa un objeto nuevo con los mismos datos (p. ej. al recargar la lista):
  // cada resolución de un RAW descarga la vista previa completa.
  const imageKey = $derived(`${image.id}|${image.format}|${image.filename}`);

  const candidates = $derived.by(() => {
    void imageKey;
    return untrack(() => displayCandidates(image, recordsApi));
  });

  const thumbnailUrl = $derived(candidates.find((c) => c.kind === 'thumbnail')?.url ?? null);

  // Estado de la resolución de un RAW. Una imagen no RAW no pasa por aquí:
  // se muestra en el mismo render, como antes de NEH-139.
  let rawView = $state<View>({ phase: 'loading' });

  const view = $derived.by((): View => {
    const first = candidates[0];
    return first.kind === 'original' ? { phase: 'show', url: first.url, kind: 'original' } : rawView;
  });

  $effect(() => {
    const first = candidates[0];
    if (first.kind !== 'preview') return;

    let cancelled = false;
    let blobUrl: string | null = null;
    rawView = { phase: 'loading' };
    probeImage(first.url).then((result) => {
      if (cancelled) return;
      if (result.status === 'image') {
        blobUrl = URL.createObjectURL(result.blob);
        rawView = { phase: 'show', url: blobUrl, kind: 'preview' };
      } else if (result.status === 'missing') {
        rawView = { phase: 'missing' };
      } else {
        showThumbnailOrGiveUp();
      }
    });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  });

  function showThumbnailOrGiveUp() {
    const thumb = untrack(() => thumbnailUrl);
    rawView = thumb ? { phase: 'show', url: thumb, kind: 'thumbnail' } : { phase: 'unviewable' };
  }

  function handleError() {
    if (view.phase !== 'show') return;
    if (view.kind === 'preview') {
      showThumbnailOrGiveUp();
    } else if (view.kind === 'thumbnail') {
      rawView = { phase: 'unviewable' };
    }
    // 'original' (no RAW): se deja como estaba antes de NEH-139.
  }
</script>

{#if view.phase === 'show'}
  {@render children(view.url, handleError)}
  {#if view.kind === 'preview'}
    <span class="raw-badge" title={$m.raw_preview_hint} data-testid="raw-badge">{$m.raw_preview_badge}</span>
  {:else if view.kind === 'thumbnail'}
    <span class="raw-badge" title={$m.raw_thumbnail_hint} data-testid="raw-badge">{$m.raw_thumbnail_badge}</span>
  {/if}
{:else if view.phase === 'loading'}
  <div class="raw-state" role="status" aria-label={$m.common_loading}>
    <span class="raw-spinner"></span>
  </div>
{:else if view.phase === 'unviewable'}
  <div class="raw-state" data-testid="raw-unviewable">
    <span class="material-symbols-outlined icon-lg">raw_on</span>
    <strong>{$m.raw_unviewable_title}</strong>
    <span class="raw-filename">{image.filename}</span>
    <span>{$m.raw_unviewable_body}</span>
  </div>
{:else}
  <div class="raw-state" data-testid="raw-missing">
    <span class="material-symbols-outlined icon-lg">image_not_supported</span>
    <span class="raw-filename">{image.filename}</span>
    <span>{$m.image_file_missing}</span>
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

  .raw-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-light-grey);
    border-top-color: transparent;
    border-radius: 50%;
    animation: raw-spin 0.8s linear infinite;
  }

  @keyframes raw-spin {
    to { transform: rotate(360deg); }
  }
</style>

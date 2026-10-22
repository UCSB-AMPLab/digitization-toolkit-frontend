<script lang="ts">
  // ============================================================================
  // COMPONENTE: RecordImageDisplay (NEH-139)
  //
  // Decide qué se muestra de una imagen de registro en un visor de inspección
  // y deja que el visor pinte el <img> con su propio snippet (así conserva sus
  // clases con alcance, su transform de pan/zoom y sus bind:naturalWidth).
  //
  //   - Imagen no RAW: el snippet recibe la URL de /preview (el máster mismo).
  //   - Imagen RAW: /preview (su vista previa JPEG); si el <img> no la puede
  //     cargar, /thumbnail; si tampoco, un estado explícito con el nombre del
  //     archivo — nunca el ícono de imagen rota, que invita a retomar. En ese
  //     estado se pregunta a /file si el original está en el disco, y solo si
  //     el backend lo confirma se dice que está guardado.
  //   - La URL de /file nunca va en un <img>: para un RAW son bytes RAW.
  //   - La vista previa y la miniatura llevan una etiqueta que dice que son una
  //     vista previa de un RAW.
  // ============================================================================

  import { untrack, type Snippet } from 'svelte';
  import { recordsApi, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import { checkMasterStored, displayCandidates, type MasterCheck } from '$lib/image-display';

  let {
    image,
    children,
  }: {
    image: Pick<RecordImage, 'id' | 'format' | 'filename'>;
    /** Pinta el <img>: recibe la URL a mostrar y el handler de error. */
    children: Snippet<[string, () => void]>;
  } = $props();

  // Solo se vuelve a resolver si cambia la imagen, no cada vez que el padre
  // pasa un objeto nuevo con los mismos datos (p. ej. al recargar la lista).
  const imageKey = $derived(`${image.id}|${image.format}|${image.filename}`);

  const candidates = $derived.by(() => {
    void imageKey;
    return untrack(() => displayCandidates(image, recordsApi));
  });

  // Índice del candidato que se está mostrando; candidates.length = ninguno.
  let index = $state(0);
  let master = $state<MasterCheck | 'checking'>('checking');

  $effect.pre(() => {
    void candidates;
    index = 0;
    master = 'checking';
  });

  const current = $derived(index < candidates.length ? candidates[index] : null);

  // Al quedarse sin nada que mostrar, preguntar si el original está guardado.
  $effect(() => {
    if (current !== null) return;
    const id = untrack(() => image.id);
    let cancelled = false;
    checkMasterStored(recordsApi.getImageFileUrl(id)).then((r) => {
      if (!cancelled) master = r;
    });
    return () => { cancelled = true; };
  });

  function handleError() {
    const c = current;
    // 'original' (no RAW): se deja como estaba antes de NEH-139.
    if (!c || c.kind === 'original') return;
    index += 1;
  }
</script>

{#if current}
  {@render children(current.url, handleError)}
  {#if current.kind === 'preview'}
    <span class="raw-badge" title={$m.raw_preview_hint}>{$m.raw_preview_badge}</span>
  {:else if current.kind === 'thumbnail'}
    <span class="raw-badge" title={$m.raw_thumbnail_hint}>{$m.raw_thumbnail_badge}</span>
  {/if}
{:else if master === 'missing'}
  <div class="raw-state" data-testid="raw-missing">
    <span class="material-symbols-outlined icon-lg">image_not_supported</span>
    <span class="raw-filename">{image.filename}</span>
    <span>{$m.image_file_missing}</span>
  </div>
{:else}
  <div class="raw-state" data-testid="raw-unviewable">
    <span class="material-symbols-outlined icon-lg">raw_on</span>
    <strong>{$m.raw_unviewable_title}</strong>
    <span class="raw-filename">{image.filename}</span>
    <span>{$m.raw_unviewable_body}</span>
    {#if master === 'stored'}
      <span>{$m.raw_original_stored}</span>
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

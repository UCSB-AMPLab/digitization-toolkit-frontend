<script lang="ts">
  // ============================================================================
  // COMPONENTE: RecordImageDisplay (NEH-139)
  //
  // Decide qué se muestra de una imagen de registro en un visor de inspección
  // y deja que el visor pinte el <img> con su propio snippet (así conserva sus
  // clases con alcance, su transform de pan/zoom y sus bind:naturalWidth).
  //
  // Candidatos, en orden (ver displayCandidates en $lib/image-display):
  //   - JPEG/PNG/WebP: /preview (el máster mismo), luego /thumbnail.
  //   - RAW: /preview (su vista previa JPEG), luego /thumbnail.
  //   - Otro formato (TIFF): solo /thumbnail; /preview responde 404.
  // Si el <img> no carga un candidato se pasa al siguiente. Sin candidatos,
  // un estado explícito con el nombre del archivo — nunca el ícono de imagen
  // rota, que invita a retomar. En ese estado se pregunta a /file si el
  // original está en el disco, y solo si el backend lo confirma se dice que
  // está guardado. La URL de /file nunca va en un <img>: para un RAW son
  // bytes RAW. La vista previa y la miniatura llevan una etiqueta.
  //
  // Un archivo liberado de la tarjeta (NEH-248) responde 410 con un cuerpo que
  // dice que está en la copia externa. El <img> no dice por qué falló, así que
  // al fallar /preview se le vuelve a preguntar con fetch (probeFreed). Si está
  // liberado, se muestra un aviso tranquilo sobre la miniatura, o solo, si no
  // hay miniatura: está fuera del equipo, no se perdió nada y un administrador
  // puede restaurar el volumen. Nunca como faltante ni como error. Un formato
  // que solo se muestra por su miniatura (TIFF) no pide /preview, así que ahí
  // decide el master_freed_at del registro (freedFromMetadata).
  // ============================================================================

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
    probeFreed,
    type FreedFile,
    type MasterCheck,
  } from '$lib/image-display';

  let {
    image,
    children,
  }: {
    image: Pick<RecordImage, 'id' | 'format' | 'filename' | 'master_freed_at' | 'preview_freed_at'>;
    /** Pinta el <img>: recibe la URL a mostrar y el handler de error. */
    children: Snippet<[string, () => void]>;
  } = $props();

  // Solo se vuelve a resolver si cambia la imagen, no cada vez que el padre
  // pasa un objeto nuevo con los mismos datos (p. ej. al recargar la lista).
  const imageKey = $derived(
    `${image.id}|${image.format}|${image.filename}|${image.master_freed_at ?? ''}|${image.preview_freed_at ?? ''}`,
  );

  const candidates = $derived.by(() => {
    void imageKey;
    return untrack(() => displayCandidates(image, recordsApi));
  });

  const raw = $derived.by(() => { void imageKey; return untrack(() => isRawImage(image)); });
  // Un formato que el navegador no muestra (TIFF): el texto lo nombra. Si el
  // formato sí se muestra (un JPEG que no cargó) o no se sabe, el texto es
  // genérico.
  const unsupportedExt = $derived.by(() => {
    void imageKey;
    return untrack(() => {
      const fmt = formatOf(image);
      return fmt && !isRawImage(image) && !isBrowserDisplayable(image) ? fmt.toUpperCase() : null;
    });
  });

  // Índice del candidato que se está mostrando; candidates.length = ninguno.
  let index = $state(0);
  let master = $state<MasterCheck | 'checking'>('checking');
  // El archivo liberado que describió el 410 de un candidato; null si no.
  let freed = $state<FreedFile | null>(null);
  // Cancela las consultas de probeFreed al cambiar de imagen o al desmontar.
  let probes: AbortController | null = null;

  $effect.pre(() => {
    void candidates;
    index = 0;
    master = 'checking';
    freed = untrack(() => freedFromMetadata(image));
    probes?.abort();
    probes = null;
  });

  $effect(() => () => probes?.abort());

  const current = $derived(index < candidates.length ? candidates[index] : null);

  // Al quedarse sin nada que mostrar, preguntar si el original está guardado.
  // Al desmontar o cambiar de imagen se aborta la petición en curso.
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
    // La miniatura de un archivo liberado sigue en el equipo; solo /preview
    // puede responder 410 por un archivo liberado que el visor iba a mostrar.
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
  <div class="freed-panel" class:freed-panel-over={overThumbnail} data-testid="image-freed" role="note">
    <span class="material-symbols-outlined freed-panel-icon" aria-hidden="true">archive</span>
    <strong class="freed-panel-title">{$m.freed_title}</strong>
    <span>{$m.freed_where}</span>
    <span>{$m.freed_nothing_lost}</span>
    <span>{$m.freed_restore_hint}</span>
    {#if overThumbnail}
      <span class="freed-panel-note">{$m.freed_thumbnail_note}</span>
    {/if}
  </div>
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

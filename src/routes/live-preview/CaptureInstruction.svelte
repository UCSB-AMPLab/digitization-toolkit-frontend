<script lang="ts">
  // The capture instruction (0.2.0): the notes of the volume's item on its
  // digitisation list ("117r, 116v; 193r, 192v", "from folio 49r to the
  // end"), labelled with the item's action, so that the operator has them in
  // view while shooting. A band in the page flow between the top bar and the
  // capture area: it takes its own height and never lies over the preview or
  // the controls.
  //
  // Collapsed, the notes show at most two lines and the band stays under
  // 15vh, so on the 800x480 kiosk the preview keeps nearly all its room.
  // When the notes run longer, "Mostrar todo" opens the whole text and
  // "Mostrar menos" closes it again. Open, the band scrolls inside a cap
  // that leaves the top bar, a minimum preview height, the capture button
  // and the thumbnail strip on screen (--ci-expanded-max). Without an
  // instruction, nothing is drawn.
  //
  // Version: 0.2.0

  import { m } from '$lib/i18n';
  import { actionLabel } from '$lib/queue-labels';
  import type { CaptureInstruction } from '$lib/queue';

  let { instruction }: { instruction: CaptureInstruction | null } = $props();

  let label = $derived(
    instruction ? (instruction.action ? actionLabel($m, instruction.action) : $m.lv_instruction_label) : ''
  );

  let expanded = $state(false);
  // Whether the collapsed notes are cut, so that the toggle is worth showing.
  let overflows = $state(false);
  let notesEl = $state<HTMLParagraphElement | null>(null);

  // A new instruction starts collapsed.
  $effect(() => {
    instruction;
    expanded = false;
  });

  // Measured while collapsed, and again whenever the band's width changes.
  $effect(() => {
    const el = notesEl;
    instruction;
    if (!el) { overflows = false; return; }
    const measure = () => {
      if (!expanded) overflows = el.scrollHeight > el.clientHeight + 1;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

{#if instruction}
  <div class="capture-instruction" class:expanded role="note" aria-labelledby="capture-instruction-label">
    <div class="ci-body">
      <span id="capture-instruction-label" class="ci-label">{label}</span>
      {#if instruction.notes}
        <p bind:this={notesEl} id="capture-instruction-notes" class="ci-notes" class:clamped={!expanded}>{instruction.notes}</p>
      {/if}
    </div>
    {#if instruction.notes && (overflows || expanded)}
      <button
        type="button"
        class="ci-toggle"
        aria-expanded={expanded}
        aria-controls="capture-instruction-notes"
        onclick={() => (expanded = !expanded)}
      >
        {expanded ? $m.lv_instruction_show_less : $m.lv_instruction_show_all}
      </button>
    {/if}
  </div>
{/if}

<style>
  .capture-instruction {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    max-height: 15vh;
    overflow: hidden;
    padding: 6px 16px;
    box-sizing: border-box;
    background-color: var(--color-surface);
    border-bottom: 1px solid var(--border-color);
    border-left: 4px solid var(--color-highlight);
  }
  /* Open, the band takes what the rest of the screen can spare: the full
     height less the top bar (72px, TopBar.svelte), the thumbnail strip
     (140px, .thumbnail-area in app.css) and a minimum preview of 150px,
     which holds the capture button (60px, 24px off the viewport's bottom
     edge, inside 16px of padding) with room above it. At 800x480 that is
     118px; never less than the collapsed 15vh. */
  .capture-instruction.expanded {
    --ci-expanded-max: max(15vh, calc(100vh - 72px - 140px - 150px));
    max-height: var(--ci-expanded-max);
    overflow-y: auto;
  }

  .ci-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }

  .ci-label {
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-highlight);
  }

  .ci-notes {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.35;
    color: var(--color-light);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ci-notes.clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .ci-toggle {
    flex-shrink: 0;
    align-self: center;
    min-height: var(--touch-target-min);
    padding: 0 14px;
    border: 1px solid var(--color-highlight);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-highlight);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    white-space: nowrap;
    cursor: pointer;
  }
  .ci-toggle:hover,
  .ci-toggle:focus-visible { background-color: var(--color-highlight); color: var(--color-bg); outline: none; }
</style>

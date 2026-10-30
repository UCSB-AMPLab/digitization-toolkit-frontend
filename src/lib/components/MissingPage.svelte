<script lang="ts">
  // The page of a dual opening that only one camera photographed (0.3.2,
  // `missing_side` on the record): an empty frame, dashed and muted, that
  // says the page was not captured. It fills the box it is put in, which
  // stands where that side's image would, left before right; the image that
  // exists keeps its own side. The views that show a record's images (the
  // capture screen's modal, the gallery's modal, the spread and the grid
  // tile) draw it.
  //
  // Version: 0.3.2

  import { m } from '$lib/i18n';
  import type { MissingSide } from '$lib/api';

  let { side }: { side: MissingSide } = $props();
</script>

<div class="missing-page" data-missing-side={side}>
  <span class="missing-page-text">{$m.missing_page}</span>
</div>

<style>
  .missing-page {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-alt);
  }
  .missing-page-text {
    font-size: var(--text-sm);
    line-height: 1.4;
    text-align: center;
    color: var(--color-light-grey);
    overflow-wrap: anywhere;
  }
</style>

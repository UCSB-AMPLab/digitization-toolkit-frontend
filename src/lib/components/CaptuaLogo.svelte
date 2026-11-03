<script lang="ts">
  // The Captua logo: the seedling (option 4, seed leaves spread) alone or
  // beside the outlined wordmark, with or without the "Digitization Toolkit"
  // descriptor. The descriptor is outlined into the artwork, so its asset
  // follows the locale.
  //
  // The artwork stays in its own SVG files and is drawn here with <use>, so
  // it inherits `color` like inline SVG does (an <img> would not) without
  // putting several hundred kilobytes of path data into the JS bundle. The
  // inks come from `--logo-seedling-ink` and `--logo-wordmark-ink` in
  // app.css, which default to the current brand tokens; a new palette is a
  // change to those two properties, not to the artwork.
  //
  // `weight` picks the thin or thick ink drawing. Thick holds up better when
  // the seedling is drawn below about 90px tall; thin keeps the finer drawing
  // above that.
  //
  // Version: 0.1.0

  import { locale } from '$lib/i18n';
  import seedlingThin from '$lib/assets/brand/captua-seedling-thin.svg';
  import seedlingThick from '$lib/assets/brand/captua-seedling-thick.svg';
  import wordmarkPlain from '$lib/assets/brand/captua-wordmark.svg';
  import wordmarkEn from '$lib/assets/brand/captua-wordmark-descriptor-en.svg';
  import wordmarkEs from '$lib/assets/brand/captua-wordmark-descriptor-es.svg';

  type Wordmark = 'none' | 'plain' | 'descriptor';

  let {
    wordmark = 'plain',
    weight = 'thick',
    layout = 'beside',
    label = 'Captua',
    class: className = '',
  }: {
    wordmark?: Wordmark;
    // 'beside' is the designer's horizontal lockup; 'stacked' puts the
    // seedling large and centred above the wordmark.
    layout?: 'beside' | 'stacked';
    weight?: 'thin' | 'thick';
    // An empty label hides the logo from assistive technology, for a mark
    // that sits next to text already naming Captua.
    label?: string;
    class?: string;
  } = $props();

  // Geometry of the supplied horizontal lockup (460 x 160): the seedling is
  // 130 units high at the left edge, and the wordmark starts 30 units after
  // it at y 34.24, scaled to 0.862. The seedling is raised from the
  // designer's y 15.08 to y 5.11, so that the middle of its ink sits on the
  // middle of the wordmark's x-height (baseline to x-height top, leaving out
  // the rising T and the descending p). The view box, y 6 to 134, keeps the
  // seedling's ink and the descriptor and drops the empty margin.
  const SEEDLING_BOX = 824;
  const SEEDLING_SIZE = 130;
  const SEEDLING_Y = 5.11;
  const VIEW_Y = 6;
  const VIEW_HEIGHT = 128;
  const WORDMARK_X = 160;
  const WORDMARK_Y = 34.2414;
  const WORDMARK_SCALE = 0.862069;

  // View box of each wordmark file. The descriptor files keep the wordmark
  // at the same size and position and add the descriptor below its baseline.
  const WORDMARKS = {
    plain: { href: wordmarkPlain, width: 348, height: 105 },
    en: { href: wordmarkEn, width: 349, height: 107 },
    es: { href: wordmarkEs, width: 348, height: 107 },
  };

  const seedling = $derived(weight === 'thin' ? seedlingThin : seedlingThick);

  const word = $derived(
    wordmark === 'plain'
      ? WORDMARKS.plain
      : wordmark === 'descriptor'
        ? WORDMARKS[$locale === 'en' ? 'en' : 'es']
        : null
  );

  const wordWidth = $derived(word ? word.width * WORDMARK_SCALE : 0);
  const wordHeight = $derived(word ? word.height * WORDMARK_SCALE : 0);

  const viewBox = $derived(
    word
      ? `0 ${VIEW_Y} ${WORDMARK_X + wordWidth} ${VIEW_HEIGHT}`
      : `0 0 ${SEEDLING_BOX} ${SEEDLING_BOX}`
  );

  // The stacked lockup, in wordmark units: the seedling 240 units square,
  // its ink (centred in its own box) centred over a 349-unit width, and
  // below it the wordmark at 0.85, centred, 15 units under the seedling's box.
  const STACK = {
    width: 349,
    height: 346,
    viewY: 2,
    seedlingX: 54.5,
    seedlingSize: 240,
    wordX: 26.6,
    wordY: 255,
    wordScale: 0.85,
  };
  const stacked = $derived(layout === 'stacked' && word !== null);

  // A natural size, as an <img> has, so that `width: 100%` with a
  // `max-width` sizes the logo the same way inside a shrink-to-fit parent.
  const width = $derived(word ? WORDMARK_X + wordWidth : SEEDLING_SIZE);
  const height = $derived(word ? VIEW_HEIGHT : SEEDLING_SIZE);
</script>

<svg
  class="captua-logo {className}"
  viewBox={stacked ? `0 ${STACK.viewY} ${STACK.width} ${STACK.height}` : viewBox}
  width={stacked ? STACK.width : width}
  height={stacked ? STACK.height : height}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  {#if stacked && word}
    <use
      class="seedling"
      href="{seedling}#captua-seedling"
      x={STACK.seedlingX}
      y="0"
      width={STACK.seedlingSize}
      height={STACK.seedlingSize}
    />
    <g transform="translate({STACK.wordX} {STACK.wordY}) scale({STACK.wordScale})">
      <use
        class="wordmark"
        href="{word.href}#captua-wordmark"
        width={word.width}
        height={word.height}
      />
    </g>
  {:else if word}
    <use
      class="seedling"
      href="{seedling}#captua-seedling"
      x="0"
      y={SEEDLING_Y}
      width={SEEDLING_SIZE}
      height={SEEDLING_SIZE}
    />
    <use
      class="wordmark"
      href="{word.href}#captua-wordmark"
      x={WORDMARK_X}
      y={WORDMARK_Y}
      width={wordWidth}
      height={wordHeight}
    />
  {:else}
    <use
      class="seedling"
      href="{seedling}#captua-seedling"
      width={SEEDLING_BOX}
      height={SEEDLING_BOX}
    />
  {/if}
</svg>

<style>
  .captua-logo {
    display: block;
    overflow: visible;
  }

  .seedling {
    color: var(--logo-seedling-ink);
  }

  .wordmark {
    color: var(--logo-wordmark-ink);
  }
</style>

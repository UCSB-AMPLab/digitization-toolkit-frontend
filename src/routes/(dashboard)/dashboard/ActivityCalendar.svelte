<script lang="ts">
  // Activity calendar: images captured or records reviewed per day over the
  // last six months (182 days, GET /activity/daily).
  //
  // Version: 0.1.0-beta
  import { onMount, tick } from 'svelte';
  import { activityApi, browserTimeZone, type DailyActivity } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { STORAGE_KEYS, readStored, writeStored } from '$lib/storage-keys';
  import { buildGrid, moveFocus, parseLocalDate, WEEKS, type CalendarMetric } from '$lib/activity-calendar';

  type View = 'captures' | 'reviews';
  const VIEW_KEY = STORAGE_KEYS.activityView;
  const DAYS = 182;

  let view = $state<View>('captures');
  let series = $state<DailyActivity[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let focused = $state<number | null>(null);
  let hovered = $state<number | null>(null);
  let gridEl = $state<HTMLElement | null>(null);

  // 'es' alone leaves four-digit numbers ungrouped; es-CO groups them (1.212).
  let tag = $derived($locale === 'es' ? 'es-CO' : $locale);
  let metric = $derived<CalendarMetric>(view === 'captures' ? 'captured_images' : 'reviewed_records');
  let grid = $derived(buildGrid(series, metric));
  // Without a focus or a hover the line describes the last day, today.
  let shown = $derived(hovered ?? focused ?? grid.days.length - 1);
  let tabStop = $derived(focused ?? grid.days.length - 1);

  function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
    return parseLocalDate(value).toLocaleDateString(tag, options);
  }
  const longDate = (value: string) => formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' });

  function monthName(year: number, month: number): string {
    // Plain 'es' here: es-CO writes 'ene.', and the weekday labels beside
    // the map carry no full stop.
    return new Date(year, month, 1).toLocaleDateString($locale, { month: 'short' });
  }

  function dayLine(index: number): string {
    const day = grid.days[index];
    if (!day) return '';
    return view === 'captures'
      ? $m.dash_cal_day_captures(day.count, longDate(day.date))
      : $m.dash_cal_day_reviews(day.count, longDate(day.date));
  }

  function cellLabel(index: number): string {
    return dayLine(index);
  }

  async function load() {
    loading = true;
    failed = false;
    try {
      series = await activityApi.daily(DAYS, browserTimeZone(), new Date().getTimezoneOffset());
    } catch (err) {
      console.error('[Dashboard] Activity error:', err);
      failed = true;
    } finally {
      loading = false;
    }
  }

  function chooseView(next: View) {
    view = next;
    writeStored(VIEW_KEY, next);
  }

  onMount(() => {
    const stored = readStored(VIEW_KEY);
    if (stored === 'captures' || stored === 'reviews') view = stored;
    load();
  });

  async function onKeydown(event: KeyboardEvent, index: number) {
    const next = moveFocus(index, event.key, grid.days.length, lead);
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    focused = next;
    await tick();
    gridEl?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  }

  // Slot position within the flat day list, for a week column and weekday row.
  // Leading empty slots exist only when the series is shorter than WEEKS weeks.
  let lead = $derived(grid.weeks.length > 0 ? grid.weeks[0].findIndex((d) => d !== null) : 0);
  const indexOf = (week: number, row: number) => week * 7 + row - lead;
</script>

<div class="activity">
  <div class="act-head">
    <div class="act-titles">
      <h2 class="act-title">{$m.dash_cal_title}</h2>
      <p class="act-subtitle">
        {view === 'captures' ? $m.dash_cal_subtitle_captures : $m.dash_cal_subtitle_reviews}
      </p>
    </div>
    <div class="act-switch" role="group" aria-label={$m.dash_cal_view}>
      <button type="button" aria-pressed={view === 'captures'} onclick={() => chooseView('captures')}>
        {$m.dash_cal_view_captures}
      </button>
      <button type="button" aria-pressed={view === 'reviews'} onclick={() => chooseView('reviews')}>
        {$m.dash_cal_view_reviews}
      </button>
    </div>
  </div>

  {#if failed}
    <div class="act-card act-error" role="alert">
      <span>{$m.dash_cal_error}</span>
      <button type="button" class="btn btn-ghost" onclick={load}>{$m.common_retry}</button>
    </div>
  {:else if loading}
    <div class="act-card act-loading" role="status">{$m.common_loading_ellipsis}</div>
  {:else}
    <div class="act-card">
      <div class="act-scroll">
        <div class="act-map">
          <div class="act-months" aria-hidden="true">
            {#each grid.months as mo (mo.column)}
              <span style="grid-column: {mo.column + 1}">{monthName(mo.year, mo.month)}</span>
            {/each}
          </div>
          <div class="act-body">
            <div class="act-weekdays" aria-hidden="true">
              <span>{$m.dash_cal_weekday_mon}</span><span></span>
              <span>{$m.dash_cal_weekday_wed}</span><span></span>
              <span>{$m.dash_cal_weekday_fri}</span><span></span><span></span>
            </div>
            <div
              class="act-grid"
              role="grid"
              tabindex="-1"
              bind:this={gridEl}
              aria-label={view === 'captures' ? $m.dash_cal_map_captures : $m.dash_cal_map_reviews}
              onmouseleave={() => (hovered = null)}
              onfocusout={(e) => {
                if (!gridEl?.contains(e.relatedTarget as Node | null)) focused = null;
              }}
            >
              {#each [0, 1, 2, 3, 4, 5, 6] as row (row)}
                <div class="act-row" role="row">
                  {#each grid.weeks as week, w (w)}
                    {@const day = week[row]}
                    {#if day}
                      {@const i = indexOf(w, row)}
                      <div
                        role="gridcell"
                        class="act-cell level-{day.level}"
                        class:is-shown={i === shown}
                        data-index={i}
                        data-date={day.date}
                        tabindex={i === tabStop ? 0 : -1}
                        aria-label={cellLabel(i)}
                        onfocus={() => (focused = i)}
                        onmouseenter={() => (hovered = i)}
                        onkeydown={(e) => onKeydown(e, i)}
                      ></div>
                    {:else}
                      <div role="gridcell" class="act-cell is-empty" aria-hidden="true"></div>
                    {/if}
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div class="act-foot">
        <p class="act-day">{dayLine(shown)}</p>
        <div class="act-legend" aria-hidden="true">
          <span>{$m.dash_cal_less}</span>
          {#each [0, 1, 2, 3, 4] as level (level)}<span class="act-swatch act-cell level-{level}"></span>{/each}
          <span>{$m.dash_cal_more}</span>
        </div>
      </div>
    </div>

    <div class="act-figures">
      <div class="act-card act-figure">
        <span class="act-figure-label">{view === 'captures' ? $m.dash_cal_days_captures : $m.dash_cal_days_reviews}</span>
        <span class="act-figure-number">{grid.activeDays.toLocaleString(tag)}</span>
      </div>
      <div class="act-card act-figure">
        <span class="act-figure-label">{view === 'captures' ? $m.dash_cal_total_captures : $m.dash_cal_total_reviews}</span>
        <span class="act-figure-number">{grid.total.toLocaleString(tag)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .activity { margin-bottom: 36px; display: flex; flex-direction: column; gap: 16px; }
  .act-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .act-titles { min-width: 0; }
  .act-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 4px; }
  .act-subtitle { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); }

  .act-switch {
    display: flex; gap: 4px; padding: 4px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface-alt-2);
    border: 1px solid var(--border-color);
  }
  .act-switch button {
    min-height: 36px; padding: 0 16px; border: none; border-radius: var(--radius-full);
    background: transparent; color: var(--color-light-grey);
    font: inherit; font-weight: var(--fw-bold); cursor: pointer;
  }
  .act-switch button[aria-pressed='true'] { background-color: var(--color-light); color: var(--color-bg); }
  .act-switch button:focus-visible { outline: 2px solid var(--color-primary-focus); outline-offset: 2px; }

  .act-card {
    display: flex; flex-direction: column; gap: 12px; padding: 20px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
  }
  .act-error { flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; color: var(--color-error); }
  .act-loading { color: var(--color-light-grey); }

  /* The map scrolls inside its card, never the page. */
  .act-scroll { overflow-x: auto; padding-bottom: 4px; }
  .act-map { display: flex; flex-direction: column; gap: 8px; width: max-content; }
  .act-months, .act-grid { --cell: 18px; --gap: 4px; }
  .act-months {
    display: grid; grid-template-columns: repeat(26, var(--cell)); column-gap: var(--gap);
    margin-left: 36px; height: 16px;
    font-size: var(--text-sm); color: var(--color-light-grey);
  }
  .act-months span { white-space: nowrap; }
  .act-body { display: flex; gap: 8px; }
  .act-weekdays {
    display: flex; flex-direction: column; gap: 4px; width: 28px;
    font-size: var(--text-sm); color: var(--color-light-grey);
  }
  .act-weekdays span { height: 18px; line-height: 18px; }
  .act-grid { display: flex; flex-direction: column; gap: var(--gap); }
  .act-row { display: flex; gap: var(--gap); }

  .act-cell { width: 18px; height: 18px; flex-shrink: 0; border-radius: 4px; box-sizing: border-box; }
  .act-cell.is-empty { background: transparent; }
  .level-0 { background-color: var(--color-surface-alt-2); border: 1px solid var(--border-color); }
  .level-1 { background-color: color-mix(in srgb, var(--color-primary) 25%, transparent); }
  .level-2 { background-color: color-mix(in srgb, var(--color-primary) 45%, transparent); }
  .level-3 { background-color: color-mix(in srgb, var(--color-primary) 70%, transparent); }
  .level-4 { background-color: var(--color-primary); }
  .act-grid .act-cell:not(.is-empty) { cursor: default; }
  .act-cell.is-shown { box-shadow: 0 0 0 2px var(--color-selected); }
  .act-cell:focus-visible { outline: 2px solid var(--color-selected); outline-offset: 2px; }
  .act-swatch { width: 14px; height: 14px; border-radius: 3px; }

  .act-foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .act-day { margin: 0; font-weight: var(--fw-bold); }
  .act-legend { display: flex; align-items: center; gap: 4px; font-size: var(--text-sm); color: var(--color-light-grey); }
  .act-legend span:first-child { margin-right: 4px; }
  .act-legend span:last-child { margin-left: 4px; }

  .act-figures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-width: 560px; }
  .act-figure { gap: 4px; padding: 16px; }
  .act-figure-label {
    font-size: var(--text-sm); font-weight: var(--fw-bold); letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--color-light-grey);
  }
  .act-figure-number { font-size: 28px; font-weight: var(--fw-black); font-variant-numeric: tabular-nums; }
</style>

<script lang="ts">
  // The volume form's "Raíz" field (filename_stem). Checks the value against
  // the backend's rule as the operator types (src/lib/volume-stem.ts), and
  // shows the field read-only, with the reason, once the stem is reserved:
  // the volume has a stem and has captured, so the backend refuses any change.
  // In Fisqua mode (NEH-311) the form gives it another label, another reason
  // for a locked field, and the backend's refusal of a code, shown under the
  // field as the others are.
  //
  // With `search` (NEH-321: a new volume in Fisqua mode, not kept on the
  // unit) the field is also a combobox over Fisqua's descriptions
  // (src/lib/description-search.ts): the matches in a list under it, chosen
  // by tap or by the arrow keys and Enter, closed with Esc. Choosing one
  // fills the field with its reference code and tells the form (`onchoose`).
  // The admin can still type a whole code; saving checks it as before.
  //
  // Version: 0.3.3
  import { onDestroy, untrack } from 'svelte';
  import { m } from '$lib/i18n';
  import { fisquaApi } from '$lib/api';
  import { createDescriptionSearch, matchMeta, type DescriptionMatch, type SearchView } from '$lib/description-search';
  import { stemProblem, stemProblemText } from '$lib/volume-stem';

  let {
    value = $bindable(''),
    locked = false,
    required = false,
    label,
    lockedNote,
    serverError = null,
    search = false,
    onchoose,
  }: {
    value?: string;
    // stem_reserved on the volume being edited.
    locked?: boolean;
    // True on a new volume: the backend requires a stem at creation.
    required?: boolean;
    // The field's label; the plain stem label when not given.
    label?: string;
    // Why the field is locked, when not because the stem is reserved.
    lockedNote?: string;
    // A refusal of the value from the backend, already translated.
    serverError?: string | null;
    // Search Fisqua's descriptions as the admin types (NEH-321).
    search?: boolean;
    // A match the admin chose; the field already holds its code.
    onchoose?: (match: DescriptionMatch) => void;
  } = $props();

  const inputId = 'volume-stem-input';
  const helpId = 'volume-stem-help';
  const errorId = 'volume-stem-error';
  const listId = 'volume-stem-matches';
  const statusId = 'volume-stem-search-status';
  const optionId = (i: number) => `volume-stem-match-${i}`;

  // The search (NEH-321).
  const idle: SearchView = { state: 'idle', results: [] };
  let view = $state<SearchView>(idle);
  let open = $state(false);
  let active = $state(-1);
  let listEl = $state<HTMLUListElement | null>(null);
  // The code a choice put in the field, which is not searched again.
  let chosen: string | null = null;
  const searcher = createDescriptionSearch(
    (q, signal) => fisquaApi.searchDescriptions(q, signal),
    (next) => {
      view = next;
      open = next.state === 'results';
      active = -1;
    }
  );

  $effect(() => {
    const current = value;
    const on = search;
    untrack(() => {
      if (!on) {
        searcher.cancel();
        view = idle;
        open = false;
        active = -1;
        return;
      }
      if (chosen !== null && current === chosen) return;
      chosen = null;
      searcher.input(current);
    });
  });
  onDestroy(() => searcher.cancel());

  let expanded = $derived(search && open && view.results.length > 0);
  let searchLine = $derived(
    !search ? null
      : view.state === 'searching' ? $m.pd_search_searching
      : view.state === 'none' ? $m.pd_search_none
      : view.state === 'unavailable' ? $m.pd_search_unavailable
      : null
  );

  function choose(match: DescriptionMatch) {
    // A search still waiting for its 400 ms, from typing just before, would reopen the list.
    searcher.cancel();
    chosen = match.referenceCode;
    value = match.referenceCode;
    touched = true;
    open = false;
    active = -1;
    view = idle;
    onchoose?.(match);
  }

  function show(index: number) {
    active = index;
    listEl?.querySelector(`#${optionId(index)}`)?.scrollIntoView({ block: 'nearest' });
  }

  function onKeydown(event: KeyboardEvent) {
    if (!search) return;
    const count = view.results.length;
    if (event.key === 'ArrowDown') {
      if (count === 0) return;
      event.preventDefault();
      if (!open) {
        open = true;
        active = -1;
        return;
      }
      show(Math.min(active + 1, count - 1));
    } else if (event.key === 'ArrowUp') {
      if (!expanded) return;
      event.preventDefault();
      show(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      if (!expanded || active < 0) return;
      event.preventDefault();
      choose(view.results[active]);
    } else if (event.key === 'Escape') {
      if (!expanded) return;
      event.preventDefault();
      event.stopPropagation();
      open = false;
      active = -1;
    }
  }

  // An empty required field shows its message from the start, since it is
  // why the form's save button is disabled. It is announced (role="alert")
  // only once the operator has typed in the field or left it, so opening
  // the form does not interrupt a screen reader.
  let touched = $state(false);

  let shownProblem = $derived(locked ? null : stemProblem(value, required));
  let announce = $derived(shownProblem !== 'required' || touched);
  // The value's own problem first; the backend's refusal when it has none.
  let shownServerError = $derived(shownProblem ? null : serverError);
  let invalid = $derived((shownProblem !== null && announce) || !!shownServerError);
</script>

<div class="form-field">
  <label class="field-label" for={inputId}>
    {label ?? $m.pd_field_stem}
    {#if required}<span class="field-required">*</span>{/if}
  </label>
  <input
    id={inputId}
    class="field-input"
    class:field-input--error={invalid}
    class:field-input--locked={locked}
    type="text"
    placeholder={locked ? undefined : $m.pd_ph_stem}
    bind:value
    readonly={locked}
    aria-readonly={locked}
    required={required && !locked}
    aria-required={required && !locked}
    aria-invalid={invalid}
    aria-describedby={shownProblem || shownServerError ? `${helpId} ${errorId}` : helpId}
    role={search ? 'combobox' : undefined}
    aria-autocomplete={search ? 'list' : undefined}
    aria-expanded={search ? expanded : undefined}
    aria-controls={search ? listId : undefined}
    aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    oninput={() => (touched = true)}
    onkeydown={onKeydown}
    onblur={() => { touched = true; open = false; active = -1; }}
  />
  {#if expanded}
    <!-- Pressing the list (its scrollbar too) keeps the focus in the field. -->
    <ul
      class="matches"
      id={listId}
      role="listbox"
      aria-label={$m.pd_search_list_label}
      bind:this={listEl}
      onmousedown={(e) => e.preventDefault()}
    >
      {#each view.results as match, i (i)}
        {@const meta = matchMeta(match, $m)}
        <!-- The keyboard reaches the options through the field (aria-activedescendant). -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id={optionId(i)}
          class="match"
          class:match--active={i === active}
          role="option"
          aria-selected={i === active}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => choose(match)}
        >
          <div class="match-row">
            <span class="match-code">{match.referenceCode}</span>
            {#if meta}<span class="match-meta">{meta}</span>{/if}
          </div>
          {#if match.title}<div class="match-title">{match.title}</div>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <!-- The live region, rendered all along so each change is announced: the
       visible line, and the number of matches for screen readers only. -->
  <p class="search-line" class:search-line--empty={!searchLine} id={statusId} role="status">
    {#if searchLine}{searchLine}{/if}
    {#if expanded}<span class="visually-hidden">{$m.pd_search_count(view.results.length)}</span>{/if}
  </p>
  {#if locked}
    <p class="stem-note stem-note--locked" id={helpId}>
      <span class="material-symbols-outlined icon-sm" aria-hidden="true">lock</span>
      {lockedNote ?? $m.pd_stem_locked}
    </p>
  {:else}
    <p class="stem-note" id={helpId}>{search ? $m.pd_stem_search_help : $m.pd_stem_help}</p>
  {/if}
  {#if shownProblem}
    <p class="stem-error" id={errorId} role={announce ? 'alert' : undefined}>{stemProblemText(shownProblem, $m)}</p>
  {:else if shownServerError}
    <p class="stem-error" id={errorId} role="alert">{shownServerError}</p>
  {/if}
</div>

<style>
  /* The form's field styles, as the project page defines them. */
  .form-field { display: flex; flex-direction: column; gap: 6px; }

  .field-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .field-required { color: var(--color-error); margin-left: 2px; }

  .field-input {
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 12px;
    outline: none;
    transition: border-color var(--transition-base);
    width: 100%;
    min-height: var(--touch-target-min);
  }
  .field-input:focus { border-color: var(--color-primary); }
  .field-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }
  .field-input--error { border-color: var(--color-error) !important; }
  .field-input--locked { color: var(--color-light-grey); cursor: default; }

  .stem-note {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 12px;
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.4;
  }

  /* The matches (NEH-321): inside the form's card, scrolling within it. */
  .matches {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 220px;
    overflow-y: auto;
    overscroll-behavior: contain;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .match {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    min-height: var(--touch-target-min);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-light);
  }

  .match:hover, .match--active { background-color: var(--color-surface-alt); }
  .match--active { outline: 1px solid var(--color-primary); outline-offset: -1px; }

  /* First row: the code, and on its right the dates and level, which go to
     a row of their own under the code when both do not fit. */
  .match-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    column-gap: 12px;
    row-gap: 2px;
  }

  .match-code {
    font-family: monospace;
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .match-meta {
    margin-left: auto;
    font-size: 12px;
    color: var(--color-light-grey);
    text-align: right;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .match-title {
    font-size: 12px;
    color: var(--color-light-grey);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .search-line {
    font-size: 12px;
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.4;
  }
  /* Empty, it takes no room: the field's 6px gap is given back. */
  .search-line--empty { margin-top: -6px; }

  .stem-error {
    font-size: 12px;
    color: var(--color-error);
    margin: 0;
    line-height: 1.4;
  }
</style>

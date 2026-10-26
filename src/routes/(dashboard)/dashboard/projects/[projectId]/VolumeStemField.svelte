<script lang="ts">
  // The volume form's "Raíz" field (filename_stem). Checks the value against
  // the backend's rule as the operator types (src/lib/volume-stem.ts), and
  // shows the field read-only, with the reason, once the stem is reserved:
  // the volume has a stem and has captured, so the backend refuses any change.
  //
  // Version: 0.1.0-beta
  import { m } from '$lib/i18n';
  import { stemProblem, stemProblemText } from '$lib/volume-stem';

  let {
    value = $bindable(''),
    locked = false,
    required = false,
  }: {
    value?: string;
    // stem_reserved on the volume being edited.
    locked?: boolean;
    // True on a new volume: the backend requires a stem at creation.
    required?: boolean;
  } = $props();

  const inputId = 'volume-stem-input';
  const helpId = 'volume-stem-help';
  const errorId = 'volume-stem-error';

  // An empty required field shows its message from the start, since it is
  // why the form's save button is disabled. It is announced (role="alert")
  // only once the operator has typed in the field or left it, so opening
  // the form does not interrupt a screen reader.
  let touched = $state(false);

  let shownProblem = $derived(locked ? null : stemProblem(value, required));
  let announce = $derived(shownProblem !== 'required' || touched);
</script>

<div class="form-field">
  <label class="field-label" for={inputId}>
    {$m.pd_field_stem}
    {#if required}<span class="field-required">*</span>{/if}
  </label>
  <input
    id={inputId}
    class="field-input"
    class:field-input--error={shownProblem !== null && announce}
    class:field-input--locked={locked}
    type="text"
    placeholder={locked ? undefined : $m.pd_ph_stem}
    bind:value
    readonly={locked}
    aria-readonly={locked}
    required={required && !locked}
    aria-required={required && !locked}
    aria-invalid={shownProblem !== null && announce}
    aria-describedby={shownProblem ? `${helpId} ${errorId}` : helpId}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    oninput={() => (touched = true)}
    onblur={() => (touched = true)}
  />
  {#if locked}
    <p class="stem-note stem-note--locked" id={helpId}>
      <span class="material-symbols-outlined icon-sm" aria-hidden="true">lock</span>
      {$m.pd_stem_locked}
    </p>
  {:else}
    <p class="stem-note" id={helpId}>{$m.pd_stem_help}</p>
  {/if}
  {#if shownProblem}
    <p class="stem-error" id={errorId} role={announce ? 'alert' : undefined}>{stemProblemText(shownProblem, $m)}</p>
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

  .stem-error {
    font-size: 12px;
    color: var(--color-error);
    margin: 0;
    line-height: 1.4;
  }
</style>

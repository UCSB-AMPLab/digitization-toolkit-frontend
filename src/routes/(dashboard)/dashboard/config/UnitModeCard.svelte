<script lang="ts">
  // Configuración → Modo del equipo (NEH-311, NEH-313), admin only as the
  // page is. The three modes as a radio group, each with its description;
  // Guardar is enabled only for a change. The projects switch is enabled only
  // with "Solo en el escáner" picked, and goes in the same PUT /system/unit,
  // which sends only what changed. Leaving Fisqua mode asks first, since
  // handovers not yet sent wait on the unit.
  //
  // A refused switch (409) shows each problem as a translated line and the
  // mode the unit stays in, with Cancelar (back to the stored mode) and
  // Reintentar. `mode_changed` means another admin changed the
  // settings meanwhile: the state is read again, the selection goes back to
  // the stored mode, and a line says so, with no retry, so the admin picks
  // again and Guardar runs as usual (the leave-Fisqua confirmation
  // included). The backend's English is never shown.
  //
  // GET /system/unit does not say who set the mode or when, so the board's
  // "set by" line is left out.
  //
  // Version: 0.3.3

  import { onMount } from 'svelte';
  import { m } from '$lib/i18n';
  import { systemApi } from '$lib/api';
  import { dismissible, toBody } from '$lib/dialog';
  import {
    UNIT_MODES, ensureUnit, keepUnitState, modeLabel, modeRefusal, reloadUnit, unitProblemText, unitState,
    type UnitMode
  } from '$lib/unit-mode';

  let loaded = $state(false);
  let selected = $state<UnitMode | null>(null);
  let projectsEnabled = $state(false);
  let saving = $state(false);
  let confirmOpen = $state(false);
  let saveError = $state(false);
  // Another admin changed the settings meanwhile (mode_changed).
  let changedElsewhere = $state(false);
  // A refused switch: the mode asked for and the problem codes.
  let refusal = $state<{ target: UnitMode; codes: string[] } | null>(null);

  onMount(async () => {
    await ensureUnit();
    loaded = true;
  });

  // Each state read (on load, after a save, after mode_changed) resets the
  // form to it.
  $effect(() => {
    const s = $unitState;
    if (!s) return;
    selected = s.mode;
    projectsEnabled = s.projectsEnabled;
  });

  const descriptions = $derived<{ [K in UnitMode]: string }>({
    offline: $m.unit_mode_offline_desc,
    backup: $m.unit_mode_backup_desc,
    fisqua: $m.unit_mode_fisqua_desc,
  });

  let modeChanged = $derived(!!$unitState && selected !== null && selected !== $unitState.mode);
  let projectsChanged = $derived(
    !!$unitState && selected === 'offline' && projectsEnabled !== $unitState.projectsEnabled
  );
  let canSave = $derived((modeChanged || projectsChanged) && !saving);

  function pick(mode: UnitMode) {
    selected = mode;
    refusal = null;
    saveError = false;
    changedElsewhere = false;
  }

  function onSave() {
    if (!canSave || !$unitState) return;
    if (modeChanged && $unitState.mode === 'fisqua') confirmOpen = true;
    else submit();
  }

  async function submit() {
    if (!$unitState || selected === null) return;
    confirmOpen = false;
    const body: { mode?: UnitMode; projectsEnabled?: boolean } = {};
    if (modeChanged) body.mode = selected;
    if (projectsChanged) body.projectsEnabled = projectsEnabled;
    if (Object.keys(body).length === 0) return;
    const target = selected;
    saving = true;
    saveError = false;
    changedElsewhere = false;
    refusal = null;
    try {
      keepUnitState(await systemApi.setUnit(body));
    } catch (err) {
      console.error('[UnitMode] Change refused:', err);
      const codes = modeRefusal(err);
      if (codes?.includes('mode_changed')) {
        const fresh = await reloadUnit();
        if (fresh) {
          selected = fresh.mode;
          projectsEnabled = fresh.projectsEnabled;
        }
        changedElsewhere = true;
      } else if (codes) {
        refusal = { target, codes };
      } else {
        saveError = true;
      }
    } finally {
      saving = false;
    }
  }

  function cancelRefusal() {
    refusal = null;
    if ($unitState) {
      selected = $unitState.mode;
      projectsEnabled = $unitState.projectsEnabled;
    }
  }
</script>

<p class="unit-desc">{$m.unit_section_desc}</p>

{#if loaded && !$unitState}
  <p class="unit-load-error" role="alert">{$m.unit_err_load}</p>
{:else if $unitState}
  <div class="unit-card">
    <fieldset class="unit-modes">
      <legend class="unit-legend">{$m.unit_mode_legend}</legend>
      {#each UNIT_MODES as mode (mode)}
        <label class="unit-mode" class:is-selected={selected === mode}>
          <input
            type="radio"
            name="unit-mode"
            value={mode}
            checked={selected === mode}
            disabled={saving}
            onchange={() => pick(mode)}
          />
          <span class="unit-mode-text">
            <span class="unit-mode-name">
              {modeLabel(mode, $m)}
              {#if refusal && mode === $unitState.mode}
                <span class="unit-current">{$m.unit_current}</span>
              {/if}
            </span>
            <span class="unit-mode-desc">{descriptions[mode]}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if refusal}
      <div class="unit-refused" role="alert">
        <strong>{$m.unit_refused_title(modeLabel(refusal.target, $m), modeLabel($unitState.mode, $m))}</strong>
        <ul>
          {#each refusal.codes as code, i (i)}
            <li>{unitProblemText(code, $m)}</li>
          {/each}
        </ul>
      </div>
      <div class="unit-actions">
        <button type="button" class="unit-btn-ghost" onclick={cancelRefusal} disabled={saving}>{$m.common_cancel}</button>
        <button type="button" class="unit-btn-save" onclick={submit} disabled={saving}>
          {saving ? $m.common_saving : $m.unit_try_again}
        </button>
      </div>
    {:else}
      {#if saveError}
        <p class="unit-save-error" role="alert">{$m.unit_err_save}</p>
      {:else if changedElsewhere}
        <p class="unit-save-error" role="alert">{$m.unit_problem_mode_changed}</p>
      {/if}
      <div class="unit-actions">
        <button type="button" class="unit-btn-save" onclick={onSave} disabled={!canSave}>
          {saving ? $m.common_saving : $m.common_save}
        </button>
      </div>
    {/if}
  </div>

  <div class="unit-card unit-projects" class:is-off={selected !== 'offline'}>
    <span class="unit-mode-text">
      <span class="unit-mode-name">{$m.unit_projects_title}</span>
      <span class="unit-mode-desc">{$m.unit_projects_desc}</span>
    </span>
    <label class="unit-projects-toggle">
      <input type="checkbox" bind:checked={projectsEnabled} disabled={selected !== 'offline' || saving} />
      <span>{$m.unit_projects_toggle}</span>
    </label>
  </div>
{/if}

{#if confirmOpen && selected}
  <div class="modal-backdrop" use:toBody use:dismissible={{ onDismiss: () => (confirmOpen = false) }}>
    <div class="modal-card dialog-fit" role="dialog" aria-modal="true" aria-labelledby="leave-fisqua-title" aria-describedby="leave-fisqua-desc">
      <h3 class="confirm-title" id="leave-fisqua-title">{$m.unit_leave_fisqua_title}</h3>
      <p class="confirm-desc" id="leave-fisqua-desc">{$m.unit_leave_fisqua_body}</p>
      <div class="modal-actions">
        <button type="button" class="unit-btn-ghost" onclick={() => (confirmOpen = false)}>{$m.common_cancel}</button>
        <button type="button" class="unit-btn-save" onclick={submit}>{$m.unit_leave_fisqua_confirm(modeLabel(selected, $m))}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .unit-desc { margin: -6px 0 14px; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.5; max-width: 760px; }
  .unit-load-error { margin: 0; font-size: var(--text-sm); color: var(--color-error); }

  .unit-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 20px;
    display: flex; flex-direction: column; gap: 12px;
    max-width: 860px;
  }
  .unit-card + .unit-card { margin-top: 12px; }

  .unit-modes { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .unit-legend {
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase; letter-spacing: 0.06em;
    padding-bottom: 8px;
  }

  .unit-mode {
    display: flex; gap: 14px; align-items: flex-start;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt-2);
    cursor: pointer;
  }
  .unit-mode.is-selected { border-color: var(--color-selected); box-shadow: var(--selected-ring); }
  .unit-mode input { margin-top: 3px; width: 20px; height: 20px; flex-shrink: 0; accent-color: var(--color-selected); cursor: pointer; }

  .unit-mode-text { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
  .unit-mode-name { display: flex; align-items: center; gap: 10px; font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); }
  .unit-mode-desc { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.45; }
  .unit-current {
    font-size: 11px; font-weight: var(--fw-semibold);
    padding: 2px 8px; border-radius: var(--radius-full);
    border: 1px solid var(--border-color);
    color: var(--color-light-grey);
  }

  .unit-refused {
    display: flex; flex-direction: column; gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background-color: var(--color-error-bg);
    border: 1px solid rgba(214, 103, 74, 0.45);
    color: var(--color-light);
    font-size: var(--text-sm);
  }
  .unit-refused strong { font-size: var(--text-base); }
  .unit-refused ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; line-height: 1.45; }

  .unit-save-error { margin: 0; font-size: var(--text-sm); color: var(--color-error); }

  .unit-actions { display: flex; align-items: center; gap: 12px; padding-top: 4px; }

  .unit-btn-save {
    margin-left: auto;
    min-height: var(--touch-target-min);
    padding: 0 22px;
    border: 0; border-radius: var(--radius-md);
    background-color: var(--color-primary);
    color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }
  .unit-btn-save:hover:not(:disabled) { background-color: var(--color-primary-hover); }
  .unit-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  .unit-btn-ghost {
    min-height: var(--touch-target-min);
    padding: 0 18px;
    background: none;
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    color: var(--color-light-grey);
    font-family: var(--font-family); font-size: var(--text-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .unit-btn-ghost:hover:not(:disabled) { color: var(--color-light); border-color: rgba(255,255,255,0.2); }
  .unit-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .unit-projects { flex-direction: row; align-items: center; gap: 16px; padding: 16px 20px; }
  .unit-projects.is-off { opacity: 0.55; }
  .unit-projects-toggle {
    display: flex; align-items: center; gap: 10px;
    min-height: var(--touch-target-min);
    font-size: var(--text-sm); color: var(--color-light);
    flex-shrink: 0;
  }
  .unit-projects-toggle input { width: 20px; height: 20px; accent-color: var(--color-primary); cursor: pointer; }
  .unit-projects-toggle input:disabled { cursor: not-allowed; }

  /* The confirmation, as PowerControl's. */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px;
  }
  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 28px;
    width: 100%; max-width: 440px;
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column; gap: 12px;
  }
  .confirm-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }
  .confirm-desc { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.6; margin: 0; }
  .modal-actions { display: flex; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); }
  .modal-actions .unit-btn-save { margin-left: 0; flex: 1; }
  .modal-actions .unit-btn-ghost { flex: 1; }
</style>

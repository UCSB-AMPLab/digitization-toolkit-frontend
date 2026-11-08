<script lang="ts">
  // The volume form, for a new volume or an existing one: title, stem
  // (VolumeStemField), signatura, creator, dates and notes. The project page
  // opens it with its project; Volúmenes (NEH-313) opens it without one, and
  // the new volume is posted without project_id, so the backend files it in
  // the unit's default project.
  //
  // In Fisqua mode (NEH-311) an operator edits a volume with its stem
  // read-only, and sends none; the signatura stays editable, as the backend
  // gates only the stem and external_id, which the form never sends. An admin sees the note that the
  // stem must be a Fisqua reference code. Fisqua's refusals are shown where
  // they belong: a code Fisqua does not know (unknown_reference_code) and a
  // stem cleared (stem_required) under the stem field, while it holds the
  // value refused; no answer from Fisqua (fisqua_unreachable,
  // fisqua_no_lookup) as a notice that points to the list import in Cola. A
  // 403 volumes_from_fisqua shows its message, and the unit's mode is read
  // again. The backend's English text goes to the console only.
  //
  // A new volume's "keep on this unit" box (NEH-320) is the admin's, in every
  // mode: ticked and fixed in "Solo en el escáner", where Captua keeps every
  // new volume on the unit. Ticked in Fisqua mode, the volume is not checked
  // with Fisqua (the backend skips the lookup), so the Fisqua note and label
  // give way to the plain stem field.
  //
  // Version: 0.3.3

  import { untrack } from 'svelte';
  import { m } from '$lib/i18n';
  import { authStore } from '$lib/stores/auth';
  import { collectionsApi, type Collection } from '$lib/api';
  import { stemProblem } from '$lib/volume-stem';
  import { fisquaRefusalText, fisquaVolumeRefusal, volumeSaveErrorText, type FisquaVolumeRefusal } from '$lib/volume-errors';
  import { reloadUnit, unitState, volumeCodesReadOnly } from '$lib/unit-mode';
  import VolumeStemField from './VolumeStemField.svelte';

  let {
    editing = null,
    projectId,
    projectName = null,
    onClose,
    onSaved,
  }: {
    // The volume being edited; null for a new one.
    editing?: Collection | null;
    // The project a new volume goes into; undefined while projects are hidden.
    projectId?: number;
    projectName?: string | null;
    onClose: () => void;
    // After a successful save, before the form closes.
    onSaved: () => void | Promise<void>;
  } = $props();

  // The form starts from the volume it opened with.
  const start = untrack(() => editing);
  let colName      = $state(start?.name ?? '');
  let colDesc      = $state(start?.description ?? '');
  let colDateStart = $state(start?.archival_metadata?.date_start ?? '');
  let colDateEnd   = $state(start?.archival_metadata?.date_end ?? '');
  let colCreator   = $state(start?.archival_metadata?.creator ?? '');
  let colSignatura = $state(start?.archival_metadata?.signatura ?? '');
  // The stem ("raíz", filename_stem). Required on a new volume; on an
  // existing one it can be given once while empty, and is read-only once
  // the volume reserves it (stem_reserved).
  let colStem      = $state(start?.filename_stem ?? '');
  let isCreating   = $state(false);
  let createError  = $state('');

  let role = $derived($authStore.user?.role);
  let fisquaMode = $derived($unitState?.mode === 'fisqua');
  // An operator in Fisqua mode: the stem comes from Fisqua.
  let codesReadOnly = $derived(!!editing && volumeCodesReadOnly(role, $unitState));
  // An admin in Fisqua mode: the override, with its note.
  // A new volume kept on the unit (NEH-320): the admin's choice, fixed in offline mode.
  let offlineMode = $derived($unitState?.mode === 'offline');
  let keptChoice = $state(false);
  let showKept = $derived(!editing && role === 'admin');
  let keptOnUnit = $derived(offlineMode || keptChoice);
  let fisquaAdmin = $derived(fisquaMode && role === 'admin' && !(showKept && keptOnUnit));

  // The Fisqua refusal of the last save, and the stem it refused.
  let refusal = $state<FisquaVolumeRefusal | null>(null);
  let refusedStem = $state('');
  let stemServerError = $derived(
    refusal && (refusal.code === 'unknown_reference_code' || refusal.code === 'stem_required') && colStem === refusedStem
      ? fisquaRefusalText(refusal, $m)
      : null
  );
  let fisquaNotice = $derived(
    refusal?.code === 'fisqua_unreachable' || refusal?.code === 'fisqua_no_lookup' ? refusal.code : null
  );

  /** Validates a partial ISO 8601 date: YYYY, YYYY-MM, or YYYY-MM-DD. */
  function isValidISODate(s: string): boolean {
    // Full date: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      if (m < 1 || m > 12 || d < 1 || d > 31) return false;
      const daysInMonth = new Date(y, m, 0).getDate();
      return d <= daysInMonth;
    }
    // Year + month: YYYY-MM
    if (/^\d{4}-\d{2}$/.test(s)) {
      const m = Number(s.slice(5));
      return m >= 1 && m <= 12;
    }
    // Year only: YYYY
    if (/^\d{4}$/.test(s)) {
      return Number(s) >= 1;
    }
    return false;
  }

  let stemReserved = $derived(!!editing?.stem_reserved);
  let stemLocked = $derived(stemReserved || codesReadOnly);
  // Required on a new volume and on one that already has a stem: a stem can
  // be changed before the first capture, but never blanked. Only a volume
  // that has never had one may be saved without it.
  let stemRequired = $derived(!editing || !!editing.filename_stem);
  let stemInvalid = $derived(!stemLocked && stemProblem(colStem, stemRequired) !== null);

  let dateError = $derived(
    (colDateStart && !isValidISODate(colDateStart))
      ? $m.pd_val_start_date
      : (colDateEnd && !isValidISODate(colDateEnd))
      ? $m.pd_val_end_date
      : (colDateStart && colDateEnd && colDateEnd < colDateStart)
      ? $m.pd_val_date_range
      : ''
  );

  async function handleSave() {
    if (!colName.trim() || stemInvalid) return;
    isCreating = true;
    createError = '';
    refusal = null;

    try {
      const archMeta: Record<string, string> = {};
      if (colDateStart)        archMeta.date_start = colDateStart;
      if (colDateEnd)          archMeta.date_end   = colDateEnd;
      if (colCreator.trim())   archMeta.creator    = colCreator.trim();
      if (colSignatura.trim()) archMeta.signatura  = colSignatura.trim();
      const archivalMetadata = Object.keys(archMeta).length > 0 ? archMeta : undefined;

      const stem = colStem.trim();
      if (editing) {
        // The stem is sent only when it changed to a non-empty value, and
        // never once it is locked; null is never sent.
        const stemChanged = !stemLocked && stem !== '' && stem !== (editing.filename_stem ?? '');
        await collectionsApi.update(editing.id, {
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          archival_metadata: archivalMetadata,
          ...(stemChanged ? { filename_stem: stem } : {}),
        });
      } else {
        await collectionsApi.create({
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          ...(projectId !== undefined ? { project_id: projectId } : {}),
          created_by: $authStore.user?.username,
          archival_metadata: archivalMetadata,
          filename_stem: stem,
          ...(showKept && keptOnUnit ? { kept_on_unit: true } : {}),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      console.error('[VolumeForm] Error saving the volume:', err);
      const fisqua = fisquaVolumeRefusal(err);
      if (fisqua && fisqua.code !== 'volumes_from_fisqua') {
        refusal = fisqua;
        refusedStem = colStem;
      } else {
        // Known cases have their own message, anything else a generic one.
        createError = volumeSaveErrorText(err, $m);
        // The unit is in Fisqua mode after all: the screens follow it.
        if (fisqua) reloadUnit();
      }
    } finally {
      isCreating = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) onClose(); }}>
  <!-- No Escape: it would throw away what was typed. -->
  <div class="modal-card dialog-fit" role="dialog" aria-modal="true">

    <div class="modal-header">
      <div>
        <h3 class="modal-title">{editing ? $m.pd_modal_edit_title : $m.pd_modal_create_title}</h3>
        {#if projectId !== undefined}
          <p class="modal-subtitle">{$m.pd_modal_project(projectName ?? '—')}</p>
        {/if}
      </div>
      <button class="modal-close" onclick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    {#if fisquaAdmin}
      <p class="fisqua-note">{$m.pd_fisqua_admin_note}</p>
    {/if}

    <div class="modal-body">
      <div class="form-field">
        <label class="field-label">{$m.pd_field_title} <span class="field-required">*</span></label>
        <input
          class="field-input"
          type="text"
          placeholder={$m.pd_ph_title}
          bind:value={colName}
          autofocus
        />
      </div>

      <VolumeStemField
        bind:value={colStem}
        locked={stemLocked}
        required={stemRequired}
        label={fisquaMode && !(showKept && keptOnUnit) ? $m.pd_field_stem_fisqua : $m.pd_field_stem}
        lockedNote={!stemReserved && codesReadOnly ? $m.pd_fisqua_codes_readonly : undefined}
        serverError={stemServerError}
      />

      <div class="form-field">
        <label class="field-label" for="volume-signatura-input">{$m.pd_field_refcode}</label>
        <input
          id="volume-signatura-input"
          class="field-input"
          type="text"
          placeholder={$m.pd_ph_refcode}
          bind:value={colSignatura}
        />
      </div>

      <div class="form-field">
        <label class="field-label">{$m.pd_field_creator}</label>
        <input
          class="field-input"
          type="text"
          placeholder={$m.pd_ph_creator}
          bind:value={colCreator}
        />
      </div>

      <div class="form-field">
        <label class="field-label">{$m.pd_field_dates}</label>
        <div class="date-range-row">
          <div class="date-field">
            <span class="date-sub-label">{$m.pd_date_from}</span>
            <input
              class="field-input"
              class:field-input--error={colDateStart !== '' && !isValidISODate(colDateStart)}
              type="text"
              placeholder={$m.pd_ph_date_from}
              bind:value={colDateStart}
            />
          </div>
          <span class="date-sep">—</span>
          <div class="date-field">
            <span class="date-sub-label">{$m.pd_date_to}</span>
            <input
              class="field-input"
              class:field-input--error={colDateEnd !== '' && !isValidISODate(colDateEnd)}
              type="text"
              placeholder={$m.pd_ph_date_to}
              bind:value={colDateEnd}
            />
          </div>
        </div>
        {#if dateError}
          <p class="date-error">{dateError}</p>
        {/if}
      </div>

      {#if showKept}
        <div class="form-field">
          <label class="kept-toggle">
            <input
              type="checkbox"
              checked={keptOnUnit}
              disabled={offlineMode}
              onchange={(e) => (keptChoice = (e.currentTarget as HTMLInputElement).checked)}
            />
            <span>{$m.pd_kept_on_unit}</span>
          </label>
          <p class="kept-note">{offlineMode ? $m.pd_kept_on_unit_offline : $m.pd_kept_on_unit_help}</p>
        </div>
      {/if}

      <div class="form-field">
        <label class="field-label">{$m.pd_field_notes}</label>
        <textarea
          class="field-textarea"
          placeholder={$m.pd_ph_notes}
          bind:value={colDesc}
        ></textarea>
      </div>
    </div>

    {#if fisquaNotice}
      <div class="fisqua-notice" role="alert">
        <strong>{fisquaNotice === 'fisqua_no_lookup' ? $m.pd_fisqua_no_lookup_title : $m.pd_fisqua_unreachable_title}</strong>
        <span>{$m.pd_fisqua_list_instead}</span>
      </div>
    {/if}

    {#if createError}
      <div class="create-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        {createError}
      </div>
    {/if}

    <div class="modal-actions">
      <button class="btn-ghost" onclick={onClose}>{$m.common_cancel}</button>
      <button
        class="btn-crear"
        onclick={handleSave}
        disabled={isCreating || !colName.trim() || dateError !== '' || stemInvalid}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {isCreating ? (editing ? $m.common_saving : $m.common_creating) : (editing ? $m.common_save_changes : $m.pd_create_btn)}
      </button>
    </div>

  </div>
</div>

<style>
  .kept-toggle {
    display: flex; align-items: center; gap: 10px;
    min-height: var(--touch-target-min);
    font-size: var(--text-sm); color: var(--color-light);
  }
  .kept-toggle input { width: 20px; height: 20px; accent-color: var(--color-primary); cursor: pointer; }
  .kept-toggle input:disabled { cursor: not-allowed; }
  .kept-note { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.45; }

  /* The form's styles, as the project page defined them. */
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
    padding: 24px;
    width: 100%;
    max-width: 420px;
    /* Within the backdrop's 24px padding on both sides, so Guardar stays on screen. */
    max-height: calc(100dvh - 48px);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .modal-title  { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 4px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-secondary); margin: 0; }

  .modal-close {
    width: 28px; height: 28px;
    background: none; border: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .modal-close:hover { background-color: var(--color-surface); color: var(--color-light); }

  .modal-body { display: flex; flex-direction: column; gap: 14px; }

  .form-field { display: flex; flex-direction: column; gap: 6px; }

  .field-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .field-input, .field-textarea {
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
  }

  .field-input { min-height: var(--touch-target-min); }
  .field-textarea { min-height: 80px; resize: vertical; }
  .field-input:focus, .field-textarea:focus { border-color: var(--color-primary); }
  .field-input::placeholder, .field-textarea::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  .field-input--error {
    border-color: var(--color-error) !important;
  }

  .field-required { color: var(--color-error); margin-left: 2px; }

  .date-range-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .date-sub-label {
    font-size: 10px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .date-sep {
    color: var(--color-light-grey);
    padding-bottom: 10px;
    flex-shrink: 0;
    font-size: var(--text-base);
  }

  .date-error {
    font-size: 12px;
    color: var(--color-error);
    margin: 2px 0 0;
    line-height: 1.4;
  }

  /* Fisqua mode (NEH-311): the admin's note, in the secondary blue, and the
     notice when Fisqua cannot check the code, in the warning sand. */
  .fisqua-note {
    margin: 0;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background-color: rgba(150, 177, 240, 0.14);
    border: 1px solid rgba(150, 177, 240, 0.35);
    font-size: var(--text-sm);
    color: var(--color-light);
    line-height: 1.45;
  }

  .fisqua-notice {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background-color: var(--color-warning-bg);
    border: 1px solid rgba(208, 154, 68, 0.45);
    font-size: var(--text-sm);
    color: var(--color-light);
    line-height: 1.45;
  }

  .create-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background-color: var(--color-error-bg);
    border: 1px solid var(--color-error);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-error);
    line-height: 1.4;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  .btn-ghost {
    display: inline-flex; align-items: center; gap: 7px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 14px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
    white-space: nowrap;
  }

  .btn-ghost:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  .btn-crear {
    display: inline-flex; align-items: center; gap: 8px;
    background-color: var(--color-primary);
    color: white;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    border: none;
    border-radius: var(--radius-md);
    padding: 9px 18px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn-crear:hover { background-color: var(--color-primary-hover); }
  .btn-crear:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

<script lang="ts">
  // Volúmenes (/dashboard/volumes, NEH-313): every volume on the unit in one
  // list, whatever its project, for the side menu's Volúmenes while the unit
  // hides projects. Searchable by name, stem and reference code (the Fisqua
  // code and the signatura), and filterable by stage. Each volume's stage is
  // the one the project page shows, placed by $lib/pipeline from one
  // GET /activity/collections for the whole unit. A row opens the volume
  // page in its own project. Nuevo volumen opens the volume form without a
  // project: the backend files the volume in the unit's default project. In
  // Fisqua mode an operator has no Nuevo volumen (NEH-311).
  //
  // A sub-volume (no project, a parent volume) is not listed: it belongs to
  // its parent, as on the project page.
  //
  // ?editVolume=<id> opens that volume's form for an admin or operator: the
  // capture screen's needs-stem link and a project page reached while
  // projects are hidden send it here. While the unit shows projects, the
  // page goes to Proyectos, if it is still the page shown.
  //
  // Each row has the project page's actions, for the same roles (admin and
  // operator): the menu with Editar and Eliminar (VolumeRowMenu,
  // VolumeDeleteModal) and the "Sin raíz" shortcut to the form. In Fisqua
  // mode an operator's form keeps the stem read-only. A volume with records
  // can be deleted once they are moved to any other listed volume, whatever
  // its project: the backend takes any target attached to a project, and a
  // volume alone in an old project would otherwise have nowhere to go.
  //
  // Version: 0.3.3

  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { m, locale } from '$lib/i18n';
  import { formatCount } from '$lib/format-count';
  import { authStore } from '$lib/stores/auth';
  import { activityApi, collectionsApi, type Collection, type StatusCounts } from '$lib/api';
  import { PIPELINE_STAGES, placeVolume, stageBadgeStyle, type PipelineStage } from '$lib/pipeline';
  import { canCreateVolumes, ensureUnit, projectsShownIn, unitState } from '$lib/unit-mode';
  import { needsStem } from '$lib/volume-stem';
  import VolumeFormModal from '../projects/[projectId]/VolumeFormModal.svelte';
  import VolumeRowMenu from '../projects/[projectId]/VolumeRowMenu.svelte';
  import VolumeDeleteModal from '../projects/[projectId]/VolumeDeleteModal.svelte';

  let volumes = $state<Collection[]>([]);
  let statusCounts = $state<Map<number, StatusCounts>>(new Map());
  let isLoading = $state(true);
  let loadError = $state(false);
  let searchQuery = $state('');
  let stageFilter = $state<PipelineStage | ''>('');
  let showCreateModal = $state(false);
  // The volume whose form is open for editing; null for a new volume.
  let editingVolume = $state<Collection | null>(null);

  let canCreate = $derived(canCreateVolumes($authStore.user?.role, $unitState));
  // Editing and deleting a volume: admin and operator, as the backend allows.
  let canEdit = $derived($authStore.user?.role === 'admin' || $authStore.user?.role === 'operator');
  // The volume whose delete dialog is open.
  let deletingVolume = $state<Collection | null>(null);

  function openEdit(volume: Collection) {
    editingVolume = volume;
    showCreateModal = true;
  }

  let stageTitle = $derived<{ [K in PipelineStage]: string }>({
    capture: $m.dash_stage_capture,
    recapture: $m.dash_stage_recapture,
    review: $m.dash_stage_review,
    approved: $m.dash_stage_approved,
  });

  function stageOf(volume: Collection): PipelineStage | null {
    const counts = statusCounts.get(volume.id);
    return counts ? placeVolume(counts) : null;
  }

  let filtered = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return volumes.filter((v) => {
      if (stageFilter && stageOf(v) !== stageFilter) return false;
      if (!q) return true;
      return [v.name, v.filename_stem, v.external_id, v.archival_metadata?.signatura]
        .some((field) => typeof field === 'string' && field.toLowerCase().includes(q));
    });
  });

  async function loadStages() {
    try {
      const rows = await activityApi.collections();
      statusCounts = new Map(rows.map((r) => [r.collection_id, r.status_counts]));
    } catch (err) {
      // Without the counts the rows show no stage.
      console.error('[Volumes] Error loading volume stages:', err);
    }
  }

  async function loadVolumes() {
    try {
      const [all] = await Promise.all([collectionsApi.listAll(), loadStages()]);
      volumes = all.filter((v) => v.project_id != null);
      loadError = false;
    } catch (err) {
      console.error('[Volumes] Error loading volumes:', err);
      loadError = true;
    } finally {
      isLoading = false;
    }
  }

  let left = false;
  onDestroy(() => (left = true));

  onMount(async () => {
    const here = get(page).url.pathname;
    const unitRead = ensureUnit();
    await loadVolumes();
    const state = await unitRead;
    // Projects shown: the volumes are listed by project. Only while this
    // page is still the one shown.
    if (state && projectsShownIn(state)) {
      if (!left && get(page).url.pathname === here) goto('/dashboard/projects', { replaceState: true });
      return;
    }
    if (left) return;
    const role = $authStore.user?.role;
    const editId = Number($page.url.searchParams.get('editVolume')) || 0;
    if (editId && (role === 'admin' || role === 'operator')) {
      const target = volumes.find((v) => v.id === editId);
      if (target) {
        editingVolume = target;
        showCreateModal = true;
      }
    }
  });

  function closeForm() {
    showCreateModal = false;
    editingVolume = null;
  }

  function openVolume(volume: Collection) {
    goto(`/dashboard/projects/${volume.project_id}/collections/${volume.id}`);
  }
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1 class="page-title">{$m.nav_volumes}</h1>
      {#if !isLoading && !loadError}
        <p class="page-subtitle">{$m.vols_count(volumes.length)}</p>
      {/if}
    </div>
    {#if canCreate}
      <button class="btn-primary" onclick={() => { editingVolume = null; showCreateModal = true; }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {$m.pd_new_collection}
      </button>
    {/if}
  </div>

  <div class="toolbar">
    <label class="tool-field tool-search">
      <span class="tool-label">{$m.vols_search_label}</span>
      <input type="search" class="tool-input" placeholder={$m.vols_search_placeholder} bind:value={searchQuery} />
    </label>
    <label class="tool-field">
      <span class="tool-label">{$m.vols_stage_label}</span>
      <select class="tool-input" bind:value={stageFilter}>
        <option value="">{$m.vols_stage_all}</option>
        {#each PIPELINE_STAGES as stage (stage)}
          <option value={stage}>{stageTitle[stage]}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>{$m.pd_loading}</span>
    </div>
  {:else if loadError}
    <p class="empty-state" role="alert">{$m.vols_load_error}</p>
  {:else if filtered.length === 0}
    <p class="empty-state">{searchQuery || stageFilter ? $m.pd_empty_search : $m.vols_empty}</p>
  {:else}
    <div class="table-wrapper">
      <table class="volumes-table">
        <thead>
          <tr>
            <th>{$m.pd_col_collection}</th>
            <th>{$m.vols_col_stem}</th>
            <th class="text-right">{$m.pd_col_records}</th>
            <th>{$m.vols_stage_label}</th>
            {#if canEdit}<th class="text-right">{$m.common_actions}</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each filtered as volume (volume.id)}
            {@const stage = stageOf(volume)}
            <tr class="table-row" onclick={() => openVolume(volume)}>
              <td>
                <span class="vol-name">{volume.name}</span>
                {#if needsStem(volume)}
                  {#if canEdit}
                    <button
                      type="button"
                      class="no-stem-badge"
                      title={$m.pd_no_stem_title}
                      onclick={(e) => { e.stopPropagation(); openEdit(volume); }}
                    >{$m.pd_no_stem_badge}</button>
                  {:else}
                    <span class="no-stem-badge" title={$m.pd_no_stem_title}>{$m.pd_no_stem_badge}</span>
                  {/if}
                {/if}
              </td>
              <td><span class="vol-stem">{volume.filename_stem ?? '—'}</span></td>
              <td class="text-right">{formatCount(volume.record_count ?? 0, $locale)}</td>
              <td>
                {#if stage}
                  <span class="status-badge" style={stageBadgeStyle(stage)}>{stageTitle[stage]}</span>
                {/if}
              </td>
              {#if canEdit}
                <td class="text-right">
                  <VolumeRowMenu {volume} onEdit={openEdit} onDelete={(v) => (deletingVolume = v)} />
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if showCreateModal}
  <VolumeFormModal editing={editingVolume} onClose={closeForm} onSaved={loadVolumes} />
{/if}

{#if deletingVolume}
  <VolumeDeleteModal
    volume={deletingVolume}
    moveTargets={volumes}
    onClose={() => (deletingVolume = null)}
    onChanged={loadVolumes}
  />
{/if}

<style>
  /* The project page's list styles, for the same rows. */
  .page { padding: 32px; max-width: 1200px; }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px 16px;
    margin-bottom: 24px;
  }
  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .btn-primary {
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
  .btn-primary:hover { background-color: var(--color-primary-hover); }

  .toolbar { display: flex; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 20px; }
  .tool-field { display: flex; flex-direction: column; gap: 6px; }
  .tool-search { flex: 1; min-width: 220px; max-width: 420px; }
  .tool-label {
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .tool-input {
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 12px;
    min-height: var(--touch-target-min);
    outline: none;
    transition: border-color var(--transition-base);
  }
  .tool-input:focus { border-color: var(--color-primary); }
  .tool-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  .loading, .empty-state {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 48px 24px; margin: 0;
    color: var(--color-light-grey); font-size: var(--text-sm);
  }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .table-wrapper {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    /* Visible, as on the project page, so the last row's menu is not cut. */
    overflow: visible;
  }
  /* Round corners without overflow: hidden, as the project page does. */
  .volumes-table tbody tr:last-child td:first-child { border-bottom-left-radius: var(--radius-xl); }
  .volumes-table tbody tr:last-child td:last-child  { border-bottom-right-radius: var(--radius-xl); }
  .volumes-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .volumes-table th {
    padding: 12px 20px;
    text-align: left;
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border-color);
    white-space: nowrap;
  }
  .volumes-table td { padding: 14px 20px; border-bottom: 1px solid var(--border-color); vertical-align: middle; color: var(--color-light-grey); }
  .volumes-table tbody tr:last-child td { border-bottom: none; }
  .text-right { text-align: right; }

  .table-row { cursor: pointer; transition: background-color var(--transition-fast); }
  .table-row:hover { background-color: rgba(255,255,255,0.02); }

  .vol-name { font-weight: var(--fw-semibold); color: var(--color-light); }
  .vol-stem { font-family: monospace; font-size: var(--text-sm); }

  .no-stem-badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 8px;
    font-family: var(--font-family);
    font-size: 11px;
    font-weight: var(--fw-bold);
    color: var(--color-highlight);
    background: rgba(225, 183, 120, 0.12);
    border: 1px solid rgba(225, 183, 120, 0.4);
    border-radius: var(--radius-md);
    vertical-align: middle;
  }
  button.no-stem-badge { cursor: pointer; }
  button.no-stem-badge:hover { background: rgba(225, 183, 120, 0.22); }

  .status-badge {
    display: inline-block;
    font-size: 12px; font-weight: var(--fw-semibold);
    padding: 3px 10px;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }
</style>

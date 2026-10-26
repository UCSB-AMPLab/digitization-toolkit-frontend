<script lang="ts">
  // Project list (/dashboard/projects). Search filters client-side by name
  // and description; a row opens /dashboard/projects/{id}. One modal creates
  // and edits a project (name, description, fondo, serie, signatura); the
  // delete modal can move the project's volumes to another project first.
  // The Status column shows placeholder values (see `mockStatuses`).
  //
  // Version: 0.1.0-beta

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { m, locale } from '$lib/i18n';
  import { formatApiDate } from '$lib/format-date';
  import { authStore, userRole } from '$lib/stores/auth';
  import { projectsApi, collectionsApi, recordsApi, type Project } from '$lib/api';
  import { fileHoldText } from '$lib/volume-refusals';
  import { dismissible } from '$lib/dialog';

  let projects     = $state<Project[]>([]);
  let isLoading    = $state(true);
  let searchQuery  = $state('');

  let filteredProjects = $derived(
    searchQuery.trim()
      ? projects.filter(p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      : projects
  );

  // Only admin creates projects — the backend enforces it too (`allow_admin`
  // in `create_project`, NEH-80); operator can create and delete volumes
  // inside a project, but not projects.
  let canCreate = $derived($authStore.user?.role === 'admin');

  let showCreateModal = $state(false);

  let formName       = $state('');
  let formDesc       = $state('');
  let formFondo      = $state('');
  let formSerie      = $state('');
  let formSignatura  = $state('');

  let isCreating  = $state(false);
  let createError = $state('');

  // Project being edited (null = create mode).
  let editingProject = $state<Project | null>(null);

  let openMenuId = $state<number | null>(null);

  let showDeleteModal      = $state(false);
  let deletingProject      = $state<Project | null>(null);
  let deleteCollectionCount = $state(0);
  let deleteImageCount     = $state(0);
  let deleteMoveTarget     = $state<number | ''>('');
  let isDeleting           = $state(false);
  let deleteError          = $state('');
  let isLoadingDeleteInfo  = $state(false);

  // Closes the open row menu on the next click anywhere.
  $effect(() => {
    if (openMenuId !== null) {
      const close = () => { openMenuId = null; };
      document.addEventListener('click', close, { once: true });
      return () => document.removeEventListener('click', close);
    }
  });

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    try {
      isLoading = true;
      const data = await projectsApi.list();
      projects = data;
    } catch (err) {
      console.error('[Projects] Error:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleCreateProject() {
    if (!formName.trim()) return;
    isCreating = true;
    createError = '';

    try {
      if (editingProject) {
        await projectsApi.update(editingProject.id, {
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          fondo: formFondo.trim() || undefined,
          serie: formSerie.trim() || undefined,
          signatura: formSignatura.trim() || undefined,
        });
      } else {
        await projectsApi.create({
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          fondo: formFondo.trim() || undefined,
          serie: formSerie.trim() || undefined,
          signatura: formSignatura.trim() || undefined,
          created_by: $authStore.user?.username,
        });
      }
      await loadProjects();
      showCreateModal = false;
      resetForm();
    } catch (err) {
      // A rename refused while an export or the offsite upload reads the
      // project's files has its own message.
      const hold = fileHoldText(err, $m, 'project');
      const msg = err instanceof Error ? err.message : String(err);
      createError = hold ?? $m.proj_err_create(msg);
    } finally {
      isCreating = false;
    }
  }

  function resetForm() {
    formName = ''; formDesc = '';
    formFondo = ''; formSerie = ''; formSignatura = '';
    createError = ''; editingProject = null;
  }

  function closeModal() {
    showCreateModal = false;
    resetForm();
  }

  function handleProjectClick(id: number) {
    goto(`/dashboard/projects/${id}`);
  }

  function openMenu(e: MouseEvent, id: number) {
    e.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

  function startEdit(e: MouseEvent, project: Project) {
    e.stopPropagation();
    openMenuId = null;
    editingProject = project;
    formName       = project.name;
    formDesc       = project.description ?? '';
    formFondo      = project.fondo ?? '';
    formSerie      = project.serie ?? '';
    formSignatura  = project.signatura ?? '';
    showCreateModal = true;
  }

  async function openDeleteModal(e: MouseEvent, project: Project) {
    e.stopPropagation();
    openMenuId = null;
    deletingProject = project;
    deleteMoveTarget = '';
    deleteError = '';
    deleteCollectionCount = 0;
    deleteImageCount = 0;
    showDeleteModal = true;
    isLoadingDeleteInfo = true;
    try {
      const [colCount, imgs] = await Promise.all([
        collectionsApi.count({ project_id: project.id }),
        recordsApi.count({ project_id: project.id }),
      ]);
      deleteCollectionCount = colCount;
      deleteImageCount = imgs;
    } catch (err) {
      console.error('[Projects] Error fetching project info:', err);
    } finally {
      isLoadingDeleteInfo = false;
    }
  }

  function closeDeleteModal() {
    showDeleteModal = false;
    deletingProject = null;
    deleteMoveTarget = '';
    deleteError = '';
    isDeleting = false;
  }

  async function executeDelete() {
    if (!deletingProject) return;
    isDeleting = true;
    deleteError = '';
    try {
      if (deleteMoveTarget !== '') {
        await projectsApi.moveCollections(deletingProject.id, deleteMoveTarget as number);
      }
      await projectsApi.delete(deletingProject.id);
      await loadProjects();
      closeDeleteModal();
    } catch (err) {
      // A move of the volumes refused while an export or the offsite upload
      // reads their files has its own message.
      const hold = fileHoldText(err, $m, 'project');
      const msg = err instanceof Error ? err.message : String(err);
      deleteError = hold ?? $m.proj_err_delete(msg);
      isDeleting = false;
    }
  }

  let statusStyleMap = $derived<Record<string, string>>({
    [$m.proj_status_in_progress]: 'color: var(--color-primary); background: rgba(90,140,98,0.15)',
    [$m.proj_status_started]:     'color: var(--color-secondary); background: rgba(150,177,240,0.15)',
    [$m.proj_status_review]:      'color: var(--color-warning); background: rgba(208,154,68,0.15)',
    [$m.proj_status_paused]:      'color: var(--color-light-grey); background: rgba(171,183,183,0.12)',
    [$m.proj_status_completed]:   'color: var(--color-success); background: rgba(111,191,115,0.15)',
  });

  function getStatusStyle(status: string): string {
    return statusStyleMap[status] ?? 'color: var(--color-light-grey); background: rgba(0,0,0,0.2)';
  }

  // Placeholder statuses, not read from the backend: the Status column cycles
  // through them by row index.
  // TODO: connect to a real project status from the backend.
  let mockStatuses = $derived([
    $m.proj_status_in_progress,
    $m.proj_status_started,
    $m.proj_status_review,
    $m.proj_status_paused,
    $m.proj_status_completed,
  ]);
</script>

<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">{$m.proj_title}</h1>
      <p class="page-subtitle">{$m.proj_subtitle}</p>
    </div>
    <!-- Only once projects exist: the empty state has its own create button. -->
    {#if canCreate && projects.length > 0}
      <button class="btn-primary" data-tour="nuevo-proyecto" onclick={() => showCreateModal = true}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {$m.proj_new}
      </button>
    {/if}
  </div>

  <div class="toolbar">
    <div class="search-wrapper">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder={$m.proj_search_placeholder}
        bind:value={searchQuery}
        class="search-input"
      />
    </div>
  </div>

  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>{$m.proj_loading}</span>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>{searchQuery ? $m.proj_empty_search : $m.proj_empty}</span>
      {#if canCreate && !searchQuery}
        <button class="btn-primary" onclick={() => showCreateModal = true}>{$m.proj_create_first}</button>
      {/if}
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="projects-table">
        <thead>
          <tr>
            <th>{$m.proj_col_project}</th>
            <th>{$m.proj_col_reference}</th>
            <th>{$m.common_status}</th>
            <th>{$m.proj_col_start_date}</th>
            <th class="text-right">{$m.common_actions}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredProjects as project, i}
            {@const status = mockStatuses[i % mockStatuses.length]}

            <tr onclick={() => handleProjectClick(project.id)} class="table-row">
              <td>
                <div class="project-cell">
                  <div class="project-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <p class="project-name">{project.name}</p>
                    <p class="project-code">{project.description?.slice(0, 30) ?? '—'}</p>
                  </div>
                </div>
              </td>

              <td>
                {#if project.signatura}
                  <span class="signatura-badge">{project.signatura}</span>
                {:else if project.fondo || project.serie}
                  <div class="breadcrumb-cell">
                    {#if project.fondo}<span class="breadcrumb-part">{project.fondo}</span>{/if}
                    {#if project.fondo && project.serie}<span class="breadcrumb-sep">›</span>{/if}
                    {#if project.serie}<span class="breadcrumb-part">{project.serie}</span>{/if}
                  </div>
                {:else}
                  <span class="text-muted">—</span>
                {/if}
              </td>

              <td>
                <span class="status-badge" style={getStatusStyle(status)}>{status}</span>
              </td>

              <td>
                <div class="date-cell">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {project.created_at ? formatApiDate(project.created_at, $locale, { day:'numeric', month:'short', year:'numeric' }) : '—'}
                </div>
              </td>

              <td class="text-right">
                <div class="action-menu-wrap">
                  <button
                    class="btn-menu"
                    onclick={(e) => openMenu(e, project.id)}
                    title={$m.common_actions}
                  >
                    <span class="material-symbols-outlined icon-sm">more_vert</span>
                  </button>
                  {#if openMenuId === project.id}
                    <div class="action-menu">
                      <button class="action-item" onclick={(e) => startEdit(e, project)}>
                        <span class="material-symbols-outlined icon-sm">edit</span>
                        {$m.common_edit}
                      </button>
                      {#if $userRole === 'admin'}
                        <button class="action-item action-item-danger" onclick={(e) => openDeleteModal(e, project)}>
                          <span class="material-symbols-outlined icon-sm">delete</span>
                          {$m.common_delete}
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

</div>

{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeModal(); }}>
    <!-- No Escape: it would throw away what was typed. -->
    <div class="modal-card dialog-fit" role="dialog" aria-modal="true">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">{editingProject ? $m.proj_modal_edit_title : $m.proj_new}</h3>
        </div>
        <button class="modal-close" onclick={closeModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="form-section">

        <div class="form-field">
          <label class="field-label">{$m.proj_field_name} <span class="field-required">*</span></label>
          <input
            class="field-input"
            type="text"
            placeholder={$m.proj_ph_name}
            bind:value={formName}
            autofocus
          />
        </div>

        <div class="form-field">
          <label class="field-label">{$m.proj_field_description}</label>
          <input
            class="field-input"
            type="text"
            placeholder={$m.proj_ph_description}
            bind:value={formDesc}
          />
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="field-label">{$m.proj_field_fonds}</label>
            <input class="field-input" type="text" placeholder={$m.proj_ph_fonds} bind:value={formFondo} />
          </div>
          <div class="form-field">
            <label class="field-label">{$m.proj_field_series}</label>
            <input class="field-input" type="text" placeholder={$m.proj_ph_series} bind:value={formSerie} />
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">{$m.proj_field_refcode}</label>
          <input class="field-input" type="text" placeholder={$m.proj_ph_refcode} bind:value={formSignatura} />
        </div>

      </div>

      {#if createError}
        <div class="create-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          {createError}
        </div>
      {/if}

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-ghost" onclick={closeModal}>{$m.common_cancel}</button>
        <button
          class="btn-primary"
          onclick={handleCreateProject}
          disabled={isCreating || !formName.trim()}
        >
          {#if isCreating}
            <div class="spinner-sm"></div>
            {editingProject ? $m.common_saving : $m.common_creating}
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {editingProject ? $m.common_save_changes : $m.proj_create_btn}
          {/if}
        </button>
      </div>

    </div>
  </div>
{/if}

{#if showDeleteModal && deletingProject}
  <div class="modal-backdrop" use:dismissible={{ onDismiss: closeDeleteModal, escape: !isDeleting, backdrop: !isDeleting }}>
    <div class="modal-card delete-modal-card dialog-fit" role="dialog" aria-modal="true">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">{$m.proj_delete_title}</h3>
          <p class="modal-subtitle">"{deletingProject.name}"</p>
        </div>
        <button class="modal-close" onclick={closeDeleteModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {#if isLoadingDeleteInfo}
        <div class="delete-loading">
          <div class="spinner"></div>
          <span>{$m.proj_checking_contents}</span>
        </div>
      {:else if deleteCollectionCount > 0}
        <div class="delete-warning">
          <div class="delete-warning-icon">
            <span class="material-symbols-outlined icon-md">warning</span>
          </div>
          <div>
            <p class="delete-warning-title">{$m.proj_not_empty}</p>
            <p class="delete-warning-body">
              {$m.proj_contains_pre}<strong>{$m.proj_collections_count(deleteCollectionCount)}</strong>
              {#if deleteImageCount > 0}
                {$m.proj_contains_mid}<strong>{$m.proj_images_count(deleteImageCount)}</strong>
              {/if}.
              {$m.proj_delete_warning}
            </p>
          </div>
        </div>

        <div class="delete-move-section">
          <label class="field-label">{$m.proj_move_label}</label>
          <select class="field-input" bind:value={deleteMoveTarget}>
            <option value="">{$m.proj_move_none}</option>
            {#each projects.filter(p => p.id !== deletingProject!.id) as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          {#if deleteMoveTarget !== ''}
            <p class="delete-move-hint">
              {$m.proj_move_hint(deleteCollectionCount)}
            </p>
          {/if}
        </div>

      {:else}
        <p class="delete-confirm-text">
          {$m.proj_delete_confirm_pre}<strong>"{deletingProject.name}"</strong>?
          {$m.common_irreversible}
        </p>
      {/if}

      {#if deleteError}
        <div class="create-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          {deleteError}
        </div>
      {/if}

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-ghost" onclick={closeDeleteModal} disabled={isDeleting}>{$m.common_cancel}</button>
        {#if deleteCollectionCount > 0 && deleteMoveTarget !== ''}
          <button class="btn-danger" onclick={executeDelete} disabled={isDeleting}>
            {#if isDeleting}
              <div class="spinner-sm"></div>
              {$m.proj_deleting_moving}
            {:else}
              <span class="material-symbols-outlined icon-sm">drive_file_move</span>
              {$m.proj_move_and_delete}
            {/if}
          </button>
        {:else}
          <button class="btn-danger" onclick={executeDelete} disabled={isDeleting || isLoadingDeleteInfo}>
            {#if isDeleting}
              <div class="spinner-sm"></div>
              {$m.common_deleting}
            {:else}
              <span class="material-symbols-outlined icon-sm">delete</span>
              {deleteCollectionCount > 0 ? $m.proj_delete_without_moving : $m.proj_delete_title}
            {/if}
          </button>
        {/if}
      </div>

    </div>
  </div>
{/if}

<style>
  .page { padding: 32px; max-width: 1100px; }

  /* Header */
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
  .page-title  { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Toolbar */
  .toolbar { display: flex; gap: 12px; margin-bottom: 20px; }

  .search-wrapper {
    position: relative;
    flex: 1;
    max-width: 400px;
  }

  .search-icon {
    position: absolute;
    left: 12px; top: 50%;
    transform: translateY(-50%);
    color: var(--color-light-grey);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 9px 12px 9px 36px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    outline: none;
    transition: border-color var(--transition-base);
    min-height: var(--touch-target-min);
  }

  .search-input:focus { border-color: var(--color-primary); }
  .search-input::placeholder { color: var(--color-light-grey); opacity: 0.6; }

  /* Buttons */
  .btn-primary {
    display: flex; align-items: center; gap: 8px;
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
    white-space: nowrap;
  }

  .btn-primary:hover { background-color: var(--color-primary-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-ghost {
    display: flex; align-items: center; gap: 7px;
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

  .action-menu-wrap { position: relative; display: inline-flex; justify-content: flex-end; }

  .btn-menu {
    width: 32px; height: 32px;
    background: none; border: 1px solid transparent;
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-menu:hover { background-color: var(--color-surface-alt); border-color: var(--border-color); color: var(--color-light); }

  .action-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 140px;
    z-index: 50;
    overflow: hidden;
  }

  .action-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 9px 14px;
    background: none; border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .action-item:hover { background-color: var(--color-surface); color: var(--color-light); }
  .action-item-danger:hover { color: var(--color-error); }

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

  /* Loading / empty */
  .loading, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 20px;
    color: var(--color-light-grey);
    font-size: var(--text-base);
  }

  .spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Table */
  .table-wrapper {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: visible;
  }

  /* Round table corners without overflow:hidden */
  .projects-table thead tr:first-child th:first-child { border-top-left-radius: var(--radius-xl); }
  .projects-table thead tr:first-child th:last-child  { border-top-right-radius: var(--radius-xl); }
  .projects-table tbody tr:last-child td:first-child  { border-bottom-left-radius: var(--radius-xl); }
  .projects-table tbody tr:last-child td:last-child   { border-bottom-right-radius: var(--radius-xl); }

  .projects-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: var(--text-sm);
  }

  .projects-table thead tr {
    background-color: var(--color-surface-alt);
    border-bottom: 1px solid var(--border-color);
  }

  .projects-table th {
    padding: 13px 20px;
    font-size: 11px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .projects-table th.text-right { text-align: right; }

  .projects-table td { padding: 14px 20px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
  .projects-table tbody tr:last-child td { border-bottom: none; }

  .table-row {
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .table-row:hover { background-color: rgba(255,255,255,0.025); }

  .text-right { text-align: right; }

  .project-cell { display: flex; align-items: center; gap: 12px; }

  .project-icon {
    width: 36px; height: 36px;
    border-radius: var(--radius-md);
    background-color: rgba(188,130,60,0.15);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .project-name { font-weight: var(--fw-semibold); color: var(--color-light); margin: 0 0 2px; }
  .project-code { font-size: 11px; color: var(--color-light-grey); margin: 0; }

  /* Archival reference column */
  .signatura-badge {
    font-family: var(--font-mono, monospace);
    font-size: 12px;
    color: var(--color-secondary);
    background-color: rgba(150,177,240,0.1);
    border: 1px solid rgba(150,177,240,0.25);
    border-radius: var(--radius-sm);
    padding: 2px 7px;
    white-space: nowrap;
  }

  .breadcrumb-cell { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; max-width: 240px; }
  .breadcrumb-part { font-size: 12px; color: var(--color-light-grey); }
  .breadcrumb-sep { font-size: 12px; color: var(--color-light-grey); opacity: 0.4; }
  .text-muted { font-size: var(--text-sm); color: var(--color-light-grey); opacity: 0.4; }

  .status-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }

  .date-cell { display: flex; align-items: center; gap: 7px; color: var(--color-light-grey); font-size: var(--text-sm); white-space: nowrap; }

  /* ══ MODAL ══ */
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
    width: 100%;
    max-width: 440px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .modal-card::-webkit-scrollbar { width: 3px; }
  .modal-card::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .modal-title  { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 4px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .modal-close {
    width: 30px; height: 30px;
    background: none; border: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .modal-close:hover { background-color: var(--color-surface); color: var(--color-light); }

  /* Form layout */
  .form-section { display: flex; flex-direction: column; gap: 14px; }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .form-field { display: flex; flex-direction: column; gap: 6px; }

  .field-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .field-required { color: var(--color-error); }

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
    min-height: var(--touch-target-min);
    width: 100%;
  }

  .field-input:focus { border-color: var(--color-primary); }
  .field-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  /* Modal footer */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  /* Spinner for loading state */
  .spinner-sm {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Delete modal ──────────────────────────────────────── */
  .delete-modal-card { max-width: 480px; }

  .delete-loading {
    display: flex; align-items: center; gap: 12px;
    color: var(--color-light-grey);
    font-size: var(--text-sm);
    padding: 8px 0;
  }

  .delete-warning {
    display: flex; gap: 14px; align-items: flex-start;
    background-color: rgba(208,100,60,0.1);
    border: 1px solid rgba(208,100,60,0.35);
    border-radius: var(--radius-md);
    padding: 14px 16px;
  }

  .delete-warning-icon {
    color: var(--color-error);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .delete-warning-title {
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-error);
    margin: 0 0 4px;
  }

  .delete-warning-body {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.5;
  }

  .delete-move-section {
    display: flex; flex-direction: column; gap: 8px;
  }

  .delete-move-hint {
    font-size: 12px;
    color: var(--color-primary);
    margin: 0;
    padding-left: 2px;
  }

  .delete-confirm-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.5;
  }

  .btn-danger {
    display: flex; align-items: center; gap: 8px;
    background-color: var(--color-error);
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
    white-space: nowrap;
  }

  .btn-danger:hover { filter: brightness(1.15); }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
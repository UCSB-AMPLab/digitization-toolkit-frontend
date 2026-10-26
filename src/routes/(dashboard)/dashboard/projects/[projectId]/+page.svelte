<script lang="ts">
  // Project detail (/dashboard/projects/[projectId]): the project's volumes,
  // with KPIs, a name search, and the modals that create, edit and delete a
  // volume and manage the project's members. The volume form owns the
  // filename stem rules (see `VolumeStemField`); the delete modal moves a
  // volume's records to another volume first when it has any. The Status
  // column shows placeholder values (see `mockStatuses`).

  import { onMount } from 'svelte';
  import { m, roleLabel, locale } from '$lib/i18n';
  import { formatApiDate } from '$lib/format-date';
  import { formatCount } from '$lib/format-count';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore, userRole } from '$lib/stores/auth';
  import { projectsApi, collectionsApi, recordsApi, projectMembersApi,
           type Project, type Collection, type ProjectMember, type UserRead } from '$lib/api';
  import { stemProblem, stemConflict, needsStem, deleteRefused } from '$lib/volume-stem';
  import { volumeSaveErrorText, volumeDeleteErrorText, isNotEmptyRefusal, notEmptyCounts } from '$lib/volume-errors';
  import VolumeStemField from './VolumeStemField.svelte';

  let projectId = $derived(Number($page.params.projectId) || 0);

  let project     = $state<Project | null>(null);
  let collections = $state<Collection[]>([]);
  let isLoading   = $state(true);
  let searchQuery = $state('');

  // Records living directly under the project (no collection) — the
  // single-parent DB constraint means a record's project_id is NULL as
  // soon as it's filed into a collection, so this alone undercounts.
  let directRecordCount = $state<number | null>(null);

  // Total = direct records + each collection's own record_count (populated
  // by GET /collections/, NEH-179). The UI does not nest collections, so
  // summing the flat, top-level list covers every record under the project
  // without a recursive traversal.
  let recordCount = $derived(
    directRecordCount === null
      ? null
      : directRecordCount + collections.reduce((sum, c) => sum + (c.record_count ?? 0), 0)
  );

  let canCreate = $derived(
    $authStore.user?.role === 'admin' || $authStore.user?.role === 'operator'
  );
  // Only admin adds or removes members — the backend enforces it too
  // (`allow_admin` in `add_project_member`/`remove_project_member`, NEH-80).
  // Operator and reviewer cannot even read the user list (GET /auth/users is
  // admin-only), so the picker must not try to load it for them.
  let canManageMembers = $derived($authStore.user?.role === 'admin');

  let filteredCollections = $derived(
    searchQuery.trim()
      ? collections.filter(c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : collections
  );

  let showCreateModal = $state(false);
  let colName         = $state('');
  let colDesc         = $state('');
  let colDateStart    = $state('');
  let colDateEnd      = $state('');
  let colCreator      = $state('');
  let colSignatura    = $state('');
  // The stem ("raíz", filename_stem). Required on a new volume; on an
  // existing one it can be given once while empty, and is read-only once
  // the volume reserves it (stem_reserved).
  let colStem         = $state('');
  let isCreating        = $state(false);
  let createError       = $state('');
  let editingCollection = $state<Collection | null>(null);

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

  let stemLocked = $derived(!!editingCollection?.stem_reserved);
  // Required on a new volume and on one that already has a stem: a stem can
  // be changed before the first capture, but never blanked. Only a volume
  // that has never had one may be saved without it.
  let stemRequired = $derived(!editingCollection || !!editingCollection.filename_stem);
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

  onMount(async () => {
    await Promise.all([loadProject(), loadCollections(), loadRecordCount(), loadMembers()]);
    // ?editVolume=<id> opens that volume's form: the capture screen links
    // here when the volume has no stem yet.
    const editId = Number($page.url.searchParams.get('editVolume')) || 0;
    if (editId && canCreate) {
      const target = collections.find(c => c.id === editId);
      if (target) openEditCollection(target);
    }
  });

  async function loadProject() {
    try {
      project = await projectsApi.get(projectId);
    } catch (err) {
      console.error('[ProjectDetail] Error loading project:', err);
    }
  }

  async function loadRecordCount() {
    try {
      directRecordCount = await recordsApi.count({ project_id: projectId });
    } catch (err) {
      console.error('[ProjectDetail] Error loading record count:', err);
    }
  }

  let members            = $state<ProjectMember[]>([]);
  let showMembersModal   = $state(false);
  let memberSearchQuery  = $state('');
  let allUsers           = $state<UserRead[]>([]);
  let addUserId          = $state<number | null>(null);
  let addRole            = $state<'operator' | 'reviewer'>('reviewer');
  let isAddingMember     = $state(false);
  let memberError        = $state('');

  let filteredUsers = $derived(
    allUsers.filter(u =>
      u.role !== 'admin' &&                          // admins are always implicit
      !members.some(m => m.user_id === u.id) &&      // not already a member
      u.id !== $authStore.user?.id                   // not yourself
    )
  );

  async function loadMembers() {
    try {
      members = await projectMembersApi.list(projectId);
    } catch (err) {
      console.error('[ProjectDetail] Error loading members:', err);
    }
  }

  async function openMembersModal() {
    showMembersModal = true;
    memberError = '';
    if (canManageMembers && allUsers.length === 0) {
      try {
        const { usersApi } = await import('$lib/api');
        allUsers = await usersApi.list();
      } catch (err) {
        console.error('[ProjectDetail] Error loading users:', err);
      }
    }
  }

  async function handleAddMember() {
    if (!addUserId) return;
    isAddingMember = true;
    memberError = '';
    try {
      await projectMembersApi.add(projectId, { user_id: addUserId, role: addRole });
      await loadMembers();
      addUserId = null;
      addRole = 'reviewer';
    } catch (err) {
      memberError = err instanceof Error ? err.message : $m.pd_err_member_add;
    } finally {
      isAddingMember = false;
    }
  }

  async function handleRemoveMember(userId: number) {
    try {
      await projectMembersApi.remove(projectId, userId);
      await loadMembers();
    } catch (err) {
      memberError = err instanceof Error ? err.message : $m.pd_err_member_remove;
    }
  }

  async function loadCollections() {
    try {
      isLoading = true;
      const data = await collectionsApi.listAll({ project_id: projectId });
      collections = data;
    } catch (err) {
      console.error('[ProjectDetail] Error loading collections:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleCreateCollection() {
    if (!colName.trim() || stemInvalid) return;
    isCreating = true;
    createError = '';

    try {
      const archMeta: Record<string, string> = {};
      if (colDateStart)        archMeta.date_start = colDateStart;
      if (colDateEnd)          archMeta.date_end   = colDateEnd;
      if (colCreator.trim())   archMeta.creator    = colCreator.trim();
      if (colSignatura.trim()) archMeta.signatura  = colSignatura.trim();
      const archivalMetadata = Object.keys(archMeta).length > 0 ? archMeta : undefined;

      const stem = colStem.trim();
      if (editingCollection) {
        // The stem is sent only when it changed to a non-empty value, and
        // never once it is reserved; null is never sent.
        const stemChanged = !stemLocked && stem !== '' && stem !== (editingCollection.filename_stem ?? '');
        await collectionsApi.update(editingCollection.id, {
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          archival_metadata: archivalMetadata,
          ...(stemChanged ? { filename_stem: stem } : {}),
        });
        await loadCollections();
      } else {
        await collectionsApi.create({
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          project_id: projectId,
          created_by: $authStore.user?.username,
          archival_metadata: archivalMetadata,
          filename_stem: stem,
        });
        await loadCollections();
      }

      showCreateModal = false;
      editingCollection = null;
      colName = ''; colDesc = '';
      colDateStart = ''; colDateEnd = '';
      colCreator = ''; colSignatura = '';
      colStem = '';

    } catch (err) {
      // Known cases have their own message, anything else a generic one; the
      // backend's English text goes to the console only.
      createError = volumeSaveErrorText(err, $m);
      console.error('[ProjectDetail] Error creating collection:', err);
    } finally {
      isCreating = false;
    }
  }

  function closeModal() {
    showCreateModal = false;
    createError = '';
    editingCollection = null;
    colName = ''; colDesc = '';
    colDateStart = ''; colDateEnd = '';
    colCreator = ''; colSignatura = '';
    colStem = '';
  }

  function handleCollectionClick(collectionId: number) {
    goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
  }

  let openColMenuId = $state<number | null>(null);

  // Delete collection modal state
  let showDeleteColModal     = $state(false);
  let deletingCol            = $state<Collection | null>(null);
  let deleteColRecordCount   = $state(0);
  let deleteMoveColTarget    = $state<number | ''>('');
  let isDeletingCol          = $state(false);
  let deleteColError         = $state('');
  let isLoadingDeleteColInfo = $state(false);
  // Set when the backend refused the delete because the volume still holds
  // sub-volumes. This screen cannot move those, so the modal offers no
  // target, the delete stays disabled, and records are never moved.
  let deleteBlockedBySubvolumes = $state(false);

  $effect(() => {
    if (openColMenuId !== null) {
      const close = () => { openColMenuId = null; };
      document.addEventListener('click', close, { once: true });
      return () => document.removeEventListener('click', close);
    }
  });

  function openColMenu(e: MouseEvent, id: number) {
    e.stopPropagation();
    openColMenuId = openColMenuId === id ? null : id;
  }

  function startEditCollection(e: MouseEvent, col: Collection) {
    e.stopPropagation();
    openEditCollection(col);
  }

  function openEditCollection(col: Collection) {
    openColMenuId = null;
    createError = '';
    editingCollection = col;
    colStem      = col.filename_stem ?? '';
    colName      = col.name;
    colDesc      = col.description ?? '';
    colSignatura = col.archival_metadata?.signatura ?? '';
    colCreator   = col.archival_metadata?.creator ?? '';
    colDateStart = col.archival_metadata?.date_start ?? '';
    colDateEnd   = col.archival_metadata?.date_end ?? '';
    showCreateModal = true;
  }

  async function openDeleteColModal(e: MouseEvent, col: Collection) {
    e.stopPropagation();
    openColMenuId = null;
    deletingCol = col;
    deleteMoveColTarget = '';
    deleteColError = '';
    deleteColRecordCount = 0;
    deleteBlockedBySubvolumes = false;
    showDeleteColModal = true;
    isLoadingDeleteColInfo = true;
    try {
      deleteColRecordCount = await recordsApi.count({ collection_id: col.id });
    } catch (err) {
      console.error('[ProjectDetail] Error fetching collection info:', err);
    } finally {
      isLoadingDeleteColInfo = false;
    }
  }

  function closeDeleteColModal() {
    showDeleteColModal = false;
    deletingCol = null;
    deleteMoveColTarget = '';
    deleteColError = '';
    deleteBlockedBySubvolumes = false;
    isDeletingCol = false;
  }

  async function executeDeleteCol() {
    if (!deletingCol || deleteRefused(deletingCol) || deleteBlockedBySubvolumes) return;
    isDeletingCol = true;
    deleteColError = '';
    try {
      if (deleteMoveColTarget !== '') {
        // The list may be older than the volume's last capture. Moving the
        // records out of a volume the backend then refuses to delete would
        // leave them moved and the volume still there, so the volume is read
        // again first and the move is skipped once it reserves its stem.
        const fresh = await collectionsApi.get(deletingCol.id);
        if (deleteRefused(fresh)) {
          deletingCol = fresh;
          isDeletingCol = false;
          await loadCollections();
          return;
        }
        await collectionsApi.moveRecords(deletingCol.id, Number(deleteMoveColTarget));
      }
      await collectionsApi.delete(deletingCol.id);
      await loadCollections();
      closeDeleteColModal();
    } catch (err) {
      const conflict = stemConflict(err);
      if (conflict === 'stem_reserved' && deletingCol) {
        // The backend refused: the modal switches to the reserved notice,
        // which says why, and the delete stays disabled.
        deletingCol = { ...deletingCol, stem_reserved: true };
        await loadCollections();
      } else if (isNotEmptyRefusal(err) && deletingCol) {
        console.error('[ProjectDetail] Error deleting volume:', err);
        const counts = notEmptyCounts(err);
        if (counts && counts.subVolumes > 0) {
          // Sub-volumes block the delete, with or without records: moving
          // the records would not be enough, so no target is offered.
          deleteBlockedBySubvolumes = true;
          deleteMoveColTarget = '';
          deleteColError = $m.pd_err_delete_has_subvolumes;
        } else if (deleteMoveColTarget === '') {
          // The modal opened believing the volume was empty, and it is not.
          // The count is read again so the target select appears here.
          try {
            deleteColRecordCount = await recordsApi.count({ collection_id: deletingCol.id });
          } catch (countErr) {
            console.error('[ProjectDetail] Error fetching collection info:', countErr);
          }
          if (deleteColRecordCount === 0) {
            // The count could not be read, or the records left meanwhile.
            deleteColError = volumeDeleteErrorText(err, $m);
          }
        } else {
          deleteColError = volumeDeleteErrorText(err, $m);
        }
      } else {
        // The backend's English text goes to the console only.
        deleteColError = volumeDeleteErrorText(err, $m);
        console.error('[ProjectDetail] Error deleting volume:', err);
      }
      isDeletingCol = false;
    }
  }

  // Placeholder statuses, not read from the backend: the Status column cycles
  // through them by row index.
  let mockStatuses = $derived([$m.pd_status_active, $m.pd_status_active, $m.proj_status_paused, $m.pd_status_active, $m.pd_status_completed]);

  function getStatusStyle(status: string): string {
    if (status === $m.pd_status_active)    return 'color: var(--color-primary); background: rgba(90,140,98,0.15)';
    if (status === $m.proj_status_paused)    return 'color: var(--color-light-grey); background: rgba(171,183,183,0.12)';
    if (status === $m.pd_status_completed) return 'color: var(--color-success); background: rgba(111,191,115,0.15)';
    return '';
  }
</script>

<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">{project?.name ?? '—'}</h1>
      <p class="page-subtitle">{$m.pd_subtitle}</p>
    </div>
    <!-- Only once volumes exist: the empty state has its own create button. -->
    {#if canCreate && collections.length > 0}
      <button class="btn-primary" data-tour="nuevo-volumen" onclick={() => showCreateModal = true}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {$m.pd_new_collection}
      </button>
    {/if}
  </div>

  <button class="btn-back" onclick={() => goto('/dashboard/projects')}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2.5 12H21M2.5 12l5-5M2.5 12l5 5"/>
    </svg>
    {$m.pd_back}
  </button>

  <div class="kpi-bar">
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-line" style="background: var(--color-primary)"></div>
        <div class="kpi-num">{formatCount(collections.length, $locale)}</div>
        <div class="kpi-lbl">{$m.dash_kpi_collections}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-line" style="background: var(--color-secondary)"></div>
        <div class="kpi-num">{recordCount ?? '—'}</div>
        <div class="kpi-lbl">{$m.pd_kpi_total_records}</div>
      </div>
    </div>

    <button class="btn-collaborators" onclick={openMembersModal}>
      <span class="material-symbols-outlined icon-sm">group</span>
      <span>{$m.pd_members}</span>
      {#if members.length > 0}
        <span class="member-badge">{formatCount(members.length, $locale)}</span>
      {/if}
    </button>
  </div>

  <div class="toolbar">
    <div class="search-wrapper">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" placeholder={$m.proj_search_placeholder} bind:value={searchQuery} class="search-input" />
    </div>
  </div>

  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>{$m.pd_loading}</span>
    </div>
  {:else if filteredCollections.length === 0}
    <div class="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>{searchQuery ? $m.pd_empty_search : $m.pd_empty}</span>
      {#if canCreate && !searchQuery}
        <button class="btn-primary" onclick={() => showCreateModal = true}>{$m.pd_create_first}</button>
      {/if}
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="collections-table">
        <thead>
          <tr>
            <th>{$m.pd_col_collection}</th>
            <th>{$m.common_status}</th>
            <th>{$m.pd_col_records}</th>
            <th>{$m.pd_col_date}</th>
            <th class="text-right">{$m.common_actions}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredCollections as col, i}
            {@const status  = mockStatuses[i % mockStatuses.length]}

            <tr class="table-row" onclick={() => handleCollectionClick(col.id)}>
              <td>
                <div class="col-cell">
                  <div class="col-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <p class="col-name">
                      {col.name}
                      {#if needsStem(col)}
                        {#if canCreate}
                          <button
                            type="button"
                            class="no-stem-badge"
                            title={$m.pd_no_stem_title}
                            onclick={(e) => startEditCollection(e, col)}
                          >{$m.pd_no_stem_badge}</button>
                        {:else}
                          <span class="no-stem-badge" title={$m.pd_no_stem_title}>{$m.pd_no_stem_badge}</span>
                        {/if}
                      {/if}
                    </p>
                    <!-- Only a signatura the volume has: no code is built from the project's or the row number. -->
                    {#if col.archival_metadata?.signatura}
                      <p class="col-code">{col.archival_metadata.signatura}</p>
                    {/if}
                  </div>
                </div>
              </td>

              <td>
                <span class="status-badge" style={getStatusStyle(status)}>{status}</span>
              </td>

              <td>
                <div class="img-count">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  {col.record_count ?? 0}
                </div>
              </td>

              <td>
                <div class="date-cell">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {col.created_at ? formatApiDate(col.created_at, $locale, { day:'numeric', month:'short', year:'numeric' }) : '—'}
                </div>
              </td>

              <td class="text-right">
                <div class="action-menu-wrap">
                  <button
                    class="btn-menu"
                    onclick={(e) => openColMenu(e, col.id)}
                    title={$m.common_actions}
                  >
                    <span class="material-symbols-outlined icon-sm">more_vert</span>
                  </button>
                  {#if openColMenuId === col.id}
                    <div class="action-menu">
                      <button class="action-item" onclick={(e) => startEditCollection(e, col)}>
                        <span class="material-symbols-outlined icon-sm">edit</span>
                        {$m.common_edit}
                      </button>
                      {#if $userRole === 'admin' || $userRole === 'operator'}
                        <button class="action-item action-item-danger" onclick={(e) => openDeleteColModal(e, col)}>
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
    <div class="modal-card">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">{editingCollection ? $m.pd_modal_edit_title : $m.pd_modal_create_title}</h3>
          <p class="modal-subtitle">{$m.pd_modal_project(project?.name ?? '—')}</p>
        </div>
        <button class="modal-close" onclick={closeModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

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

        <VolumeStemField bind:value={colStem} locked={stemLocked} required={stemRequired} />

        <div class="form-field">
          <label class="field-label">{$m.pd_field_refcode}</label>
          <input
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

        <div class="form-field">
          <label class="field-label">{$m.pd_field_notes}</label>
          <textarea
            class="field-textarea"
            placeholder={$m.pd_ph_notes}
            bind:value={colDesc}
          ></textarea>
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

      <div class="modal-actions">
        <button class="btn-ghost" onclick={closeModal}>{$m.common_cancel}</button>
        <button
          class="btn-crear"
          onclick={handleCreateCollection}
          disabled={isCreating || !colName.trim() || dateError !== '' || stemInvalid}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {isCreating ? (editingCollection ? $m.common_saving : $m.common_creating) : (editingCollection ? $m.common_save_changes : $m.pd_create_btn)}
        </button>
      </div>

    </div>
  </div>
{/if}

{#if showMembersModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) { showMembersModal = false; } }}>
    <div class="modal-card modal-card--wide">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">{$m.pd_members}</h3>
          <p class="modal-subtitle">{$m.pd_modal_project(project?.name ?? '—')}</p>
        </div>
        <button class="modal-close modal-close--circle" onclick={() => showMembersModal = false} aria-label={$m.common_close}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">

        <!-- Current members list -->
        <ul class="members-list">
          {#each members as member}
            <li class="member-row" class:member-row--implicit={member.is_implicit}>
              <div class="member-av">{member.username.slice(0,2).toUpperCase()}</div>
              <div class="member-info">
                <span class="member-name">{member.username}</span>
                {#if member.email}
                  <span class="member-email">{member.email}</span>
                {/if}
              </div>
              <!-- The CSS class keeps the raw enum value; only the text is translated. -->
              <span class="role-badge role-badge--{member.role}">{$roleLabel(member.role)}</span>
              {#if member.is_implicit}
                <span class="member-implicit-icon" title={$m.pd_member_implicit}>
                  <span class="material-symbols-outlined icon-sm">lock</span>
                </span>
              {:else if canManageMembers}
                <button class="btn-remove-member" onclick={() => handleRemoveMember(member.user_id)} title={$m.pd_member_remove}>
                  <span class="material-symbols-outlined icon-sm">person_remove</span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>

        {#if canManageMembers}
          <div class="add-member-section">
            <p class="add-member-title">{$m.pd_member_add}</p>
            <div class="add-member-row">
              <select class="field-input add-member-select" bind:value={addUserId}>
                <option value={null}>{$m.pd_member_select}</option>
                {#each filteredUsers as u}
                  <option value={u.id}>{u.email ? `${u.username} (${u.email})` : u.username}</option>
                {/each}
              </select>
              <select class="field-input add-role-select" bind:value={addRole}>
                <option value="reviewer">{$m.role_reviewer}</option>
                <option value="operator">{$m.role_operator}</option>
              </select>
              <button
                class="btn-crear"
                onclick={handleAddMember}
                disabled={!addUserId || isAddingMember}
              >
                <span class="material-symbols-outlined icon-sm">person_add</span>
                {isAddingMember ? $m.pd_member_adding : $m.pd_member_add_btn}
              </button>
            </div>
          </div>
        {/if}

        {#if memberError}
          <div class="create-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            {memberError}
          </div>
        {/if}

      </div>

    </div>
  </div>
{/if}

{#if showDeleteColModal && deletingCol}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeDeleteColModal(); }}>
    <div class="modal-card delete-modal-card">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">{$m.pd_delete_collection_title}</h3>
          <p class="modal-subtitle">{deletingCol.name}</p>
        </div>
        <button class="modal-close" onclick={closeDeleteColModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {#if deleteRefused(deletingCol)}
        <!-- The backend refuses this delete (409); nothing is moved first. -->
        <div class="delete-warning" role="note">
          <div class="delete-warning-icon">
            <span class="material-symbols-outlined icon-md">lock</span>
          </div>
          <p class="delete-warning-body">{$m.pd_delete_stem_reserved}</p>
        </div>
      {:else if deleteBlockedBySubvolumes}
        <!-- No target select: the error below says why the delete is refused. -->
      {:else if isLoadingDeleteColInfo}
        <div class="delete-loading">
          <div class="spinner"></div>
          {$m.pd_delete_loading}
        </div>
      {:else if deleteColRecordCount > 0}
        <div class="delete-warning">
          <div class="delete-warning-icon">
            <span class="material-symbols-outlined icon-md">warning</span>
          </div>
          <div>
            <p class="delete-warning-title">{$m.pd_col_not_empty}</p>
            <p class="delete-warning-body">
              {$m.proj_contains_pre}<strong>{$m.pd_records_count(deleteColRecordCount)}</strong>.
              {$m.pd_delete_warning}
            </p>
          </div>
        </div>

        <div class="delete-move-section">
          <!-- The backend refuses to delete a volume that still has records,
               so a target is required and the empty option is a placeholder. -->
          <label class="field-label" for="delete-move-target">{$m.pd_move_label}</label>
          <select id="delete-move-target" class="field-input" bind:value={deleteMoveColTarget} required aria-required="true">
            <option value="" disabled>{$m.pd_move_none}</option>
            {#each collections.filter(c => c.id !== deletingCol!.id) as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
          {#if deleteMoveColTarget === ''}
            <p class="delete-move-hint">{$m.pd_move_hint_none}</p>
          {:else}
            <p class="delete-move-hint">{$m.pd_move_hint_selected}</p>
          {/if}
        </div>
      {:else}
        <p class="delete-confirm-text">
          {$m.pd_delete_confirm_pre}<strong>"{deletingCol.name}"</strong>? {$m.common_irreversible}
        </p>
      {/if}

      {#if deleteColError}
        <div class="create-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          {deleteColError}
        </div>
      {/if}

      <div class="modal-actions">
        <button class="btn-ghost" onclick={closeDeleteColModal} disabled={isDeletingCol}>{$m.common_cancel}</button>
        <button
          class="btn-danger"
          onclick={executeDeleteCol}
          disabled={isDeletingCol || isLoadingDeleteColInfo || deleteRefused(deletingCol)
            || deleteBlockedBySubvolumes
            || (deleteColRecordCount > 0 && deleteMoveColTarget === '')}
        >
          <span class="material-symbols-outlined icon-sm">delete</span>
          {isDeletingCol ? $m.common_deleting : (deleteMoveColTarget !== '' ? $m.proj_move_and_delete : $m.pd_delete_collection_title)}
        </button>
      </div>

    </div>
  </div>
{/if}

<style>
  .page { padding: 32px; max-width: 1100px; }

  /* Header */
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .page-title  { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .btn-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    margin-bottom: 24px;
    min-height: var(--touch-target-min);
  }

  .btn-back:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  /* KPI row */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 28px;
  }

  .kpi-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 12px 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .kpi-line {
    width: 24px;
    height: 2px;
    border-radius: var(--radius-full);
    margin-bottom: 2px;
  }

  .kpi-num  { font-size: var(--text-h3); font-weight: var(--fw-extrabold); color: var(--color-light); margin: 0; line-height: 1; }
  .kpi-lbl  { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; text-transform: uppercase; letter-spacing: 0.04em; }

  /* Toolbar */
  .toolbar { display: flex; gap: 12px; margin-bottom: 16px; }

  .search-wrapper { position: relative; flex: 1; max-width: 400px; }

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
  .search-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  /* Buttons */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 7px;
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
    width: 30px; height: 30px;
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
  .collections-table thead tr:first-child th:first-child { border-top-left-radius: var(--radius-xl); }
  .collections-table thead tr:first-child th:last-child  { border-top-right-radius: var(--radius-xl); }
  .collections-table tbody tr:last-child td:first-child  { border-bottom-left-radius: var(--radius-xl); }
  .collections-table tbody tr:last-child td:last-child   { border-bottom-right-radius: var(--radius-xl); }

  .collections-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    text-align: left;
  }

  .collections-table thead tr {
    background-color: var(--color-surface-alt);
    border-bottom: 1px solid var(--border-color);
  }

  .collections-table th {
    padding: 12px 20px;
    font-size: 11px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .collections-table th.text-right { text-align: right; }
  .collections-table td { padding: 14px 20px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
  .collections-table tbody tr:last-child td { border-bottom: none; }

  .table-row { cursor: pointer; transition: background-color var(--transition-fast); }
  .table-row:hover { background-color: rgba(255,255,255,0.02); }
  .text-right { text-align: right; }

  /* Cells */
  .col-cell { display: flex; align-items: center; gap: 12px; }

  .col-icon {
    width: 34px; height: 34px;
    border-radius: var(--radius-md);
    background-color: rgba(90,140,98,0.15);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .col-name { font-weight: var(--fw-semibold); color: var(--color-light); margin: 0 0 2px; }
  .col-code { font-size: 11px; color: var(--color-light-grey); margin: 0; }
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
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }

  .img-count {
    display: flex; align-items: center; gap: 7px;
    color: var(--color-light-grey);
    font-size: var(--text-sm);
  }

  .manager-cell {
    display: flex; align-items: center; gap: 8px;
    font-size: var(--text-sm); color: var(--color-light-grey);
  }

  .manager-av {
    width: 26px; height: 26px;
    border-radius: 50%;
    background-color: rgba(90,140,98,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: var(--fw-bold);
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .date-cell { display: flex; align-items: center; gap: 7px; color: var(--color-light-grey); white-space: nowrap; }

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

  /* ── Modal ── */
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

  /* Close button of the members modal: a circle with a 44x44 touch target
     (--touch-target-min) and visible hover/active feedback (same pattern as
     .btn-back in the volume view's +layout@.svelte and the global
     .btn:active). */
  .modal-close--circle {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    border-radius: var(--radius-full);
  }

  .modal-close--circle:hover { background-color: var(--border-color); }

  .modal-close--circle:active {
    background-color: var(--border-color);
    transform: scale(0.97);
  }

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

  /* KPI bar — cards + collaborators button side by side */
  .kpi-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    flex-wrap: wrap;
  }

  .btn-collaborators {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
    white-space: nowrap;
    margin-left: auto;
  }

  .btn-collaborators:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  .member-badge {
    background: var(--color-primary);
    color: white;
    font-size: 11px;
    font-weight: var(--fw-bold);
    border-radius: 99px;
    padding: 1px 7px;
    line-height: 1.6;
  }

  /* Wide modal variant */
  .modal-card--wide { max-width: 540px; width: 100%; }

  /* Members list */
  .members-list {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .members-empty {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0 0 20px;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    background: var(--color-surface-alt);
  }

  .member-av {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: rgba(90,140,98,0.2);
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .member-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .member-name { font-size: var(--text-sm); color: var(--color-light); font-weight: var(--fw-semibold); }
  .member-email { font-size: var(--text-xs); color: var(--color-light-grey); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .role-badge {
    font-size: 11px;
    font-weight: var(--fw-bold);
    padding: 2px 8px;
    border-radius: 99px;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .role-badge--operator { background: rgba(150,177,240,0.15); color: var(--color-secondary); }
  .role-badge--reviewer  { background: rgba(171,183,183,0.12); color: var(--color-light-grey); }
  .role-badge--admin     { background: rgba(225,183,120,0.15); color: var(--color-highlight); }

  /* Implicit (admin) members — slightly muted row */
  .member-row--implicit { opacity: 0.75; }

  .member-implicit-icon {
    color: var(--color-light-grey);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 4px;
  }

  .btn-remove-member {
    background: none;
    border: none;
    color: var(--color-light-grey);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex; align-items: center;
    transition: color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-remove-member:hover { color: var(--color-error); }

  /* Add member section */
  .add-member-section {
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
  }

  .add-member-title {
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 10px;
  }

  .add-member-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .add-member-select { flex: 1; min-width: 160px; }
  .add-role-select   { width: 120px; flex-shrink: 0; }

  /* ── Archival date range ─────────────────────────────────── */
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

  .field-input--error {
    border-color: var(--color-error) !important;
  }

  .field-required { color: var(--color-error); margin-left: 2px; }

  /* ── Delete collection modal ─────────────────────────────── */
  .delete-modal-card { max-width: 460px; }

  .delete-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    color: var(--color-light-grey);
    font-size: var(--text-sm);
  }

  .delete-warning {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    background: rgba(220, 80, 60, 0.08);
    border: 1px solid rgba(220, 80, 60, 0.25);
    border-radius: var(--radius-md);
    padding: 14px 16px;
  }

  .delete-warning-icon {
    color: var(--color-error);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding-top: 1px;
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
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .delete-move-hint {
    font-size: 12px;
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.4;
  }

  .delete-confirm-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0;
    line-height: 1.5;
  }

  .btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
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
    transition: filter var(--transition-base);
  }

  .btn-danger:hover:not(:disabled) { filter: brightness(1.15); }
  .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }


</style>
<script lang="ts">
  // ============================================================================
  // PÁGINA: Detalle de Proyecto (Inside Proyecto)
  // Ruta: /shared/projects/[projectId]
  // Archivo: src/routes/(dashboard)/shared/projects/[projectId]/+page.svelte
  //
  // Muestra:
  //   - Nombre del proyecto + subtítulo
  //   - Botón "Volver a Proyectos"
  //   - KPI cards: Colecciones, Total imágenes, Colaboradores
  //   - Barra de búsqueda + Filtros
  //   - Tabla de colecciones: Colección, Estado, Núm. imágenes, Responsable, Fecha, Acciones
  //   - Botón "Nueva Colección" → modal
  //
  // Modal "Nueva Colección":
  //   - Nombre, Descripción, Cantidad estimada de imágenes
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { projectsApi, collectionsApi, recordsApi, projectMembersApi,
           type Project, type Collection, type ProjectMember, type UserRead } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PARÁMETROS DE RUTA
  // ---------------------------------------------------------------------------
  let projectId = $derived(Number($page.params.projectId) || 0);

  // ---------------------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------------------
  let project     = $state<Project | null>(null);
  let collections = $state<Collection[]>([]);
  let isLoading   = $state(true);
  let searchQuery = $state('');
  let recordCount = $state<number | null>(null);

  let canCreate = $derived($authStore.user?.role === 'admin');
  let canManageMembers = $derived(
    $authStore.user?.role === 'admin' || $authStore.user?.role === 'operator'
  );

  // Colecciones filtradas
  let filteredCollections = $derived(
    searchQuery.trim()
      ? collections.filter(c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : collections
  );

  // ---------------------------------------------------------------------------
  // MODAL: Nueva Colección
  // ---------------------------------------------------------------------------
  let showCreateModal = $state(false);
  let colName         = $state('');
  let colDesc         = $state('');
  let colDateStart    = $state('');
  let colDateEnd      = $state('');
  let colCreator      = $state('');
  let colSignatura    = $state('');
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

  let dateError = $derived(
    (colDateStart && !isValidISODate(colDateStart))
      ? 'Fecha de inicio inválida. Acepta año (AAAA), año-mes (AAAA-MM) o fecha completa (AAAA-MM-DD).'
      : (colDateEnd && !isValidISODate(colDateEnd))
      ? 'Fecha de fin inválida. Acepta año (AAAA), año-mes (AAAA-MM) o fecha completa (AAAA-MM-DD).'
      : (colDateStart && colDateEnd && colDateEnd < colDateStart)
      ? 'La fecha de fin no puede ser anterior a la fecha de inicio.'
      : ''
  );

  // ---------------------------------------------------------------------------
  // AL MONTAR
  // ---------------------------------------------------------------------------
  onMount(async () => {
    await Promise.all([loadProject(), loadCollections(), loadRecordCount(), loadMembers()]);
  });

  async function loadProject() {
    try {
      project = await projectsApi.get(projectId);
    } catch (err) {
      console.error('[ProjectDetail] Error cargando proyecto:', err);
    }
  }

  async function loadRecordCount() {
    try {
      recordCount = await recordsApi.count({ project_id: projectId });
    } catch (err) {
      console.error('[ProjectDetail] Error cargando conteo de registros:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // COLABORADORES
  // ---------------------------------------------------------------------------
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
      console.error('[ProjectDetail] Error cargando colaboradores:', err);
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
        console.error('[ProjectDetail] Error cargando usuarios:', err);
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
      memberError = err instanceof Error ? err.message : 'Error al añadir colaborador';
    } finally {
      isAddingMember = false;
    }
  }

  async function handleRemoveMember(userId: number) {
    try {
      await projectMembersApi.remove(projectId, userId);
      await loadMembers();
    } catch (err) {
      memberError = err instanceof Error ? err.message : 'Error al eliminar colaborador';
    }
  }

  async function loadCollections() {
    try {
      isLoading = true;
      const data = await collectionsApi.list({ project_id: projectId });
      collections = data;
    } catch (err) {
      console.error('[ProjectDetail] Error cargando colecciones:', err);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // CREAR COLECCIÓN
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // CREAR COLECCIÓN
  // Modo demo (token = demo-token): simula localmente sin llamar al backend.
  // Modo real: llama a collectionsApi.create() y recarga la lista.
  // ---------------------------------------------------------------------------
  async function handleCreateCollection() {
    if (!colName.trim()) return;
    isCreating = true;
    createError = '';

    try {
      const archMeta: Record<string, string> = {};
      if (colDateStart)        archMeta.date_start = colDateStart;
      if (colDateEnd)          archMeta.date_end   = colDateEnd;
      if (colCreator.trim())   archMeta.creator    = colCreator.trim();
      if (colSignatura.trim()) archMeta.signatura  = colSignatura.trim();
      const archivalMetadata = Object.keys(archMeta).length > 0 ? archMeta : undefined;

      if (editingCollection) {
        // Modo edición: actualizar colección existente
        await collectionsApi.update(editingCollection.id, {
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          archival_metadata: archivalMetadata,
        });
        await loadCollections();
      } else if ($authStore.token === 'demo-token') {
        // Simular creación localmente sin backend
        const mockCollection = {
          id: Date.now(),
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          project_id: projectId,
          created_at: new Date().toISOString(),
          created_by: $authStore.user?.username,
          record_count: 0,
          archival_metadata: archivalMetadata,
        } as any;
        collections = [...collections, mockCollection];
      } else {
        // Modo real: llamada al backend
        await collectionsApi.create({
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          project_id: projectId,
          created_by: $authStore.user?.username,
          archival_metadata: archivalMetadata,
        });
        await loadCollections();
      }

      showCreateModal = false;
      editingCollection = null;
      colName = ''; colDesc = '';
      colDateStart = ''; colDateEnd = '';
      colCreator = ''; colSignatura = '';

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      createError = `No se pudo crear la colección: ${msg}`;
      console.error('[ProjectDetail] Error creando colección:', err);
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
  }

  // ---------------------------------------------------------------------------
  // NAVEGAR A LA COLECCIÓN
  // ---------------------------------------------------------------------------
  function handleCollectionClick(collectionId: number) {
    goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
  }

  // ---------------------------------------------------------------------------
  // MENÚ DE ACCIONES POR COLECCIÓN
  // ---------------------------------------------------------------------------
  let openColMenuId = $state<number | null>(null);

  // Delete collection modal state
  let showDeleteColModal     = $state(false);
  let deletingCol            = $state<Collection | null>(null);
  let deleteColRecordCount   = $state(0);
  let deleteMoveColTarget    = $state<number | ''>('');
  let isDeletingCol          = $state(false);
  let deleteColError         = $state('');
  let isLoadingDeleteColInfo = $state(false);

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
    openColMenuId = null;
    editingCollection = col;
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
    showDeleteColModal = true;
    isLoadingDeleteColInfo = true;
    try {
      deleteColRecordCount = await recordsApi.count({ collection_id: col.id });
    } catch (err) {
      console.error('[ProjectDetail] Error obteniendo info de colección:', err);
    } finally {
      isLoadingDeleteColInfo = false;
    }
  }

  function closeDeleteColModal() {
    showDeleteColModal = false;
    deletingCol = null;
    deleteMoveColTarget = '';
    deleteColError = '';
    isDeletingCol = false;
  }

  async function executeDeleteCol() {
    if (!deletingCol) return;
    isDeletingCol = true;
    deleteColError = '';
    try {
      if (deleteMoveColTarget !== '') {
        await collectionsApi.moveRecords(deletingCol.id, Number(deleteMoveColTarget));
      }
      await collectionsApi.delete(deletingCol.id);
      await loadCollections();
      closeDeleteColModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deleteColError = `No se pudo eliminar la colección: ${msg}`;
      isDeletingCol = false;
    }
  }

  // ---------------------------------------------------------------------------
  // HELPERS DE UI (mock — conectar con backend)
  // ---------------------------------------------------------------------------
  const mockStatuses = ['Activa', 'Activa', 'Pausado', 'Activa', 'Completada'];

  function getStatusStyle(status: string): string {
    if (status === 'Activa')     return 'color: var(--color-primary); background: rgba(90,140,98,0.15)';
    if (status === 'Pausado')    return 'color: var(--color-light-grey); background: rgba(171,183,183,0.12)';
    if (status === 'Completada') return 'color: var(--color-success); background: rgba(111,191,115,0.15)';
    return '';
  }
</script>

<!-- ============================================================
     PÁGINA DE DETALLE DE PROYECTO
     ============================================================ -->
<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">{project?.name ?? '—'}</h1>
      <p class="page-subtitle">Gestión de colecciones del proyecto</p>
    </div>
    <!-- Botón "+ Nueva colección" solo visible cuando ya hay colecciones -->
    {#if canCreate && collections.length > 0}
      <button class="btn-primary" onclick={() => showCreateModal = true}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nueva colección
      </button>
    {/if}
  </div>

  <!-- Botón volver -->
  <button class="btn-back" onclick={() => goto('/dashboard/projects')}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2.5 12H21M2.5 12l5-5M2.5 12l5 5"/>
    </svg>
    Volver a Proyectos
  </button>

  <!-- KPI Cards + Colaboradores button -->
  <div class="kpi-bar">
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-line" style="background: var(--color-primary)"></div>
        <div class="kpi-num">{collections.length}</div>
        <div class="kpi-lbl">Colecciones</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-line" style="background: var(--color-secondary)"></div>
        <div class="kpi-num">{recordCount ?? '—'}</div>
        <div class="kpi-lbl">Total imágenes</div>
      </div>
    </div>

    <button class="btn-collaborators" onclick={openMembersModal}>
      <span class="material-symbols-outlined icon-sm">group</span>
      <span>Colaboradores</span>
      {#if members.length > 0}
        <span class="member-badge">{members.length}</span>
      {/if}
    </button>
  </div>

  <!-- Búsqueda + Filtros -->
  <div class="toolbar">
    <div class="search-wrapper">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" placeholder="Buscar por nombre, código..." bind:value={searchQuery} class="search-input" />
    </div>
    <button class="btn-ghost">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      Filtros
    </button>
  </div>

  <!-- Tabla de colecciones -->
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Cargando colecciones...</span>
    </div>
  {:else if filteredCollections.length === 0}
    <div class="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>{searchQuery ? 'Sin resultados' : 'No hay colecciones aún'}</span>
      {#if canCreate && !searchQuery}
        <button class="btn-primary" onclick={() => showCreateModal = true}>Crear primera colección</button>
      {/if}
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="collections-table">
        <thead>
          <tr>
            <th>Colección</th>
            <th>Estado</th>
            <th>Núm. Imágenes</th>
            <th>Fecha</th>
            <th class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredCollections as col, i}
            {@const status  = mockStatuses[i % mockStatuses.length]}

            <tr class="table-row" onclick={() => handleCollectionClick(col.id)}>
              <!-- Colección -->
              <td>
                <div class="col-cell">
                  <div class="col-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <p class="col-name">{col.name}</p>
                    <p class="col-code">{col.archival_metadata?.signatura ?? (project?.signatura ? `${project.signatura}-${String(i+1).padStart(3,'0')}` : String(i+1).padStart(3,'0'))}</p>
                  </div>
                </div>
              </td>

              <!-- Estado -->
              <td>
                <span class="status-badge" style={getStatusStyle(status)}>{status}</span>
              </td>

              <!-- Núm. imágenes -->
              <td>
                <div class="img-count">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  {col.record_count ?? 0}
                </div>
              </td>

              <!-- Fecha -->
              <td>
                <div class="date-cell">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {col.created_at ? new Date(col.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                </div>
              </td>

              <!-- Acciones -->
              <td class="text-right">
                <div class="action-menu-wrap">
                  <button
                    class="btn-menu"
                    onclick={(e) => openColMenu(e, col.id)}
                    title="Acciones"
                  >
                    <span class="material-symbols-outlined icon-sm">more_vert</span>
                  </button>
                  {#if openColMenuId === col.id}
                    <div class="action-menu">
                      <button class="action-item" onclick={(e) => startEditCollection(e, col)}>
                        <span class="material-symbols-outlined icon-sm">edit</span>
                        Editar
                      </button>
                      <button class="action-item action-item-danger" onclick={(e) => openDeleteColModal(e, col)}>
                        <span class="material-symbols-outlined icon-sm">delete</span>
                        Eliminar
                      </button>
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

<!-- ============================================================
     MODAL: Nueva Colección
     ============================================================ -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeModal(); }}>
    <div class="modal-card">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">{editingCollection ? 'Editar Colección' : 'Nueva Colección'}</h3>
          <p class="modal-subtitle">Proyecto: {project?.name ?? '—'}</p>
        </div>
        <button class="modal-close" onclick={closeModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Título -->
        <div class="form-field">
          <label class="field-label">TÍTULO <span class="field-required">*</span></label>
          <input
            class="field-input"
            type="text"
            placeholder="Ej: Misiones Religiosas"
            bind:value={colName}
            autofocus
          />
        </div>

        <!-- Signatura -->
        <div class="form-field">
          <label class="field-label">SIGNATURA</label>
          <input
            class="field-input"
            type="text"
            placeholder="Ej: CO.AGN.SAA-I.1.1.2"
            bind:value={colSignatura}
          />
        </div>

        <!-- Nombre del creador -->
        <div class="form-field">
          <label class="field-label">NOMBRE DEL CREADOR</label>
          <input
            class="field-input"
            type="text"
            placeholder="Persona o institución que creó los documentos"
            bind:value={colCreator}
          />
        </div>

        <!-- Fechas de creación -->
        <div class="form-field">
          <label class="field-label">FECHAS DE CREACIÓN</label>
          <div class="date-range-row">
            <div class="date-field">
              <span class="date-sub-label">DESDE</span>
              <input
                class="field-input"
                class:field-input--error={colDateStart !== '' && !isValidISODate(colDateStart)}
                type="text"
                placeholder="Ej: 1987, 1987-04 o 1987-04-15"
                bind:value={colDateStart}
              />
            </div>
            <span class="date-sep">—</span>
            <div class="date-field">
              <span class="date-sub-label">HASTA (opcional)</span>
              <input
                class="field-input"
                class:field-input--error={colDateEnd !== '' && !isValidISODate(colDateEnd)}
                type="text"
                placeholder="Ej: 1990, 1990-12 o 1990-12-31"
                bind:value={colDateEnd}
              />
            </div>
          </div>
          {#if dateError}
            <p class="date-error">{dateError}</p>
          {/if}
        </div>

        <!-- Notas / Descripción -->
        <div class="form-field">
          <label class="field-label">NOTAS / DESCRIPCIÓN</label>
          <textarea
            class="field-textarea"
            placeholder="Descripción breve u observaciones..."
            bind:value={colDesc}
          ></textarea>
        </div>
      </div>

      <!-- Error al crear colección -->
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
        <button class="btn-ghost" onclick={closeModal}>Cancelar</button>
        <button
          class="btn-crear"
          onclick={handleCreateCollection}
          disabled={isCreating || !colName.trim() || dateError !== ''}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {isCreating ? (editingCollection ? 'Guardando...' : 'Creando...') : (editingCollection ? 'Guardar cambios' : 'Crear Colección')}
        </button>
      </div>

    </div>
  </div>
{/if}

<!-- ============================================================
     MODAL: Colaboradores
     ============================================================ -->
{#if showMembersModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) { showMembersModal = false; } }}>
    <div class="modal-card modal-card--wide">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">Colaboradores</h3>
          <p class="modal-subtitle">Proyecto: {project?.name ?? '—'}</p>
        </div>
        <button class="modal-close" onclick={() => showMembersModal = false}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">

        <!-- Current members list -->
        <ul class="members-list">
          {#each members as m}
            <li class="member-row" class:member-row--implicit={m.is_implicit}>
              <div class="member-av">{m.username.slice(0,2).toUpperCase()}</div>
              <div class="member-info">
                <span class="member-name">{m.username}</span>
                <span class="member-email">{m.email}</span>
              </div>
              <span class="role-badge role-badge--{m.role}">{m.role}</span>
              {#if m.is_implicit}
                <span class="member-implicit-icon" title="Acceso implícito (no se puede eliminar)">
                  <span class="material-symbols-outlined icon-sm">lock</span>
                </span>
              {:else if canManageMembers}
                <button class="btn-remove-member" onclick={() => handleRemoveMember(m.user_id)} title="Eliminar colaborador">
                  <span class="material-symbols-outlined icon-sm">person_remove</span>
                </button>
              {/if}
            </li>
          {/each}
        </ul>

        <!-- Add member — only for admin/operator -->
        {#if canManageMembers}
          <div class="add-member-section">
            <p class="add-member-title">Añadir colaborador</p>
            <div class="add-member-row">
              <select class="field-input add-member-select" bind:value={addUserId}>
                <option value={null}>— Seleccionar usuario —</option>
                {#each filteredUsers as u}
                  <option value={u.id}>{u.username} ({u.email})</option>
                {/each}
              </select>
              <select class="field-input add-role-select" bind:value={addRole}>
                <option value="reviewer">Revisor</option>
                <option value="operator">Operador</option>
              </select>
              <button
                class="btn-crear"
                onclick={handleAddMember}
                disabled={!addUserId || isAddingMember}
              >
                <span class="material-symbols-outlined icon-sm">person_add</span>
                {isAddingMember ? 'Añadiendo...' : 'Añadir'}
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

      <div class="modal-actions">
        <button class="btn-ghost" onclick={() => showMembersModal = false}>Cerrar</button>
      </div>

    </div>
  </div>
{/if}

<!-- ============================================================
     MODAL: Eliminar Colección
     ============================================================ -->
{#if showDeleteColModal && deletingCol}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeDeleteColModal(); }}>
    <div class="modal-card delete-modal-card">

      <div class="modal-header">
        <div>
          <h3 class="modal-title">Eliminar colección</h3>
          <p class="modal-subtitle">{deletingCol.name}</p>
        </div>
        <button class="modal-close" onclick={closeDeleteColModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {#if isLoadingDeleteColInfo}
        <div class="delete-loading">
          <div class="spinner"></div>
          Cargando información...
        </div>
      {:else if deleteColRecordCount > 0}
        <div class="delete-warning">
          <div class="delete-warning-icon">
            <span class="material-symbols-outlined icon-md">warning</span>
          </div>
          <div>
            <p class="delete-warning-title">Esta colección no está vacía</p>
            <p class="delete-warning-body">
              Contiene <strong>{deleteColRecordCount} {deleteColRecordCount === 1 ? 'registro' : 'registros'}</strong>.
              Las imágenes asociadas se eliminarán permanentemente si no se mueven.
            </p>
          </div>
        </div>

        <div class="delete-move-section">
          <label class="field-label">MOVER REGISTROS ANTES DE ELIMINAR (OPCIONAL)</label>
          <select class="field-input" bind:value={deleteMoveColTarget}>
            <option value="">— Eliminar registros definitivamente —</option>
            {#each collections.filter(c => c.id !== deletingCol!.id) as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
          {#if deleteMoveColTarget === ''}
            <p class="delete-move-hint">Los registros e imágenes se perderán permanentemente.</p>
          {:else}
            <p class="delete-move-hint">Los registros se moverán a la colección seleccionada antes de eliminar.</p>
          {/if}
        </div>
      {:else}
        <p class="delete-confirm-text">
          ¿Estás seguro de que quieres eliminar la colección <strong>"{deletingCol.name}"</strong>? Esta acción no se puede deshacer.
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
        <button class="btn-ghost" onclick={closeDeleteColModal} disabled={isDeletingCol}>Cancelar</button>
        <button
          class="btn-danger"
          onclick={executeDeleteCol}
          disabled={isDeletingCol || isLoadingDeleteColInfo}
        >
          <span class="material-symbols-outlined icon-sm">delete</span>
          {isDeletingCol ? 'Eliminando...' : (deleteMoveColTarget !== '' ? 'Mover y eliminar' : 'Eliminar colección')}
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

  /* Botón volver */
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

  /* Rayita de color en la parte superior */
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
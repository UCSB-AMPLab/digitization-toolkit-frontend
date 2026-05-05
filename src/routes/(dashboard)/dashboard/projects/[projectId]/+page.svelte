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
  //   - Botón "+ Nueva Colección" → modal
  //
  // Modal "Nueva Colección":
  //   - Nombre, Descripción, Cantidad estimada de imágenes
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { projectsApi, collectionsApi, type Project, type Collection } from '$lib/api';

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

  let canCreate = $derived($authStore.user?.role === 'admin');

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
  let colQuantity     = $state(0);
  let isCreating      = $state(false);
  let createError     = $state('');

  // ---------------------------------------------------------------------------
  // AL MONTAR
  // ---------------------------------------------------------------------------
  onMount(async () => {
    await Promise.all([loadProject(), loadCollections()]);
  });

  async function loadProject() {
    try {
      project = await projectsApi.get(projectId);
    } catch (err) {
      console.error('[ProjectDetail] Error cargando proyecto:', err);
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
      const isDemoToken = $authStore.token === 'demo-token';

      if (isDemoToken) {
        // Simular creación localmente sin backend
        const mockCollection = {
          id: Date.now(),
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          project_id: projectId,
          created_at: new Date().toISOString(),
          created_by: $authStore.user?.username,
          record_count: 0,
        } as any;
        collections = [...collections, mockCollection];
      } else {
        // Modo real: llamada al backend
        await collectionsApi.create({
          name: colName.trim(),
          description: colDesc.trim() || undefined,
          project_id: projectId,
          created_by: $authStore.user?.username,
        });
        await loadCollections();
      }

      showCreateModal = false;
      colName = ''; colDesc = ''; colQuantity = 0;

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
    colName = ''; colDesc = ''; colQuantity = 0;
  }

  // ---------------------------------------------------------------------------
  // NAVEGAR A LA COLECCIÓN
  // ---------------------------------------------------------------------------
  function handleCollectionClick(collectionId: number) {
    goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
  }

  // ---------------------------------------------------------------------------
  // HELPERS DE UI (mock — conectar con backend)
  // ---------------------------------------------------------------------------
  const mockStatuses = ['Activa', 'Activa', 'Pausado', 'Activa', 'Completada'];
  const mockManagers = [
    { initials: 'MG', name: 'María García' },
    { initials: 'PM', name: 'Pedro Mora' },
    { initials: 'AR', name: 'Ana Ruiz' },
  ];

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
        + Nueva colección
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

  <!-- KPI Cards -->
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-primary)"></div>
      <div class="kpi-num">{collections.length}</div>
      <div class="kpi-lbl">Colecciones</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-secondary)"></div>
      <div class="kpi-num">1288</div>
      <div class="kpi-lbl">Total imágenes</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-warning)"></div>
      <div class="kpi-num">2</div>
      <div class="kpi-lbl">Colaboradores</div>
    </div>
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
            <th>Responsable</th>
            <th>Fecha</th>
            <th class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredCollections as col, i}
            {@const status  = mockStatuses[i % mockStatuses.length]}
            {@const manager = mockManagers[i % mockManagers.length]}

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
                    <p class="col-code">COL-{String(i+1).padStart(3,'0')}</p>
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
                  {col.record_count ?? (i * 89 + 45)}
                </div>
              </td>

              <!-- Responsable -->
              <td>
                <div class="manager-cell">
                  <div class="manager-av">{manager.initials}</div>
                  <span>{manager.name}</span>
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

              <!-- Acciones: botón Ver -->
              <td class="text-right">
                <button class="btn-ver" onclick={(e) => { e.stopPropagation(); handleCollectionClick(col.id); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  Ver
                </button>
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
          <h3 class="modal-title">Nueva Colección</h3>
          <p class="modal-subtitle">Proyecto: {project?.name ?? '—'}</p>
        </div>
        <button class="modal-close" onclick={closeModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Nombre -->
        <div class="form-field">
          <label class="field-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            NOMBRE DE LA COLECCIÓN
          </label>
          <input
            class="field-input"
            type="text"
            placeholder="Ej: Misiones Religiosas"
            bind:value={colName}
            autofocus
          />
        </div>

        <!-- Descripción -->
        <div class="form-field">
          <label class="field-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            DESCRIPCIÓN
          </label>
          <textarea
            class="field-textarea"
            placeholder="Descripción breve de la colección..."
            bind:value={colDesc}
          ></textarea>
        </div>

        <!-- Cantidad estimada -->
        <div class="form-field">
          <label class="field-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            CANTIDAD ESTIMADA DE IMÁGENES
          </label>
          <input class="field-input" type="number" bind:value={colQuantity} min="0" />
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
          disabled={isCreating || !colName.trim()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {isCreating ? 'Creando...' : 'Crear Colección'}
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
    border-radius: var(--radius-xl);
    padding: 20px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Rayita de color en la parte superior */
  .kpi-line {
    width: 32px;
    height: 3px;
    border-radius: var(--radius-full);
    margin-bottom: 4px;
  }

  .kpi-num  { font-size: var(--text-h2); font-weight: var(--fw-extrabold); color: var(--color-light); margin: 0; line-height: 1; }
  .kpi-lbl  { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

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
    overflow: hidden;
  }

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

  .btn-ver {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: 0;
    white-space: nowrap;
  }

  .btn-ver:hover { border-color: var(--color-primary); color: var(--color-primary); }

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
</style>
<script lang="ts">
  // ============================================================================
  // PÁGINA: Proyectos
  // Ruta: /shared/projects → src/routes/(dashboard)/shared/projects/+page.svelte
  //
  // Tabla de proyectos con:
  //   - Búsqueda por nombre/código
  //   - Filtros (dropdown)
  //   - Botón "+ Nuevo Proyecto" → abre el modal de creación
  //   - Tabla: Proyecto, Estado, Progreso, Equipo, Fecha Inicio, Acciones
  //   - Click en fila → navega a /shared/projects/{id}
  //
  // Modal "Crear Nuevo Proyecto" — 3 pasos:
  //   Paso 1: Información (nombre, descripción, ubicación, cant. estimada, fecha, prioridad)
  //   Paso 2: Configuración (resolución DPI, formato de salida, modo de color)
  //   Paso 3: Equipo (asignar operario + revisor)
  // ============================================================================

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore, userRole } from '$lib/stores/auth';
  import { projectsApi, usersApi, type Project, type UserRead } from '$lib/api';

  // ---------------------------------------------------------------------------
  // ESTADO: Lista de proyectos
  // ---------------------------------------------------------------------------
  let projects     = $state<Project[]>([]);
  let isLoading    = $state(true);
  let searchQuery  = $state('');

  // Proyectos filtrados por búsqueda
  let filteredProjects = $derived(
    searchQuery.trim()
      ? projects.filter(p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
      : projects
  );

  // ¿El usuario puede crear proyectos? (admin y operator)
  let canCreate = $derived(
    $authStore.user?.role === 'admin' || $authStore.user?.role === 'operator'
  );

  // ---------------------------------------------------------------------------
  // ESTADO: Modal de crear proyecto (formulario simplificado)
  // ---------------------------------------------------------------------------
  let showCreateModal = $state(false);

  // Campos del formulario
  let formName       = $state('');
  let formDesc       = $state('');
  let formLocation   = $state('');
  let formResolution = $state<'low' | 'medium' | 'high'>('medium');
  let formOperator   = $state('');

  let isCreating  = $state(false);
  let createError = $state('');

  // Lista de usuarios para el selector de operario
  let operatorUsers = $state<UserRead[]>([]);

  // ---------------------------------------------------------------------------
  // AL MONTAR: carga proyectos y usuarios operarios
  // ---------------------------------------------------------------------------
  onMount(async () => {
    await loadProjects();
    try {
      const allUsers = await usersApi.list();
      operatorUsers = allUsers.filter(u => u.is_active && (u.role === 'operator' || u.role === 'admin'));
    } catch {
      // no-op: selector queda vacío si falla
    }
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

  // ---------------------------------------------------------------------------
  // CREAR PROYECTO
  // ---------------------------------------------------------------------------
  async function handleCreateProject() {
    if (!formName.trim()) return;
    isCreating = true;
    createError = '';

    try {
      await projectsApi.create({
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        created_by: $authStore.user?.username,
      });
      await loadProjects();
      showCreateModal = false;
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      createError = `No se pudo crear el proyecto: ${msg}`;
    } finally {
      isCreating = false;
    }
  }

  function resetForm() {
    formName = ''; formDesc = ''; formLocation = '';
    formResolution = 'medium'; formOperator = '';
    createError = '';
  }

  function closeModal() {
    showCreateModal = false;
    resetForm();
  }

  // ---------------------------------------------------------------------------
  // NAVEGAR AL PROYECTO
  // ---------------------------------------------------------------------------
  function handleProjectClick(id: number) {
    goto(`/dashboard/projects/${id}`);
  }

  // ---------------------------------------------------------------------------
  // HELPERS DE ESTADO (mock — en producción vendrá del backend)
  // ---------------------------------------------------------------------------
  function getStatusStyle(status: string): string {
    const map: Record<string, string> = {
      'En Progreso': 'color: var(--color-primary); background: rgba(90,140,98,0.15)',
      'Iniciado':    'color: var(--color-secondary); background: rgba(150,177,240,0.15)',
      'Revisión':    'color: var(--color-warning); background: rgba(208,154,68,0.15)',
      'Pausado':     'color: var(--color-light-grey); background: rgba(171,183,183,0.12)',
      'Completado':  'color: var(--color-success); background: rgba(111,191,115,0.15)',
    };
    return map[status] ?? 'color: var(--color-light-grey); background: rgba(0,0,0,0.2)';
  }

  // Progreso simulado (conectar con backend cuando esté disponible)
  const mockProgress = [45, 12, 89, 60, 100];
  const mockStatuses = ['En Progreso', 'Iniciado', 'Revisión', 'Pausado', 'Completado'];
  const mockTeams = [['MG','JL'], ['PM'], ['AR','JL'], ['MG','PM'], ['AR']];

</script>

<!-- ============================================================
     PÁGINA DE PROYECTOS
     ============================================================ -->
<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Gestión de Proyectos</h1>
      <p class="page-subtitle">Administra los expedientes y asignaciones</p>
    </div>
    <!-- Botón "Nuevo Proyecto" solo visible cuando ya hay proyectos -->
    {#if canCreate && projects.length > 0}
      <button class="btn-primary" onclick={() => showCreateModal = true}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo Proyecto
      </button>
    {/if}
  </div>

  <!-- Búsqueda + Filtros -->
  <div class="toolbar">
    <div class="search-wrapper">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder="Buscar por nombre, código..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>
    <button class="btn-ghost">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      Filtros
    </button>
  </div>

  <!-- Tabla -->
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Cargando proyectos...</span>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>{searchQuery ? 'Sin resultados para tu búsqueda' : 'No hay proyectos aún'}</span>
      {#if canCreate && !searchQuery}
        <button class="btn-primary" onclick={() => showCreateModal = true}>Crear primer proyecto</button>
      {/if}
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="projects-table">
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Estado</th>
            <th>Progreso</th>
            <th>Equipo</th>
            <th>Fecha Inicio</th>
            <th class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredProjects as project, i}
            {@const progress = mockProgress[i % mockProgress.length]}
            {@const status   = mockStatuses[i % mockStatuses.length]}
            {@const team     = mockTeams[i % mockTeams.length]}

            <tr onclick={() => handleProjectClick(project.id)} class="table-row">
              <!-- Proyecto -->
              <td>
                <div class="project-cell">
                  <div class="project-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <p class="project-name">{project.name}</p>
                    <p class="project-code">{project.description?.slice(0, 20) ?? '—'}</p>
                  </div>
                </div>
              </td>

              <!-- Estado -->
              <td>
                <span class="status-badge" style={getStatusStyle(status)}>{status}</span>
              </td>

              <!-- Progreso -->
              <td>
                <div class="progress-cell">
                  <span class="progress-pct">{progress}%</span>
                  <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width:{progress}%"></div>
                  </div>
                </div>
              </td>

              <!-- Equipo -->
              <td>
                <div class="team-cell">
                  {#each team as member}
                    <div class="team-avatar">{member}</div>
                  {/each}
                  {#if canCreate}
                    <div class="team-add">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </div>
                  {/if}
                </div>
              </td>

              <!-- Fecha -->
              <td>
                <div class="date-cell">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {project.created_at ? new Date(project.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                </div>
              </td>

              <!-- Acciones: botón Ver que navega al detalle del proyecto -->
              <td class="text-right">
                <button
                  class="btn-ver"
                  onclick={(e) => { e.stopPropagation(); handleProjectClick(project.id); }}
                  title="Ver proyecto"
                >
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
     MODAL: Crear Nuevo Proyecto
     ============================================================ -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeModal(); }}>
    <div class="modal-card">

      <!-- Cabecera -->
      <div class="modal-header">
        <div>
          <h3 class="modal-title">Nuevo Proyecto</h3>
          <p class="modal-subtitle">Completa los datos para crear el proyecto</p>
        </div>
        <button class="modal-close" onclick={closeModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Formulario -->
      <div class="form-section">

        <div class="form-field">
          <label class="field-label">NOMBRE DEL PROYECTO <span class="field-required">*</span></label>
          <input
            class="field-input"
            type="text"
            placeholder="Ej: Fondo Colonial 2024"
            bind:value={formName}
            autofocus
          />
        </div>

        <div class="form-field">
          <label class="field-label">DESCRIPCIÓN</label>
          <input
            class="field-input"
            type="text"
            placeholder="Breve descripción del contenido"
            bind:value={formDesc}
          />
        </div>

        <div class="form-field">
          <label class="field-label">UBICACIÓN FÍSICA</label>
          <input
            class="field-input"
            type="text"
            placeholder="Ej: Estante 4, Caja 12"
            bind:value={formLocation}
          />
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="field-label">RESOLUCIÓN DE CAPTURA</label>
            <select class="field-input" bind:value={formResolution}>
              <option value="low">Baja (300 DPI)</option>
              <option value="medium">Media (600 DPI)</option>
              <option value="high">Alta (1200 DPI)</option>
            </select>
          </div>

          <div class="form-field">
            <label class="field-label">OPERARIO ASIGNADO</label>
            <select class="field-input" bind:value={formOperator}>
              <option value="">Sin asignar</option>
              {#each operatorUsers as user}
                <option value={user.username}>{user.username}</option>
              {/each}
            </select>
          </div>
        </div>

      </div>

      <!-- Error -->
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
        <button class="btn-ghost" onclick={closeModal}>Cancelar</button>
        <button
          class="btn-primary"
          onclick={handleCreateProject}
          disabled={isCreating || !formName.trim()}
        >
          {#if isCreating}
            <div class="spinner-sm"></div>
            Creando…
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Crear proyecto
          {/if}
        </button>
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

  /* Botón Ver en la tabla de proyectos */
  .btn-ver {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
    min-height: 0;
  }

  .btn-ver:hover { border-color: var(--color-primary); color: var(--color-primary); }

  .btn-icon {
    width: 32px; height: 32px;
    background: none; border: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .btn-icon:hover { background-color: rgba(255,255,255,0.05); color: var(--color-light); }

  /* Error en modal */
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
    overflow: hidden;
  }

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

  /* Celdas */
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

  .status-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: var(--radius-full);
    font-size: 12px;
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }

  .progress-cell { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
  .progress-pct  { font-size: 11px; color: var(--color-light-grey); }

  .progress-bar-bg {
    height: 4px;
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background-color: var(--color-primary);
    border-radius: var(--radius-full);
    transition: width var(--transition-slow);
  }

  .team-cell { display: flex; align-items: center; gap: -4px; }

  .team-avatar {
    width: 28px; height: 28px;
    border-radius: 50%;
    background-color: rgba(188,130,60,0.2);
    border: 2px solid var(--color-surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: var(--fw-bold);
    color: var(--color-warning);
    margin-right: -4px;
    flex-shrink: 0;
  }

  .team-add {
    width: 28px; height: 28px;
    border-radius: 50%;
    background-color: var(--color-surface-alt);
    border: 2px solid var(--color-surface);
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    margin-right: -4px;
    transition: all var(--transition-fast);
  }

  .team-add:hover { background-color: var(--color-primary); color: white; }

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
    max-height: 90vh;
    overflow-y: auto;
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
</style>
<script lang="ts">
  // ============================================================================
  // PÁGINA: Proyectos
  // Ruta: /shared/projects → src/routes/(dashboard)/shared/projects/+page.svelte
  //
  // Tabla de proyectos con:
  //   - Búsqueda por nombre/código
  //   - Filtros (dropdown)
  //   - Botón "+ Nuevo Proyecto" → abre el modal wizard de 3 pasos
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
  import { projectsApi, type Project } from '$lib/api';

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

  // ¿El usuario puede crear proyectos?
  // Solo admin puede crear proyectos
  let canCreate = $derived($authStore.user?.role === 'admin');

  // ---------------------------------------------------------------------------
  // ESTADO: Modal de crear proyecto (wizard 3 pasos)
  // ---------------------------------------------------------------------------
  let showCreateModal = $state(false);
  let wizardStep      = $state(1); // 1, 2 o 3

  // Datos del formulario — paso 1: información
  let formName      = $state('');
  let formDesc      = $state('');
  let formLocation  = $state('');
  let formQuantity  = $state(0);
  let formDate      = $state('');
  let formPriority  = $state('');

  // Datos del formulario — paso 2: configuración
  let formDpi       = $state<300 | 600 | 1200>(300);
  let formFormat    = $state<'TIFF' | 'JPEG' | 'PNG'>('TIFF');
  let formColorMode = $state('');

  // Datos del formulario — paso 3: equipo
  let formOperator  = $state('');
  let formReviewer  = $state('');

  let isCreating    = $state(false);

  // ---------------------------------------------------------------------------
  // AL MONTAR: carga proyectos
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // CREAR PROYECTO (paso 3 → Finalizar)
  // ---------------------------------------------------------------------------
  async function handleCreateProject() {
    if (!formName.trim()) return;
    isCreating = true;
    try {
      await projectsApi.create({
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        created_by: $authStore.user?.username,
      });
      showCreateModal = false;
      resetForm();
      await loadProjects();
    } catch (err) {
      console.error('[Projects] Error creando:', err);
    } finally {
      isCreating = false;
    }
  }

  function resetForm() {
    formName = ''; formDesc = ''; formLocation = '';
    formQuantity = 0; formDate = ''; formPriority = '';
    formDpi = 300; formFormat = 'TIFF'; formColorMode = '';
    formOperator = ''; formReviewer = '';
    wizardStep = 1;
  }

  function closeModal() {
    showCreateModal = false;
    resetForm();
  }

  // ---------------------------------------------------------------------------
  // NAVEGAR AL PROYECTO
  // ---------------------------------------------------------------------------
  function handleProjectClick(id: number) {
    goto(`/shared/projects/${id}`);
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

  // Avanzar / retroceder wizard
  function nextStep() { if (wizardStep < 3) wizardStep++; }
  function prevStep() { if (wizardStep > 1) wizardStep--; }
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
    {#if canCreate}
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

              <!-- Acciones -->
              <td class="text-right">
                <button class="btn-icon" onclick={(e) => { e.stopPropagation(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                  </svg>
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
     MODAL: Crear Nuevo Proyecto (wizard 3 pasos)
     ============================================================ -->
{#if showCreateModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeModal(); }}>
    <div class="modal-card">

      <!-- Cabecera del modal -->
      <div class="modal-header">
        <div>
          <h3 class="modal-title">Crear Nuevo Proyecto</h3>
          <p class="modal-subtitle">Asistente de configuración de proyecto</p>
        </div>
        <button class="modal-close" onclick={closeModal}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Indicador de pasos -->
      <div class="wizard-steps">
        {#each [
          { step: 1, icon: 'doc',    label: 'Información' },
          { step: 2, icon: 'gear',   label: 'Configuración' },
          { step: 3, icon: 'users',  label: 'Equipo' },
        ] as s}
          <div class="wizard-step" class:active={wizardStep === s.step} class:done={wizardStep > s.step}>
            <div class="step-icon-wrap">
              {#if s.icon === 'doc'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              {:else if s.icon === 'gear'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              {/if}
            </div>
            <span class="step-label">{s.label}</span>
            {#if s.step < 3}
              <div class="step-line" class:done={wizardStep > s.step}></div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Contenido por paso -->
      <div class="wizard-body">

        <!-- PASO 1: Información -->
        {#if wizardStep === 1}
          <div class="form-grid">
            <div class="form-field full">
              <label class="field-label">NOMBRE DEL PROYECTO</label>
              <input class="field-input" type="text" placeholder="Ej: Fondo Colonial 2023" bind:value={formName} />
            </div>
            <div class="form-field full">
              <label class="field-label">DESCRIPCIÓN</label>
              <input class="field-input" type="text" placeholder="Descripción breve del contenido..." bind:value={formDesc} />
            </div>
            <div class="form-field">
              <label class="field-label">UBICACIÓN FÍSICA</label>
              <input class="field-input" type="text" placeholder="Ej: Estante 4, Caja 12" bind:value={formLocation} />
            </div>
            <div class="form-field">
              <label class="field-label">CANTIDAD EST.</label>
              <input class="field-input" type="number" bind:value={formQuantity} />
            </div>
            <div class="form-field">
              <label class="field-label">FECHA LÍMITE</label>
              <input class="field-input" type="date" bind:value={formDate} />
            </div>
            <div class="form-field">
              <label class="field-label">PRIORIDAD</label>
              <input class="field-input" type="text" placeholder="Alta / Media / Baja" bind:value={formPriority} />
            </div>
          </div>

        <!-- PASO 2: Configuración -->
        {:else if wizardStep === 2}
          <div class="form-section">
            <div class="form-field full">
              <label class="field-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                RESOLUCIÓN DE CAPTURA
              </label>
              <div class="btn-group">
                {#each [300, 600, 1200] as dpi}
                  <button
                    class="btn-group-item"
                    class:selected={formDpi === dpi}
                    onclick={() => formDpi = dpi as 300|600|1200}
                  >
                    {dpi} DPI
                  </button>
                {/each}
              </div>
            </div>
            <div class="form-field full">
              <label class="field-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                FORMATO DE SALIDA
              </label>
              <div class="btn-group">
                {#each ['TIFF', 'JPEG', 'PNG'] as fmt}
                  <button
                    class="btn-group-item"
                    class:selected={formFormat === fmt}
                    onclick={() => formFormat = fmt as 'TIFF'|'JPEG'|'PNG'}
                  >
                    {fmt}
                  </button>
                {/each}
              </div>
            </div>
            <div class="form-field full">
              <label class="field-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                MODO DE COLOR
              </label>
              <select class="field-input" bind:value={formColorMode}>
                <option value="">Select option...</option>
                <option value="RGB">RGB</option>
                <option value="CMYK">CMYK</option>
                <option value="Grayscale">Escala de grises</option>
                <option value="BW">Blanco y Negro</option>
              </select>
            </div>
          </div>

        <!-- PASO 3: Equipo -->
        {:else}
          <div class="form-section">
            <!-- Resumen -->
            {#if formName}
              <div class="summary-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Resumen: Proyecto "<strong>{formName}</strong>" con configuración {formDpi} DPI - {formFormat}.
              </div>
            {/if}

            <div class="form-field full">
              <div class="team-label-row">
                <label class="field-label">ASIGNAR OPERARIO</label>
                <span class="role-badge">Responsable</span>
              </div>
              <select class="field-input" bind:value={formOperator}>
                <option value="">Select option...</option>
                <option value="m.garcia">María García</option>
                <option value="p.mora">Pedro Mora</option>
                <option value="a.ruiz">Ana Ruiz</option>
              </select>
            </div>

            <div class="form-field full">
              <div class="team-label-row">
                <label class="field-label">ASIGNAR REVISOR</label>
                <span class="role-badge">Control de Calidad</span>
              </div>
              <select class="field-input" bind:value={formReviewer}>
                <option value="">Select option...</option>
                <option value="j.lopez">Juan López</option>
                <option value="r.torres">Rosa Torres</option>
              </select>
            </div>
          </div>
        {/if}

      </div>

      <!-- Footer del wizard: Cancel + dots + Siguiente / Finalizar -->
      <div class="wizard-footer">
        <button class="btn-ghost" onclick={closeModal}>Cancelar</button>

        <!-- Dots de progreso -->
        <div class="wizard-dots">
          {#each [1,2,3] as s}
            <div class="dot" class:active={wizardStep === s}></div>
          {/each}
        </div>

        {#if wizardStep < 3}
          <button class="btn-primary" onclick={nextStep}>
            Siguiente
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        {:else}
          <button
            class="btn-primary"
            onclick={handleCreateProject}
            disabled={isCreating || !formName.trim()}
          >
            {isCreating ? 'Creando...' : 'Finalizar'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
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

  /* ══ MODAL WIZARD ══ */
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
    max-width: 420px;
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

  /* Wizard steps indicator */
  .wizard-steps {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 8px;
  }

  .wizard-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .step-icon-wrap {
    width: 36px; height: 36px;
    border-radius: 50%;
    background-color: var(--color-surface);
    border: 2px solid var(--border-color);
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    transition: all var(--transition-base);
  }

  .wizard-step.active .step-icon-wrap {
    background-color: rgba(90,140,98,0.2);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .wizard-step.done .step-icon-wrap {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  .step-label {
    font-size: 11px;
    color: var(--color-light-grey);
    white-space: nowrap;
  }

  .wizard-step.active .step-label { color: var(--color-primary); }
  .wizard-step.done .step-label   { color: var(--color-light); }

  .step-line {
    position: absolute;
    top: 18px;
    left: 100%;
    width: 80px;
    height: 2px;
    background-color: var(--border-color);
    transition: background-color var(--transition-base);
  }

  .step-line.done { background-color: var(--color-primary); }

  /* Formularios del wizard */
  .wizard-body { min-height: 200px; }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .form-section { display: flex; flex-direction: column; gap: 14px; }

  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-field.full { grid-column: 1 / -1; }

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

  /* Button group (DPI / format selector) */
  .btn-group {
    display: flex;
    gap: 8px;
  }

  .btn-group-item {
    flex: 1;
    height: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-group-item:hover { border-color: var(--color-primary); color: var(--color-light); }
  .btn-group-item.selected { background-color: rgba(90,140,98,0.15); border-color: var(--color-primary); color: var(--color-primary); }

  /* Team label row */
  .team-label-row { display: flex; align-items: center; justify-content: space-between; }

  .role-badge {
    font-size: 11px;
    color: var(--color-secondary);
    background-color: rgba(150,177,240,0.1);
    border: 1px solid rgba(150,177,240,0.3);
    border-radius: var(--radius-full);
    padding: 2px 8px;
  }

  /* Resumen en paso 3 */
  .summary-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background-color: rgba(90,140,98,0.1);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    line-height: 1.5;
  }

  .summary-box strong { color: var(--color-light); }

  /* Footer wizard */
  .wizard-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  .wizard-dots {
    display: flex;
    gap: 6px;
    flex: 1;
    justify-content: center;
  }

  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background-color: var(--border-color);
    transition: background-color var(--transition-base);
  }

  .dot.active { background-color: var(--color-primary); }
</style>

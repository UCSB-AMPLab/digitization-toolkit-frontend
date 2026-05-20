<script lang="ts">
  // ============================================================================
  // PÁGINA: Detalle de Colección (Inside Collection)
  // Ruta: /shared/projects/[projectId]/collections/[collectionId]
  // Archivo: src/routes/(dashboard)/shared/projects/[projectId]/collections/[collectionId]/+page.svelte
  //
  // SOLO VISTA LISTA (no hay toggles de grid/lista como en el Figma Make original).
  // Muestra:
  //   - Breadcrumb: Nombre Proyecto / Nombre Colección
  //   - Botón "Volver a {proyecto}"
  //   - Barra: Seleccionar todo | Ninguna seleccionada | Filtros
  //   - Botón "Continuar digitalización" → /live-preview
  //   - LISTA de registros (tabla): nombre, tamaño, formato, DPI, fecha, acciones
  //
  // Para el Revisor: en vez de "Continuar digitalización" aparece "Revisar"
  // que redirige a /gallery/{collectionId}
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { projectsApi, collectionsApi, recordsApi, type Project, type Collection, type Record } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PARÁMETROS DE RUTA
  // ---------------------------------------------------------------------------
  let projectId    = $derived(Number($page.params.projectId) || 0);
  let collectionId = $derived(Number($page.params.collectionId) || 0);

  // ---------------------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------------------
  let project    = $state<Project | null>(null);
  let collection = $state<Collection | null>(null);
  let records    = $state<Record[]>([]);
  let isLoading  = $state(true);

  let selectedIds = $state<Set<number>>(new Set());

  let userRole = $derived($authStore.user?.role ?? 'operator');

  // Filtrado
  let searchQuery = $state('');

  let filteredRecords = $derived(
    searchQuery.trim()
      ? records.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : records
  );

  // Selección
  let allSelected = $derived(
    filteredRecords.length > 0 && filteredRecords.every(r => selectedIds.has(r.id))
  );

  let selectionLabel = $derived(
    selectedIds.size === 0
      ? 'Ninguna seleccionada'
      : `${selectedIds.size} seleccionada${selectedIds.size > 1 ? 's' : ''}`
  );

  // ---------------------------------------------------------------------------
  // AL MONTAR
  // ---------------------------------------------------------------------------
  onMount(async () => {
    await Promise.all([loadProject(), loadCollection(), loadRecords()]);
  });

  async function loadProject() {
    try { project = await projectsApi.get(projectId); } catch {}
  }

  async function loadCollection() {
    try { collection = await collectionsApi.get(collectionId); } catch {}
  }

  async function loadRecords() {
    try {
      isLoading = true;
      records = await recordsApi.list({ collection_id: collectionId });
    } catch (err) {
      console.error('[CollectionDetail] Error:', err);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // SELECCIÓN
  // ---------------------------------------------------------------------------
  function toggleSelect(id: number) {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    selectedIds = s;
  }

  function toggleSelectAll() {
    if (allSelected) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(filteredRecords.map(r => r.id));
    }
  }

  // ---------------------------------------------------------------------------
  // ACCIONES PRINCIPALES
  // ---------------------------------------------------------------------------

  // Operador/Admin → Live Preview
  function handleDigitize() {
    goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`);
  }

  // Revisor → Gallery
  function handleReview() {
    goto(`/gallery/${collectionId}`);
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  function formatFileSize(bytes?: number): string {
    if (!bytes) return '—';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // Función para obtener URL de imagen real
  function getImageUrl(record: Record): string | null {
    if (!record.images || record.images.length === 0) return null;
    return recordsApi.getImageThumbnailUrl(record.images[0].id);
  }
</script>

<!-- ============================================================
     PÁGINA DE COLECCIÓN (vista lista)
     ============================================================ -->
<div class="page">

  <!-- Breadcrumb + botón continuar -->
  <div class="page-header">
    <div>
      <h1 class="page-title">
        {project?.name ?? '—'}
        {#if collection}
          <span class="breadcrumb-sep">/</span>
          <strong>{collection.name}</strong>
        {/if}
      </h1>
      <p class="page-subtitle">Colección</p>
    </div>

    <!-- Botón principal según rol y estado de la colección
         - Sin imágenes: solo botón central (ver empty state abajo), header vacío
         - Con imágenes:  "Continuar digitalización" (operario/admin) o "Revisar" (reviewer)
    -->
    {#if records.length > 0}
      {#if userRole === 'reviewer'}
        <button class="btn-digitize" onclick={handleReview}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Revisar
        </button>
      {:else}
        <button class="btn-digitize" onclick={handleDigitize}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Continuar digitalización
        </button>
      {/if}
    {/if}
  </div>

  <!-- Botón volver al proyecto -->
  <button class="btn-back" onclick={() => goto(`/dashboard/projects/${projectId}`)}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2.5 12H21M2.5 12l5-5M2.5 12l5 5"/>
    </svg>
    Volver a {project?.name ?? 'Proyecto'}
  </button>

  <!-- Barra de selección + filtros -->
  <div class="toolbar">
    <!-- Seleccionar todo -->
    <button class="select-all-btn" onclick={toggleSelectAll}>
      <div class="checkbox" class:checked={allSelected}>
        {#if allSelected}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        {/if}
      </div>
      <span>Seleccionar todo</span>
    </button>

    <!-- Separador + label de selección -->
    <div class="selection-info">
      <span class="sep-line">|</span>
      <span class="selection-label">{selectionLabel}</span>
    </div>

    <!-- Búsqueda -->
    <div class="search-wrapper">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" placeholder="Buscar..." bind:value={searchQuery} class="search-input" />
    </div>

    <!-- Filtros -->
    <button class="btn-ghost-sm">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
      </svg>
      Filtros
    </button>

    <div style="flex:1"></div>
    <!-- Nota: solo hay vista lista, sin toggle de grid -->
  </div>

  <!-- Lista de registros -->
  {#if isLoading}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Cargando imágenes...</span>
    </div>

  {:else if filteredRecords.length === 0}
    <div class="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>
        {searchQuery
          ? 'Sin resultados para tu búsqueda'
          : 'Sin imágenes — inicia la digitalización para capturar'}
      </span>
      {#if !searchQuery && userRole !== 'reviewer'}
        <button class="btn-digitize" onclick={handleDigitize}>Iniciar digitalización</button>
      {/if}
    </div>

  {:else}
    <!-- VISTA LISTA: tabla de registros -->
    <div class="list-table-wrapper">
      <table class="list-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th>Imagen</th>
            <th>Nombre</th>
            <th>Tamaño</th>
            <th>Formato</th>
            <th>Resolución</th>
            <th>Fecha</th>
            <th class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredRecords as record, i}
            {@const thumbUrl = getImageUrl(record)}
            {@const isSelected = selectedIds.has(record.id)}

            <tr class="list-row" class:selected={isSelected}>
              <!-- Checkbox -->
              <td class="col-check">
                <button class="checkbox-btn" onclick={() => toggleSelect(record.id)}>
                  <div class="checkbox" class:checked={isSelected}>
                    {#if isSelected}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    {/if}
                  </div>
                </button>
              </td>

              <!-- Miniatura -->
              <td class="col-thumb">
                <div class="thumb">
                  {#if thumbUrl}
                    <img src={thumbUrl} alt={record.title} class="thumb-img" />
                  {:else}
                    <div class="thumb-placeholder">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                  {/if}
                </div>
              </td>

              <!-- Nombre -->
              <td>
                <span class="record-name">{record.title || `IMG_${String(i+1).padStart(3,'0')}.tiff`}</span>
              </td>

              <!-- Tamaño -->
              <td class="meta-cell">
                {formatFileSize(record.images?.[0]?.file_size)}
              </td>

              <!-- Formato -->
              <td class="meta-cell">
                {record.images?.[0]?.format?.toUpperCase() ?? 'TIFF'}
              </td>

              <!-- Resolución/DPI -->
              <td class="meta-cell">
                {#if record.images?.[0]?.resolution_width}
                  {record.images[0].resolution_width}×{record.images[0].resolution_height}
                {:else}
                  300 DPI
                {/if}
              </td>

              <!-- Fecha -->
              <td class="meta-cell date-cell">
                {record.created_at
                  ? new Date(record.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' })
                  : '—'}
              </td>

              <!-- Acciones -->
              <td class="text-right">
                <div class="row-actions">
                  <!-- Descargar -->
                  <button class="action-icon" title="Descargar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </button>
                  <!-- Ver -->
                  <button class="action-icon" title="Ver imagen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                  <!-- Más opciones -->
                  <button class="action-icon" title="Más opciones">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

</div>

<style>
  .page { padding: 28px 32px; max-width: 1200px; }

  /* Header */
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }

  .page-title {
    font-size: var(--text-h3);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    margin: 0 0 4px;
  }

  .page-title strong { color: var(--color-light); font-weight: var(--fw-extrabold); }

  .breadcrumb-sep { margin: 0 8px; opacity: 0.5; }

  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Botón digitalizar / revisar */
  .btn-digitize {
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
    box-shadow: 0 4px 10px rgba(90,140,98,0.25);
    transition: background-color var(--transition-base);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-digitize:hover { background-color: var(--color-primary-hover); }

  /* Botón volver */
  .btn-back {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 7px 14px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    margin-bottom: 20px;
    min-height: var(--touch-target-min);
  }

  .btn-back:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .select-all-btn {
    display: flex; align-items: center; gap: 8px;
    background: none; border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    padding: 4px 0;
    transition: color var(--transition-fast);
    white-space: nowrap;
    min-height: 0;
  }

  .select-all-btn:hover { color: var(--color-light); }

  /* Checkbox visual */
  .checkbox {
    width: 16px; height: 16px;
    border-radius: 3px;
    border: 1.5px solid var(--color-light-grey);
    background-color: transparent;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }

  .checkbox.checked { background-color: var(--color-primary); border-color: var(--color-primary); }

  .checkbox-btn {
    background: none; border: none;
    cursor: pointer; padding: 4px;
    display: flex; align-items: center; justify-content: center;
    min-height: 0;
  }

  .selection-info {
    display: flex; align-items: center; gap: 10px;
  }

  .sep-line { color: var(--border-color); }
  .selection-label { font-size: var(--text-sm); color: var(--color-light-grey); white-space: nowrap; }

  /* Search */
  .search-wrapper { position: relative; }

  .search-icon {
    position: absolute;
    left: 10px; top: 50%;
    transform: translateY(-50%);
    color: var(--color-light-grey);
    pointer-events: none;
  }

  .search-input {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 7px 12px 7px 30px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    outline: none;
    transition: border-color var(--transition-base);
    width: 200px;
    min-height: var(--touch-target-min);
  }

  .search-input:focus { border-color: var(--color-primary); }
  .search-input::placeholder { color: var(--color-light-grey); opacity: 0.5; }

  .btn-ghost-sm {
    display: flex; align-items: center; gap: 6px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 7px 12px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
    white-space: nowrap;
  }

  .btn-ghost-sm:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  /* Loading / empty */
  .loading-state, .empty-state {
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

  /* ── TABLA DE LISTA ── */
  .list-table-wrapper {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .list-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
    text-align: left;
  }

  .list-table thead tr {
    background-color: var(--color-surface-alt);
    border-bottom: 1px solid var(--border-color);
  }

  .list-table th {
    padding: 11px 16px;
    font-size: 11px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  .list-table th.text-right { text-align: right; }
  .list-table th.col-check  { width: 40px; padding: 11px 8px; }

  .list-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    vertical-align: middle;
  }

  .list-table td.col-check  { padding: 12px 8px; }
  .list-table td.col-thumb  { padding: 8px 16px; width: 60px; }
  .list-table tbody tr:last-child td { border-bottom: none; }

  .list-row { transition: background-color var(--transition-fast); }
  .list-row:hover { background-color: rgba(255,255,255,0.02); }
  .list-row.selected { background-color: rgba(90,140,98,0.06); }

  /* Thumbnail */
  .thumb {
    width: 48px; height: 48px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background-color: var(--color-surface-alt);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .thumb-img { width: 100%; height: 100%; object-fit: cover; }
  .thumb-placeholder { color: var(--color-light-grey); opacity: 0.3; }

  /* Nombre */
  .record-name {
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    font-size: var(--text-sm);
  }

  /* Meta celdas */
  .meta-cell {
    color: var(--color-light-grey);
    font-size: 12px;
    white-space: nowrap;
  }

  .date-cell {
    white-space: nowrap;
  }

  .text-right { text-align: right; }

  /* Acciones por fila */
  .row-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .list-row:hover .row-actions { opacity: 1; }

  .action-icon {
    width: 28px; height: 28px;
    border-radius: var(--radius-sm);
    background: none; border: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .action-icon:hover { background-color: rgba(255,255,255,0.06); color: var(--color-light); }
</style>
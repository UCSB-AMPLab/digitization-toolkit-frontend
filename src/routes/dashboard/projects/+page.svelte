<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { projectsApi, collectionsApi, type Project, type Collection } from '$lib/api';

  let projects: Project[] = [];
  let filteredProjects: Project[] = [];
  let loading = true;
  let error: string | null = null;
  let searchQuery = '';
  let sortBy: 'name' | 'date' = 'date';
  let sortOrder: 'asc' | 'desc' = 'desc';

  // Modal state
  let showCreateModal = false;
  let showEditModal = false;
  let showDeleteModal = false;
  let showCreateCollectionModal = false;
  let selectedProject: Project | null = null;

  // Form state
  let formName = '';
  let formDescription = '';
  let formError = '';

  // Collection form state
  let collectionName = '';
  let collectionDescription = '';
  let collectionType = '';
  let collectionParentId = '';
  let collectionFormError = '';
  let availableCollections: Collection[] = [];
  let loadingCollections = false;

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    loading = true;
    error = null;
    try {
      projects = await projectsApi.list();
      applyFiltersAndSort();
    } catch (e: any) {
      error = e.message || 'Failed to load projects';
    } finally {
      loading = false;
    }
  }

  function applyFiltersAndSort() {
    // Filter
    let result = projects;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = projects.filter(p => 
        p.name.toLowerCase().includes(query) || 
        (p.description && p.description.toLowerCase().includes(query))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        comparison = dateA - dateB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    filteredProjects = result;
  }

  function handleSearch() {
    applyFiltersAndSort();
  }

  function handleSort(newSortBy: 'name' | 'date') {
    if (sortBy === newSortBy) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = newSortBy;
      sortOrder = 'asc';
    }
    applyFiltersAndSort();
  }

  function openCreateModal() {
    formName = '';
    formDescription = '';
    formError = '';
    showCreateModal = true;
  }

  function openEditModal(project: Project) {
    selectedProject = project;
    formName = project.name;
    formDescription = project.description || '';
    formError = '';
    showEditModal = true;
  }

  function openDeleteModal(project: Project) {
    selectedProject = project;
    showDeleteModal = true;
  }

  function closeModals() {
    showCreateModal = false;
    showEditModal = false;
    showDeleteModal = false;
    showCreateCollectionModal = false;
    selectedProject = null;
    formError = '';
    collectionFormError = '';
  }

  async function openCreateCollectionModal(project: Project) {
    selectedProject = project;
    collectionName = '';
    collectionDescription = '';
    collectionType = '';
    collectionParentId = '';
    collectionFormError = '';
    loadingCollections = true;
    showCreateCollectionModal = true;
    
    // Load available collections for this project
    try {
      availableCollections = await collectionsApi.list({ project_id: project.id });
    } catch (e: any) {
      console.error('Failed to load collections:', e);
      availableCollections = [];
    } finally {
      loadingCollections = false;
    }
  }

  async function handleCreateCollection() {
    if (!selectedProject) return;
    if (!collectionName.trim()) {
      collectionFormError = 'Collection name is required';
      return;
    }

    try {
      await collectionsApi.create({
        name: collectionName.trim(),
        description: collectionDescription.trim() || undefined,
        collection_type: collectionType || undefined,
        project_id: collectionParentId ? undefined : selectedProject.id,
        parent_collection_id: collectionParentId ? parseInt(collectionParentId) : undefined
      });
      closeModals();
      // Optionally reload projects to update counts
      await loadProjects();
    } catch (e: any) {
      collectionFormError = e.message || 'Failed to create collection';
    }
  }

  async function handleCreate() {
    if (!formName.trim()) {
      formError = 'Project name is required';
      return;
    }

    try {
      await projectsApi.create({
        name: formName.trim(),
        description: formDescription.trim() || undefined
      });
      await loadProjects();
      closeModals();
    } catch (e: any) {
      formError = e.message || 'Failed to create project';
    }
  }

  async function handleUpdate() {
    if (!selectedProject) return;
    if (!formName.trim()) {
      formError = 'Project name is required';
      return;
    }

    try {
      await projectsApi.update(selectedProject.id, {
        name: formName.trim(),
        description: formDescription.trim() || undefined
      });
      await loadProjects();
      closeModals();
    } catch (e: any) {
      formError = e.message || 'Failed to update project';
    }
  }

  async function handleDelete() {
    if (!selectedProject) return;

    try {
      await projectsApi.delete(selectedProject.id);
      await loadProjects();
      closeModals();
    } catch (e: any) {
      error = e.message || 'Failed to delete project';
      closeModals();
    }
  }

  function viewProject(project: Project) {
    goto(`/dashboard/projects/${project.id}`);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }
</script>

<div class="page-container">
  <header class="page-header">
    <h1>Projects</h1>
    <button class="btn-primary" on:click={openCreateModal}>
      + New Project
    </button>
  </header>

  <!-- Search and Sort Controls -->
  <div class="controls">
    <div class="search-box">
      <input 
        type="text" 
        placeholder="Search projects..." 
        bind:value={searchQuery}
        on:input={handleSearch}
        class="search-input"
      />
    </div>
    <div class="sort-controls">
      <button 
        class="sort-btn"
        class:active={sortBy === 'name'}
        on:click={() => handleSort('name')}
      >
        Name {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
      </button>
      <button 
        class="sort-btn"
        class:active={sortBy === 'date'}
        on:click={() => handleSort('date')}
      >
        Date {sortBy === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
      </button>
    </div>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <!-- Projects List -->
  <div class="projects-container">
    {#if loading}
      <div class="loading-state">Loading projects...</div>
    {:else if filteredProjects.length === 0}
      <div class="empty-state">
        {#if searchQuery}
          <p>No projects found matching "{searchQuery}"</p>
        {:else}
          <p>No projects yet. Create your first project to get started!</p>
          <button class="btn-primary" on:click={openCreateModal}>
            Create Project
          </button>
        {/if}
      </div>
    {:else}
      <div class="projects-grid">
        {#each filteredProjects as project}
          <div class="project-card">
            <div class="project-header">
              <h3 on:click={() => viewProject(project)}>{project.name}</h3>
              <div class="project-actions">
                <button class="icon-btn" on:click={() => openEditModal(project)} title="Edit">✏️</button>
                <button class="icon-btn danger" on:click={() => openDeleteModal(project)} title="Delete">🗑️</button>
              </div>
            </div>
            {#if project.description}
              <p class="project-description">{project.description}</p>
            {/if}
            <div class="project-meta">
              <span class="meta-item">📅 {formatDate(project.created_at)}</span>
              {#if project.created_by}
                <span class="meta-item">👤 {project.created_by}</span>
              {/if}
            </div>
            <div class="project-card-actions">
              <button class="btn-secondary" on:click={() => viewProject(project)}>
                View Details
              </button>
              <button 
                class="btn-add-collection" 
                on:click|stopPropagation={() => openCreateCollectionModal(project)}
                title="Add collection to this project"
              >
                + Collection
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Create Project Modal -->
{#if showCreateModal}
  <div class="modal-overlay" on:click={closeModals}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Create New Project</h2>
        <button class="close-btn" on:click={closeModals}>×</button>
      </div>
      <div class="modal-body">
        {#if formError}
          <div class="alert alert-error">{formError}</div>
        {/if}
        <div class="form-group">
          <label for="project-name">Project Name *</label>
          <input 
            id="project-name"
            type="text" 
            bind:value={formName}
            placeholder="Enter project name"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label for="project-description">Description</label>
          <textarea 
            id="project-description"
            bind:value={formDescription}
            placeholder="Enter project description (optional)"
            class="form-textarea"
            rows="4"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModals}>Cancel</button>
        <button class="btn-primary" on:click={handleCreate}>Create Project</button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Project Modal -->
{#if showEditModal && selectedProject}
  <div class="modal-overlay" on:click={closeModals}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Edit Project</h2>
        <button class="close-btn" on:click={closeModals}>×</button>
      </div>
      <div class="modal-body">
        {#if formError}
          <div class="alert alert-error">{formError}</div>
        {/if}
        <div class="form-group">
          <label for="edit-project-name">Project Name *</label>
          <input 
            id="edit-project-name"
            type="text" 
            bind:value={formName}
            placeholder="Enter project name"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label for="edit-project-description">Description</label>
          <textarea 
            id="edit-project-description"
            bind:value={formDescription}
            placeholder="Enter project description (optional)"
            class="form-textarea"
            rows="4"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModals}>Cancel</button>
        <button class="btn-primary" on:click={handleUpdate}>Save Changes</button>
      </div>
    </div>
  </div>
{/if}

<!-- Create Collection Modal (from project card) -->
{#if showCreateCollectionModal && selectedProject}
  <div class="modal-overlay" on:click={closeModals}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Create Collection</h2>
        <button class="close-btn" on:click={closeModals}>×</button>
      </div>
      <div class="modal-body">
        <div class="project-context">
          <strong>Project:</strong> {selectedProject.name}
        </div>
        {#if collectionFormError}
          <div class="alert alert-error">{collectionFormError}</div>
        {/if}
        <div class="form-group">
          <label for="quick-collection-name">Collection Name *</label>
          <input 
            id="quick-collection-name"
            type="text" 
            bind:value={collectionName}
            placeholder="e.g., Box 42, Series A, Folder 1"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label for="quick-collection-parent">Parent Collection (optional)</label>
          <select id="quick-collection-parent" bind:value={collectionParentId} class="form-select" disabled={loadingCollections}>
            <option value="">None (top-level collection)</option>
            {#if loadingCollections}
              <option disabled>Loading collections...</option>
            {:else}
              {#each availableCollections as collection}
                <option value={collection.id}>
                  {collection.name}
                  {#if collection.collection_type}
                    ({collection.collection_type})
                  {/if}
                </option>
              {/each}
            {/if}
          </select>
        </div>
        <div class="form-group">
          <label for="quick-collection-type">Type</label>
          <select id="quick-collection-type" bind:value={collectionType} class="form-select">
            <option value="">Select type (optional)</option>
            <option value="fonds">Fonds</option>
            <option value="series">Series</option>
            <option value="box">Box</option>
            <option value="folder">Folder</option>
            <option value="volume">Volume</option>
          </select>
        </div>
        <div class="form-group">
          <label for="quick-collection-description">Description</label>
          <textarea 
            id="quick-collection-description"
            bind:value={collectionDescription}
            placeholder="Enter collection description (optional)"
            class="form-textarea"
            rows="3"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModals}>Cancel</button>
        <button class="btn-primary" on:click={handleCreateCollection}>Create Collection</button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && selectedProject}
  <div class="modal-overlay" on:click={closeModals}>
    <div class="modal modal-small" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Delete Project</h2>
        <button class="close-btn" on:click={closeModals}>×</button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to delete the project <strong>{selectedProject.name}</strong>?</p>
        <p class="warning-text">This action cannot be undone. Collections and records will be unlinked.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModals}>Cancel</button>
        <button class="btn-danger" on:click={handleDelete}>Delete Project</button>
      </div>
    </div>
  </div>
{/if}

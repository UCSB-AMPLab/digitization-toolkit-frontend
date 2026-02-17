<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { projectsApi, collectionsApi, type Project, type Collection } from '$lib/api';

  let project: Project | null = null;
  let collections: Collection[] = [];
  let records: any[] = [];
  let loading = true;
  let error: string | null = null;

  // Modal state
  let showCreateCollectionModal = false;
  let formName = '';
  let formDescription = '';
  let formType = '';
  let formParentId = '';
  let formError = '';

  $: projectId = parseInt($page.params.id);

  onMount(async () => {
    await loadProjectData();
  });

  async function loadProjectData() {
    loading = true;
    error = null;
    try {
      // Load project details
      project = await projectsApi.get(projectId);
      
      // Load collections for this project
      collections = await collectionsApi.list({ project_id: projectId });
      
      // Load records for this project
      records = await projectsApi.getRecords(projectId);
    } catch (e: any) {
      error = e.message || 'Failed to load project data';
    } finally {
      loading = false;
    }
  }

  function openCreateCollectionModal(parentCollectionId?: number) {
    formName = '';
    formDescription = '';
    formType = '';
    formParentId = parentCollectionId ? parentCollectionId.toString() : '';
    formError = '';
    showCreateCollectionModal = true;
  }

  function closeModals() {
    showCreateCollectionModal = false;
    formError = '';
  }

  async function handleCreateCollection() {
    if (!formName.trim()) {
      formError = 'Collection name is required';
      return;
    }

    try {
      await collectionsApi.create({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        collection_type: formType.trim() || undefined,
        project_id: formParentId ? undefined : projectId,
        parent_collection_id: formParentId ? parseInt(formParentId) : undefined
      });
      await loadProjectData();
      closeModals();
    } catch (e: any) {
      formError = e.message || 'Failed to create collection';
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="page-container">
  <div class="breadcrumb">
    <a href="/dashboard/projects">← Back to Projects</a>
  </div>

  {#if loading}
    <div class="loading-state">Loading project...</div>
  {:else if error}
    <div class="alert alert-error">{error}</div>
  {:else if project}
    <header class="page-header">
      <div>
        <h1>{project.name}</h1>
        {#if project.description}
          <p class="project-subtitle">{project.description}</p>
        {/if}
      </div>
      <button class="btn-primary" on:click={() => goto(`/dashboard/capture/${projectId}`)}>
        📷 Start Capture
      </button>
    </header>

    <div class="project-meta-bar">
      <span>📅 Created: {formatDate(project.created_at)}</span>
      {#if project.created_by}
        <span>👤 By: {project.created_by}</span>
      {/if}
      <span>📁 {collections.length} Collection(s)</span>
      <span>📄 {records.length} Record(s)</span>
    </div>

    <!-- Collections Section -->
    <section class="card">
      <div class="card-header">
        <h2>Collections</h2>
        <button class="btn-secondary btn-sm" on:click={() => openCreateCollectionModal()}>
          + New Collection
        </button>
      </div>
      <div class="card-body">
        {#if collections.length === 0}
          <div class="empty-state-small">
            <p>No collections yet. Create a collection to organize your records.</p>
          </div>
        {:else}
          <div class="collections-list">
            {#each collections as collection}
              <div class="collection-item">
                <div class="collection-icon">📂</div>
                <div class="collection-info">
                  <h4>{collection.name}</h4>
                  {#if collection.description}
                    <p>{collection.description}</p>
                  {/if}
                  {#if collection.collection_type}
                    <span class="badge">{collection.collection_type}</span>
                  {/if}
                </div>
                <div class="collection-actions">
                  <button 
                    class="btn-icon" 
                    on:click={() => openCreateCollectionModal(collection.id)}
                    title="Add subcollection"
                  >
                    +
                  </button>
                  <button class="btn-secondary btn-sm">View</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- Records Section -->
    <section class="card">
      <div class="card-header">
        <h2>Records</h2>
      </div>
      <div class="card-body">
        {#if records.length === 0}
          <div class="empty-state-small">
            <p>No records yet. Start capturing to add records to this project.</p>
          </div>
        {:else}
          <div class="records-grid">
            {#each records as record}
              <div class="record-card">
                <div class="record-thumbnail">
                  {#if record.thumbnail_path}
                    <img src={record.thumbnail_path} alt={record.title || record.filename} />
                  {:else}
                    <div class="thumbnail-placeholder">📄</div>
                  {/if}
                </div>
                <div class="record-info">
                  <p class="record-title">{record.title || record.filename}</p>
                  <p class="record-date">{formatDate(record.created_at)}</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

<!-- Create Collection Modal -->
{#if showCreateCollectionModal}
  <div class="modal-overlay" on:click={closeModals}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Create New Collection</h2>
        <button class="close-btn" on:click={closeModals}>×</button>
      </div>
      <div class="modal-body">
        {#if formError}
          <div class="alert alert-error">{formError}</div>
        {/if}
        <div class="form-group">
          <label for="collection-name">Collection Name *</label>
          <input 
            id="collection-name"
            type="text" 
            bind:value={formName}
            placeholder="e.g., Box 42, Series A, Folder 1"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label for="collection-parent">Parent Collection (optional)</label>
          <select id="collection-parent" bind:value={formParentId} class="form-select">
            <option value="">None (top-level collection)</option>
            {#each collections.filter(c => c.project_id === projectId) as collection}
              <option value={collection.id}>
                {collection.name}
                {#if collection.collection_type}
                  ({collection.collection_type})
                {/if}
              </option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label for="collection-type">Type</label>
          <select id="collection-type" bind:value={formType} class="form-select">
            <option value="">Select type (optional)</option>
            <option value="fonds">Fonds</option>
            <option value="series">Series</option>
            <option value="box">Box</option>
            <option value="folder">Folder</option>
            <option value="volume">Volume</option>
          </select>
        </div>
        <div class="form-group">
          <label for="collection-description">Description</label>
          <textarea 
            id="collection-description"
            bind:value={formDescription}
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

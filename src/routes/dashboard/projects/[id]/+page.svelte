<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { projectsApi, collectionsApi, recordsApi, type Project, type Collection, type Record } from '$lib/api';
  import CollectionTreeItem from '$lib/components/CollectionTreeItem.svelte';

  let project: Project | null = null;
  let collections: Collection[] = [];
  let records: Record[] = [];
  let loading = true;
  let error: string | null = null;

  // Tree state
  let expandedCollections = new Set<number>();
  let childCollectionsMap = new Map<number, Collection[]>();
  let loadingChildren = new Set<number>();
  
  // Modal state
  let showCreateCollectionModal = false;
  let formName = '';
  let formDescription = '';
  let formType = '';
  let formParentId = '';
  let formError = '';

  $: projectId = parseInt($page.params.id);
  
  // Get only top-level collections (those belonging directly to project)
  $: topLevelCollections = collections.filter(c => c.project_id === projectId);
  
  // Count all collections including nested ones
  $: totalCollectionCount = topLevelCollections.length + Array.from(childCollectionsMap.values()).reduce((sum, children) => sum + children.length, 0);

  onMount(async () => {
    await loadProjectData();
  });

  async function loadProjectData() {
    loading = true;
    error = null;
    try {
      // Load project details
      project = await projectsApi.get(projectId);
      
      // Load all top-level collections for this project
      collections = await collectionsApi.list({ project_id: projectId });
      console.log('Loaded top-level collections:', collections);
      
      // Recursively load all descendants to populate the tree
      await loadAllDescendants(collections);
      console.log('Child collections map:', childCollectionsMap);
      
      // Load records for this project
      records = await recordsApi.list({ project_id: projectId });
    } catch (e: any) {
      error = e.message || 'Failed to load project data';
    } finally {
      loading = false;
    }
  }

  async function loadAllDescendants(parentCollections: Collection[]) {
    // Recursively load all children for a set of collections
    await Promise.all(
      parentCollections.map(async (col) => {
        try {
          const children = await collectionsApi.list({ parent_collection_id: col.id });
          // Always set the children (even if empty) so we know we've checked
          // Create a new Map to trigger reactivity
          childCollectionsMap = new Map(childCollectionsMap).set(col.id, children);
          if (children.length > 0) {
            // Recursively load their children too
            await loadAllDescendants(children);
          }
        } catch (e) {
          console.error(`Failed to load children for collection ${col.id}:`, e);
        }
      })
    );
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
      const newCollection = await collectionsApi.create({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        collection_type: formType.trim() || undefined,
        project_id: formParentId ? undefined : projectId,
        parent_collection_id: formParentId ? parseInt(formParentId) : undefined
      });
      
      // If this is a subcollection, auto-expand its parent
      if (newCollection.parent_collection_id) {
        const newSet = new Set(expandedCollections);
        newSet.add(newCollection.parent_collection_id);
        expandedCollections = newSet;
      }
      
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

  async function toggleExpand(collectionId: number) {
    if (expandedCollections.has(collectionId)) {
      // Collapse - create a NEW Set to trigger reactivity
      const newSet = new Set(expandedCollections);
      newSet.delete(collectionId);
      expandedCollections = newSet;
    } else {
      // Expand - load children if not already loaded
      if (!childCollectionsMap.has(collectionId)) {
        loadingChildren.add(collectionId);
        loadingChildren = loadingChildren;
        
        try {
          const children = await collectionsApi.list({ parent_collection_id: collectionId });
          // Always set children (even if empty) so we know we've checked
          // Create a new Map to trigger reactivity
          childCollectionsMap = new Map(childCollectionsMap).set(collectionId, children);
          if (children.length > 0) {
            // Recursively load their descendants
            await loadAllDescendants(children);
          }
        } catch (e: any) {
          console.error('Failed to load children:', e);
        } finally {
          loadingChildren.delete(collectionId);
          loadingChildren = loadingChildren;
        }
      }
      
      // Expand - create a NEW Set to trigger reactivity
      const newSet = new Set(expandedCollections);
      newSet.add(collectionId);
      expandedCollections = newSet;
    }
  }

  function viewCollection(collection: Collection) {
    // Navigate to collection detail view
    goto(`/dashboard/collections/${collection.id}`);
  }

  function getAllCollections(): Collection[] {
    // Return all collections including top-level and loaded children
    const all: Collection[] = [...topLevelCollections];
    
    function addChildren(parentId: number) {
      const children = childCollectionsMap.get(parentId);
      if (children) {
        all.push(...children);
        children.forEach(child => addChildren(child.id));
      }
    }
    
    topLevelCollections.forEach(col => addChildren(col.id));
    return all;
  }

  function getCollectionIndent(collectionId: number): string {
    // Calculate indent level for dropdown display
    let indent = '';
    let current = getAllCollections().find(c => c.id === collectionId);
    
    while (current && current.parent_collection_id) {
      indent += '  '; // Two spaces per level
      current = getAllCollections().find(c => c.id === current?.parent_collection_id);
    }
    
    return indent;
  }

  function getRecordThumbnail(record: Record): string | null {
    // Get the first image's thumbnail if available
    if (record.images && record.images.length > 0 && record.images[0].thumbnail_path) {
      return recordsApi.getImageThumbnailUrl(record.images[0].id);
    }
    return null;
  }

  function getRecordImageCount(record: Record): number {
    return record.images?.length || 0;
  }

  function viewRecord(record: Record) {
    goto(`/dashboard/records/${record.id}`);
  }
</script>

<div class="page-container">
  <div class="breadcrumb">
    <a href="/dashboard/projects" class="breadcrumb-link">Projects</a>
    {#if project}
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{project.name}</span>
    {/if}
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
    </header>

    <div class="project-meta-bar">
      <span>Created: {formatDate(project.created_at)}</span>
      {#if project.created_by}
        <span>By: {project.created_by}</span>
      {/if}
      <span>{totalCollectionCount} Collection(s)</span>
      <span>{records.length} Record(s)</span>
    </div>

    <!-- Collections Section -->
    <section class="card">
      <div class="card-header">
        <h2>Collections</h2>
        <button class="btn-secondary btn-sm" on:click={() => openCreateCollectionModal()}>
          New Collection <span class="material-symbols-outlined">create_new_folder</span>
        </button>
      </div>
      <div class="card-body">
        {#if topLevelCollections.length === 0}
          <div class="empty-state-small">
            <p>No collections yet. Create a collection to organize your records.</p>
          </div>
        {:else}
          <div class="collections-tree">
            {#each topLevelCollections as collection (collection.id)}
              <CollectionTreeItem
                {collection}
                level={0}
                {expandedCollections}
                {childCollectionsMap}
                {loadingChildren}
                onToggleExpand={toggleExpand}
                onViewCollection={viewCollection}
                onAddSubcollection={(parentId) => openCreateCollectionModal(parentId)}
              />
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- Records Section -->
    <section class="card">
      <div class="card-header">
        <h2>Records</h2>
        {#if project?.id}
          <button class="btn-secondary btn-sm" on:click={() => goto(`/dashboard/capture/${projectId}`)}>
            Add Record <span class="material-symbols-outlined">auto_stories</span>
          </button>
        {/if}
      </div>
      <div class="card-body">
        {#if records.length === 0}
          <div class="empty-state-small">
            <p>No records yet. Start capturing to add records to this project.</p>
          </div>
        {:else}
          <div class="records-grid">
            {#each records as record}
              <div 
                class="record-card"
                on:click={() => viewRecord(record)}
                on:keydown={(e) => e.key === 'Enter' && viewRecord(record)}
                role="button"
                tabindex="0"
              >
                <div class="record-thumbnail">
                  {#if getRecordThumbnail(record)}
                    <img 
                      src={getRecordThumbnail(record)} 
                      alt={record.title}
                      loading="lazy"
                    />
                  {:else}
                    <div class="thumbnail-placeholder">--</div>
                  {/if}
                </div>
                <div class="record-info">
                  <p class="record-title">{record.title}</p>
                  {#if record.description}
                    <p class="record-description">{record.description}</p>
                  {/if}
                  <div class="record-meta">
                    <span class="badge badge-xs">{getRecordImageCount(record)} image(s)</span>
                    {#if record.object_typology}
                      <span class="badge badge-outline badge-xs">{record.object_typology}</span>
                    {/if}
                  </div>
                  {#if record.created_at}
                    <p class="record-date">{formatDate(record.created_at)}</p>
                  {/if}
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
            {#each getAllCollections() as collection}
              <option value={collection.id}>
                {getCollectionIndent(collection.id)}{collection.name}
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

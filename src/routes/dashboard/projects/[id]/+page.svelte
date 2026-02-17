<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { projectsApi, collectionsApi, recordsApi, type Project, type Collection, type Record } from '$lib/api';

  let project: Project | null = null;
  let collections: Collection[] = [];
  let records: Record[] = [];
  let loading = true;
  let error: string | null = null;

  // Tree state
  let expandedCollections = new Set<number>();
  let childCollectionsMap = new Map<number, Collection[]>();
  let loadingChildren = new Set<number>();
  
  // Reactive array to force template updates
  $: expandedIds = Array.from(expandedCollections);
  $: loadingIds = Array.from(loadingChildren);
  $: childMapSize = childCollectionsMap.size; // Track map changes

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
    console.log('toggleExpand called for collection:', collectionId);
    console.log('Current expanded state:', expandedCollections.has(collectionId));
    console.log('Has children:', hasChildren(collectionId));
    
    if (expandedCollections.has(collectionId)) {
      // Collapse - create a NEW Set to trigger reactivity
      console.log('Collapsing collection:', collectionId);
      const newSet = new Set(expandedCollections);
      newSet.delete(collectionId);
      expandedCollections = newSet;
    } else {
      // Expand - load children if not already loaded
      if (!childCollectionsMap.has(collectionId)) {
        console.log('Loading children for:', collectionId);
        loadingChildren.add(collectionId);
        loadingChildren = loadingChildren;
        
        try {
          const children = await collectionsApi.list({ parent_collection_id: collectionId });
          console.log('Loaded children:', children);
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
      } else {
        console.log('Children already loaded, children count:', childCollectionsMap.get(collectionId)?.length);
      }
      
      // Expand - create a NEW Set to trigger reactivity
      console.log('Expanding collection:', collectionId);
      const newSet = new Set(expandedCollections);
      newSet.add(collectionId);
      expandedCollections = newSet;
    }
    console.log('New expanded collections:', expandedCollections);
  }

  // Helper functions - made reactive by referencing reactive variables
  function hasChildren(collectionId: number): boolean {
    // Reference childMapSize to ensure reactivity
    const _ = childMapSize;
    const children = childCollectionsMap.get(collectionId);
    return children ? children.length > 0 : false;
  }

  function isExpanded(collectionId: number): boolean {
    // Reference expandedIds to ensure reactivity
    return expandedIds.includes(collectionId);
  }

  function isLoadingChildren(collectionId: number): boolean {
    // Reference loadingIds to ensure reactivity
    return loadingIds.includes(collectionId);
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
    // TODO: Create record detail page
    console.log('View record:', record);
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
        <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 0.5rem;">photo_camera</span>
        Start Capture
      </button>
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
          + New Collection
        </button>
      </div>
      <div class="card-body">
        {#if topLevelCollections.length === 0}
          <div class="empty-state-small">
            <p>No collections yet. Create a collection to organize your records.</p>
          </div>
        {:else}
          <div class="collections-tree">
            {#each topLevelCollections as collection (collection.id + '-' + expandedIds.join(',') + '-' + childMapSize)}
              {@const hasKids = hasChildren(collection.id)}
              {@const expanded = isExpanded(collection.id)}
              {@const loadingKids = isLoadingChildren(collection.id)}
              
              <!-- Top-level collection -->
              <div class="collection-tree-item" data-level="0">
                <div class="collection-item">
                  {#if hasKids || loadingKids || !childCollectionsMap.has(collection.id)}
                    <button 
                      class="tree-toggle" 
                      on:click={() => toggleExpand(collection.id)}
                      disabled={loadingKids}
                    >
                      {#if loadingKids}
                        ⋯
                      {:else if expanded}
                        ▼
                      {:else}
                        ▶
                      {/if}
                    </button>
                  {:else}
                    <span class="tree-toggle-spacer"></span>
                  {/if}
                  
                  
                  <div class="collection-info clickable" on:click={() => viewCollection(collection)} on:keydown={(e) => e.key === 'Enter' && viewCollection(collection)} role="button" tabindex="0">
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
                  </div>
                </div>

                <!-- Nested children (level 1) -->
                {#if expanded && childCollectionsMap.has(collection.id)}
                  {#each childCollectionsMap.get(collection.id) || [] as child1 (child1.id + '-' + expandedIds.join(',') + '-' + childMapSize)}
                    {@const hasKids1 = hasChildren(child1.id)}
                    {@const expanded1 = isExpanded(child1.id)}
                    {@const loadingKids1 = isLoadingChildren(child1.id)}
                    
                    <div class="collection-tree-item" data-level="1">
                      <div class="collection-item">
                        {#if hasKids1 || loadingKids1 || !childCollectionsMap.has(child1.id)}
                          <button 
                            class="tree-toggle" 
                            on:click={() => toggleExpand(child1.id)}
                            disabled={loadingKids1}
                          >
                            {#if loadingKids1}
                              ⋯
                            {:else if expanded1}
                              ▼
                            {:else}
                              ▶
                            {/if}
                          </button>
                        {:else}
                          <span class="tree-toggle-spacer"></span>
                        {/if}
                        
                        
                        <div class="collection-info clickable" on:click={() => viewCollection(child1)} on:keydown={(e) => e.key === 'Enter' && viewCollection(child1)} role="button" tabindex="0">
                          <h4>{child1.name}</h4>
                          {#if child1.description}
                            <p>{child1.description}</p>
                          {/if}
                          {#if child1.collection_type}
                            <span class="badge">{child1.collection_type}</span>
                          {/if}
                        </div>
                        <div class="collection-actions">
                          <button 
                            class="btn-icon" 
                            on:click={() => openCreateCollectionModal(child1.id)}
                            title="Add subcollection"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <!-- Nested children (level 2) -->
                      {#if expanded1 && childCollectionsMap.has(child1.id)}
                        {#each childCollectionsMap.get(child1.id) || [] as child2 (child2.id + '-' + expandedIds.join(',') + '-' + childMapSize)}
                          {@const hasKids2 = hasChildren(child2.id)}
                          {@const expanded2 = isExpanded(child2.id)}
                          {@const loadingKids2 = isLoadingChildren(child2.id)}
                          
                          <div class="collection-tree-item" data-level="2">
                            <div class="collection-item">
                              {#if hasKids2 || loadingKids2 || !childCollectionsMap.has(child2.id)}
                                <button 
                                  class="tree-toggle" 
                                  on:click={() => toggleExpand(child2.id)}
                                  disabled={loadingKids2}
                                >
                                  {#if loadingKids2}
                                    ⋯
                                  {:else if expanded2}
                                    ▼
                                  {:else}
                                    ▶
                                  {/if}
                                </button>
                              {:else}
                                <span class="tree-toggle-spacer"></span>
                              {/if}
                              
                              
                              <div class="collection-info clickable" on:click={() => viewCollection(child2)} on:keydown={(e) => e.key === 'Enter' && viewCollection(child2)} role="button" tabindex="0">
                                <h4>{child2.name}</h4>
                                {#if child2.description}
                                  <p>{child2.description}</p>
                                {/if}
                                {#if child2.collection_type}
                                  <span class="badge">{child2.collection_type}</span>
                                {/if}
                              </div>
                              <div class="collection-actions">
                                <button 
                                  class="btn-icon" 
                                  on:click={() => openCreateCollectionModal(child2.id)}
                                  title="Add subcollection"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <!-- Nested children (level 3) -->
                            {#if expanded2 && childCollectionsMap.has(child2.id)}
                              {#each childCollectionsMap.get(child2.id) || [] as child3 (child3.id + '-' + expandedIds.join(',') + '-' + childMapSize)}
                                {@const hasKids3 = hasChildren(child3.id)}
                                {@const expanded3 = isExpanded(child3.id)}
                                {@const loadingKids3 = isLoadingChildren(child3.id)}
                                
                                <div class="collection-tree-item" data-level="3">
                                  <div class="collection-item">
                                    {#if hasKids3 || loadingKids3 || !childCollectionsMap.has(child3.id)}
                                      <button 
                                        class="tree-toggle" 
                                        on:click={() => toggleExpand(child3.id)}
                                        disabled={loadingKids3}
                                      >
                                        {#if loadingKids3}
                                          ⋯
                                        {:else if expanded3}
                                          ▼
                                        {:else}
                                          ▶
                                        {/if}
                                      </button>
                                    {:else}
                                      <span class="tree-toggle-spacer"></span>
                                    {/if}
                                    
                                    
                                    <div class="collection-info clickable" on:click={() => viewCollection(child3)} on:keydown={(e) => e.key === 'Enter' && viewCollection(child3)} role="button" tabindex="0">
                                      <h4>{child3.name}</h4>
                                      {#if child3.description}
                                        <p>{child3.description}</p>
                                      {/if}
                                      {#if child3.collection_type}
                                        <span class="badge">{child3.collection_type}</span>
                                      {/if}
                                    </div>
                                    <div class="collection-actions">
                                      <button 
                                        class="btn-icon" 
                                        on:click={() => openCreateCollectionModal(child3.id)}
                                        title="Add subcollection"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>

                                  <!-- Level 4+ children indicated with message -->
                                  {#if expanded3 && childCollectionsMap.has(child3.id)}
                                    {#each childCollectionsMap.get(child3.id) || [] as child4 (child4.id + '-' + expandedIds.join(',') + '-' + childMapSize)}
                                      <div class="collection-tree-item" data-level="4">
                                        <div class="collection-item">
                                          <span class="tree-toggle-spacer"></span>
                                          
                                          <div class="collection-info clickable" on:click={() => viewCollection(child4)} on:keydown={(e) => e.key === 'Enter' && viewCollection(child4)} role="button" tabindex="0">
                                            <h4>{child4.name}</h4>
                                            {#if child4.description}
                                              <p>{child4.description}</p>
                                            {/if}
                                            {#if child4.collection_type}
                                              <span class="badge">{child4.collection_type}</span>
                                            {/if}
                                          </div>
                                          <div class="collection-actions">
                                            <button 
                                              class="btn-icon" 
                                              on:click={() => openCreateCollectionModal(child4.id)}
                                              title="Add subcollection"
                                            >
                                              +
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    {/each}
                                  {/if}
                                </div>
                              {/each}
                            {/if}
                          </div>
                        {/each}
                      {/if}
                    </div>
                  {/each}
                {/if}
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

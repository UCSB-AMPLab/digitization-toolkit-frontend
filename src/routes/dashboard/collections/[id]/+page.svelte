<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { projectsApi, collectionsApi, recordsApi, type Project, type Collection, type Record } from '$lib/api';

  let collection: Collection | null = null;
  let project: Project | null = null;
  let ancestorChain: Collection[] = []; // ordered from root ancestor to immediate parent
  let childCollections: Collection[] = [];
  let records: Record[] = [];
  let loading = true;
  let error: string | null = null;

  $: collectionId = parseInt($page.params.id);

  // Re-load data whenever collectionId changes (same-route navigation reuses the component)
  $: if (collectionId) {
    loadCollectionData();
  }

  async function loadCollectionData() {
    try {
      loading = true;
      error = null;

      // Load collection details
      collection = await collectionsApi.get(collectionId);

      // Build full ancestor chain (walk up parent_collection_id)
      const ancestors: Collection[] = [];
      let currentParentId = collection.parent_collection_id;
      while (currentParentId) {
        try {
          const ancestor = await collectionsApi.get(currentParentId);
          ancestors.unshift(ancestor); // prepend so order is root-first
          currentParentId = ancestor.parent_collection_id;
        } catch (e) {
          console.error('Failed to load ancestor collection:', e);
          break;
        }
      }
      ancestorChain = ancestors; // single assignment triggers Svelte reactivity

      // Load project — subcollections don't have project_id directly,
      // so get it from the root ancestor (which is a top-level collection)
      const rootProjectId = collection.project_id
        ?? (ancestors.length > 0 ? ancestors[0].project_id : null);
      if (rootProjectId) {
        try {
          project = await projectsApi.get(rootProjectId);
        } catch (e) {
          console.error('Failed to load project:', e);
          project = null;
        }
      } else {
        project = null;
      }

      // Load child collections
      childCollections = await collectionsApi.list({ parent_collection_id: collectionId });

      // Load records in this collection
      records = await recordsApi.list({ collection_id: collectionId });

    } catch (e: any) {
      console.error('Failed to load collection data:', e);
      error = e.message || 'Failed to load collection';
    } finally {
      loading = false;
    }
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function goToProject() {
    if (project) {
      goto(`/dashboard/projects/${project.id}`);
    }
  }

  function viewChildCollection(child: Collection) {
    goto(`/dashboard/collections/${child.id}`);
  }

  function viewRecord(record: Record) {
    goto(`/dashboard/records/${record.id}`);
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
</script>

<div class="page-container">
  <div class="breadcrumb">
    <a href="/dashboard/projects" class="breadcrumb-link">Projects</a>
    {#if project}
      <span class="breadcrumb-separator">/</span>
      <button on:click={goToProject} class="breadcrumb-link">{project.name}</button>
    {/if}
    {#each ancestorChain as ancestor}
      <span class="breadcrumb-separator">/</span>
      <a href="/dashboard/collections/{ancestor.id}" class="breadcrumb-link">{ancestor.name}</a>
    {/each}
    {#if collection}
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{collection.name}</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading-state">Loading collection...</div>
  {:else if error}
    <div class="alert alert-error">{error}</div>
  {:else if collection}
    <header class="page-header">
      <div>
        <h1>{collection.name}</h1>
        {#if collection.description}
          <p class="collection-subtitle">{collection.description}</p>
        {/if}
        {#if collection.collection_type}
          <span class="badge badge-primary">{collection.collection_type}</span>
        {/if}
      </div>
    </header>

    <div class="collection-meta-bar">
      <span>Created: {formatDate(collection.created_at)}</span>
      <span>{childCollections.length} Subcollection(s)</span>
      <span>{records.length} Record(s)</span>
    </div>

    <!-- Subcollections Section -->
    {#if childCollections.length > 0}
      <section class="card">
        <div class="card-header">
          <h2>Subcollections</h2>
        </div>
        <div class="card-body">
          <div class="collections-grid">
            {#each childCollections as child}
              <div 
                class="collection-card"
                on:click={() => viewChildCollection(child)}
                on:keydown={(e) => e.key === 'Enter' && viewChildCollection(child)}
                role="button"
                tabindex="0"
              >
                
                <div class="collection-card-info">
                  <h3>{child.name}</h3>
                  {#if child.description}
                    <p>{child.description}</p>
                  {/if}
                  {#if child.collection_type}
                    <span class="badge badge-sm">{child.collection_type}</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <!-- Records Section -->
    <section class="card">
      <div class="card-header">
        <h2>Records</h2>
        {#if collection?.project_id}
          <button class="btn-secondary btn-sm" on:click={() => collection && goto(`/dashboard/capture/${collection.project_id}?collection_id=${collectionId}`)}>
            + Add Record <span class="material-symbols-outlined">auto_stories</span>
          </button>
        {/if}
      </div>
      <div class="card-body">
        {#if records.length === 0}
          <div class="empty-state-small">
            <p>No records in this collection yet.</p>
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
                {#if getRecordThumbnail(record)}
                  <div class="record-thumbnail">
                    <img 
                      src={getRecordThumbnail(record)} 
                      alt={record.title}
                      loading="lazy"
                    />
                  </div>
                {:else}
                  <div class="record-thumbnail record-thumbnail-placeholder">
                    <span>--</span>
                  </div>
                {/if}
                <div class="record-info">
                  <h4>{record.title}</h4>
                  {#if record.description}
                    <p class="record-description">{record.description}</p>
                  {/if}
                  <div class="record-meta">
                    <span class="badge badge-xs">{getRecordImageCount(record)} image(s)</span>
                    {#if record.object_typology}
                      <span class="badge badge-outline badge-xs">{record.object_typology}</span>
                    {/if}
                  </div>
                  {#if record.author || record.date}
                    <div class="record-details">
                      {#if record.author}
                        <span class="record-author">{record.author}</span>
                      {/if}
                      {#if record.date}
                        <span class="record-date">{record.date}</span>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

  {:else}
    <div class="alert alert-warning">Collection not found</div>
  {/if}
</div>

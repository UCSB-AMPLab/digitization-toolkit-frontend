<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { collectionsApi, recordsApi, type Collection, type RecordImage } from '$lib/api';

  let collection: Collection | null = null;
  let parentCollection: Collection | null = null;
  let childCollections: Collection[] = [];
  let records: RecordImage[] = [];
  let loading = true;
  let error: string | null = null;

  $: collectionId = parseInt($page.params.id);

  onMount(async () => {
    await loadCollectionData();
  });

  async function loadCollectionData() {
    try {
      loading = true;
      error = null;

      // Load collection details
      collection = await collectionsApi.get(collectionId);

      // Load parent collection if exists
      if (collection.parent_collection_id) {
        try {
          parentCollection = await collectionsApi.get(collection.parent_collection_id);
        } catch (e) {
          console.error('Failed to load parent collection:', e);
        }
      }

      // Load child collections
      childCollections = await collectionsApi.list({ parent_collection_id: collectionId });

      // Load records in this collection
      // Note: Backend might not support collection_id filter yet, so we may need to filter client-side
      try {
        const allRecords = await recordsApi.list({ collection_id: collectionId });
        records = allRecords;
      } catch (e: any) {
        // If backend doesn't support filtering by collection_id, fetch all and filter
        if (e.message.includes('422') || e.message.includes('400')) {
          const allRecords = await recordsApi.list();
          records = allRecords.filter(r => r.collection_id === collectionId);
        } else {
          throw e;
        }
      }

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
    if (collection?.project_id) {
      goto(`/dashboard/projects/${collection.project_id}`);
    }
  }

  function goToParentCollection() {
    if (parentCollection) {
      goto(`/dashboard/collections/${parentCollection.id}`);
    }
  }

  function viewChildCollection(child: Collection) {
    goto(`/dashboard/collections/${child.id}`);
  }

  function viewRecord(record: RecordImage) {
    // TODO: Create record detail page
    console.log('View record:', record);
  }
</script>

<div class="page-container">
  <div class="breadcrumb">
    {#if collection?.project_id}
      <button on:click={goToProject} class="breadcrumb-link">← Back to Project</button>
    {/if}
    {#if parentCollection}
      <span class="breadcrumb-separator">/</span>
      <button on:click={goToParentCollection} class="breadcrumb-link">
        📂 {parentCollection.name}
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="loading-state">Loading collection...</div>
  {:else if error}
    <div class="alert alert-error">{error}</div>
  {:else if collection}
    <header class="page-header">
      <div>
        <h1>📂 {collection.name}</h1>
        {#if collection.description}
          <p class="collection-subtitle">{collection.description}</p>
        {/if}
        {#if collection.collection_type}
          <span class="badge badge-primary">{collection.collection_type}</span>
        {/if}
      </div>
    </header>

    <div class="collection-meta-bar">
      <span>📅 Created: {formatDate(collection.created_at)}</span>
      <span>📁 {childCollections.length} Subcollection(s)</span>
      <span>📄 {records.length} Record(s)</span>
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
                <div class="collection-card-icon">📂</div>
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
            + Add Record
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
                {#if record.thumbnail_path}
                  <div class="record-thumbnail">
                    <img 
                      src={recordsApi.getThumbnailUrl(record.id)} 
                      alt={record.title || record.filename}
                      loading="lazy"
                    />
                  </div>
                {:else}
                  <div class="record-thumbnail record-thumbnail-placeholder">
                    <span>🖼️</span>
                  </div>
                {/if}
                <div class="record-info">
                  <h4>{record.title || record.filename}</h4>
                  {#if record.description}
                    <p class="record-description">{record.description}</p>
                  {/if}
                  <div class="record-meta">
                    <span class="badge badge-xs">{record.format?.toUpperCase() || 'N/A'}</span>
                    {#if record.resolution_width && record.resolution_height}
                      <span class="record-resolution">
                        {record.resolution_width}×{record.resolution_height}
                      </span>
                    {/if}
                    <span class="record-size">{formatFileSize(record.file_size)}</span>
                  </div>
                  {#if record.object_typology}
                    <div class="record-typology">
                      <span class="badge badge-outline badge-xs">{record.object_typology}</span>
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

<style>
  .breadcrumb-link {
    background: none;
    border: none;
    color: var(--color-primary, #0066cc);
    cursor: pointer;
    padding: 0;
    font-size: 0.9rem;
    text-decoration: none;
  }

  .breadcrumb-link:hover {
    text-decoration: underline;
  }

  .breadcrumb-separator {
    margin: 0 0.5rem;
    color: var(--color-text-secondary, #666);
  }

  .collection-subtitle {
    margin-top: 0.5rem;
    color: var(--color-text-secondary, #666);
    font-size: 1rem;
  }

  .collection-meta-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    padding: 1rem;
    background: var(--color-bg-secondary, #f5f5f5);
    border-radius: 8px;
    margin-bottom: 2rem;
    font-size: 0.9rem;
  }

  .collections-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }

  .collection-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }

  .collection-card:hover {
    border-color: var(--color-primary, #0066cc);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .collection-card-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .collection-card-info {
    text-align: center;
    width: 100%;
  }

  .collection-card-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
  }

  .collection-card-info p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--color-text-secondary, #666);
  }

  .records-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .record-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }

  .record-card:hover {
    border-color: var(--color-primary, #0066cc);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .record-thumbnail {
    width: 100%;
    height: 150px;
    overflow: hidden;
    background: var(--color-bg-secondary, #f5f5f5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .record-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .record-thumbnail-placeholder {
    font-size: 3rem;
  }

  .record-info {
    padding: 1rem;
  }

  .record-info h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record-description {
    margin: 0.5rem 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary, #666);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
  }

  .record-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-text-secondary, #666);
  }

  .record-resolution,
  .record-size {
    font-size: 0.75rem;
  }

  .record-typology {
    margin-top: 0.5rem;
  }

  .badge-xs {
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
  }

  .badge-sm {
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }

  .badge-outline {
    background: transparent;
    border: 1px solid currentColor;
  }

  @media (max-width: 1024px) {
    .collections-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }

    .records-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }

  @media (max-width: 800px) {
    .collections-grid {
      grid-template-columns: 1fr;
    }

    .records-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }

    .collection-meta-bar {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    recordsApi,
    collectionsApi,
    projectsApi,
    type Record,
    type RecordImage,
    type Project,
    type Collection
  } from '$lib/api';

  let record: Record | null = null;
  let project: Project | null = null;
  let collection: Collection | null = null;
  let loading = true;
  let error: string | null = null;
  let saving = false;
  let saveMessage = '';

  // Edit mode
  let editing = false;
  let editTitle = '';
  let editDescription = '';
  let editTypology = '';
  let editAuthor = '';
  let editMaterial = '';
  let editDate = '';
  let editCustomAttributes = '';

  // Image viewer
  let selectedImage: RecordImage | null = null;
  let showImageViewer = false;

  $: recordId = parseInt($page.params.id);

  $: if (recordId) {
    loadRecord();
  }

  async function loadRecord() {
    try {
      loading = true;
      error = null;
      record = await recordsApi.get(recordId);

      // Load parent collection
      if (record.collection_id) {
        try {
          collection = await collectionsApi.get(record.collection_id);
        } catch { collection = null; }
      }

      // Resolve project: directly from record, from collection, or walk up hierarchy
      let resolvedProjectId = record.project_id || collection?.project_id;
      if (!resolvedProjectId && collection?.parent_collection_id) {
        // Walk up the collection hierarchy to find the root with project_id
        let parentId: number | undefined | null = collection.parent_collection_id;
        while (parentId && !resolvedProjectId) {
          try {
            const parent = await collectionsApi.get(parentId);
            resolvedProjectId = parent.project_id;
            parentId = parent.parent_collection_id;
          } catch { break; }
        }
      }
      if (resolvedProjectId) {
        try {
          project = await projectsApi.get(resolvedProjectId);
        } catch { project = null; }
      } else {
        project = null;
      }
    } catch (e: any) {
      error = e.message || 'Failed to load record';
    } finally {
      loading = false;
    }
  }

  function startEditing() {
    if (!record) return;
    editTitle = record.title || '';
    editDescription = record.description || '';
    editTypology = record.object_typology || '';
    editAuthor = record.author || '';
    editMaterial = record.material || '';
    editDate = record.date || '';
    editCustomAttributes = record.custom_attributes || '';
    editing = true;
  }

  function cancelEditing() {
    editing = false;
    saveMessage = '';
  }

  async function saveRecord() {
    if (!record || !editTitle.trim()) return;
    try {
      saving = true;
      saveMessage = '';
      record = await recordsApi.update(record.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        object_typology: editTypology.trim() || undefined,
        author: editAuthor.trim() || undefined,
        material: editMaterial.trim() || undefined,
        date: editDate.trim() || undefined,
        custom_attributes: editCustomAttributes.trim() || undefined
      });
      editing = false;
      saveMessage = 'Record saved successfully';
      setTimeout(() => { saveMessage = ''; }, 3000);
    } catch (e: any) {
      saveMessage = e.message || 'Failed to save record';
    } finally {
      saving = false;
    }
  }

  async function deleteRecord() {
    if (!record) return;
    if (!confirm(`Delete record "${record.title}"? This will also delete all associated images.`)) return;
    try {
      await recordsApi.delete(record.id);
      // Navigate back
      if (collection) {
        goto(`/dashboard/collections/${collection.id}`);
      } else if (project) {
        goto(`/dashboard/projects/${project.id}`);
      } else {
        goto('/dashboard');
      }
    } catch (e: any) {
      error = e.message || 'Failed to delete record';
    }
  }

  function openCapture() {
    if (!record) return;
    const pid = project?.id || collection?.project_id;
    if (!pid) return;
    goto(`/dashboard/capture/${pid}?record_id=${record.id}&collection_id=${record.collection_id || ''}`);
  }

  function viewImage(image: RecordImage) {
    selectedImage = image;
    showImageViewer = true;
  }

  function closeImageViewer() {
    showImageViewer = false;
    selectedImage = null;
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  }

  function formatDateTime(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getImagesByPair(images: RecordImage[]): Map<string, RecordImage[]> {
    const pairs = new Map<string, RecordImage[]>();
    for (const img of images) {
      const key = img.pair_id || `single_${img.id}`;
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key)!.push(img);
    }
    return pairs;
  }

  const typologyOptions = [
    { value: 'book', label: 'Book' },
    { value: 'dossier', label: 'Dossier' },
    { value: 'document', label: 'Document' },
    { value: 'map', label: 'Map' },
    { value: 'planimetry', label: 'Planimetry' },
    { value: 'other', label: 'Other' }
  ];
</script>

<div class="page-container">
  <!-- Breadcrumb -->
  <div class="breadcrumb">
    <a href="/dashboard/projects" class="breadcrumb-link">Projects</a>
    {#if project}
      <span class="breadcrumb-separator">/</span>
      <a href="/dashboard/projects/{project.id}" class="breadcrumb-link">{project.name}</a>
    {/if}
    {#if collection}
      <span class="breadcrumb-separator">/</span>
      <a href="/dashboard/collections/{collection.id}" class="breadcrumb-link">{collection.name}</a>
    {/if}
    {#if record}
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">{record.title}</span>
    {/if}
  </div>

  {#if loading}
    <div class="loading-state">Loading record...</div>
  {:else if error}
    <div class="alert alert-error">{error}</div>
  {:else if record}
    <!-- Header -->
    <header class="page-header">
      <div>
        <h1>{record.title}</h1>
        {#if record.object_typology}
          <span class="badge badge-primary">{record.object_typology}</span>
        {/if}
      </div>
      <div class="header-actions">
        {#if !editing}
          <button class="btn-secondary btn-sm" on:click={startEditing}>
            <span class="material-symbols-outlined icon-sm">edit</span> Edit
          </button>
        {/if}
        <button class="btn-primary btn-sm" on:click={openCapture}>
          <span class="material-symbols-outlined icon-sm">photo_camera</span> Capture
        </button>
      </div>
    </header>

    {#if saveMessage}
      <div class="alert" class:alert-error={saveMessage.includes('Failed')}
           style="background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7;">
        {saveMessage}
      </div>
    {/if}

    <!-- Metadata Section -->
    <section class="card">
      <div class="card-header">
        <h2>Record Metadata</h2>
      </div>
      <div class="card-body">
        {#if editing}
          <!-- Edit Form -->
          <div class="record-form">
            <div class="form-row">
              <div class="form-group">
                <label for="edit-title">Title *</label>
                <input id="edit-title" type="text" class="form-input" bind:value={editTitle} />
              </div>
              <div class="form-group">
                <label for="edit-typology">Object Typology</label>
                <select id="edit-typology" class="form-select" bind:value={editTypology}>
                  <option value="">Select type</option>
                  {#each typologyOptions as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="edit-author">Author</label>
                <input id="edit-author" type="text" class="form-input" bind:value={editAuthor} />
              </div>
              <div class="form-group">
                <label for="edit-date">Date</label>
                <input id="edit-date" type="text" class="form-input" bind:value={editDate} placeholder="e.g. 1920, c. 1800s" />
              </div>
            </div>

            <div class="form-group">
              <label for="edit-material">Material</label>
              <input id="edit-material" type="text" class="form-input" bind:value={editMaterial} placeholder="e.g. Paper, Parchment" />
            </div>

            <div class="form-group">
              <label for="edit-description">Description</label>
              <textarea id="edit-description" class="form-textarea" bind:value={editDescription} rows="3"></textarea>
            </div>

            <div class="form-group">
              <label for="edit-custom">Custom Attributes (JSON)</label>
              <textarea id="edit-custom" class="form-textarea" bind:value={editCustomAttributes} rows="2" placeholder={'{"language": "Latin", "condition": "Good"}'}></textarea>
            </div>

            <div class="form-actions">
              <button class="btn-secondary" on:click={cancelEditing}>Cancel</button>
              <button class="btn-primary" on:click={saveRecord} disabled={saving || !editTitle.trim()}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        {:else}
          <!-- Read-only Metadata Display -->
          <div class="metadata-grid">
            <div class="metadata-item">
              <span class="metadata-label">Title</span>
              <span class="metadata-value">{record.title}</span>
            </div>
            {#if record.object_typology}
              <div class="metadata-item">
                <span class="metadata-label">Typology</span>
                <span class="metadata-value">{record.object_typology}</span>
              </div>
            {/if}
            {#if record.author}
              <div class="metadata-item">
                <span class="metadata-label">Author</span>
                <span class="metadata-value">{record.author}</span>
              </div>
            {/if}
            {#if record.date}
              <div class="metadata-item">
                <span class="metadata-label">Date</span>
                <span class="metadata-value">{record.date}</span>
              </div>
            {/if}
            {#if record.material}
              <div class="metadata-item">
                <span class="metadata-label">Material</span>
                <span class="metadata-value">{record.material}</span>
              </div>
            {/if}
            {#if record.description}
              <div class="metadata-item metadata-item-full">
                <span class="metadata-label">Description</span>
                <span class="metadata-value">{record.description}</span>
              </div>
            {/if}
            <div class="metadata-item">
              <span class="metadata-label">Created</span>
              <span class="metadata-value">{formatDateTime(record.created_at)}</span>
            </div>
            {#if record.created_by}
              <div class="metadata-item">
                <span class="metadata-label">Created By</span>
                <span class="metadata-value">{record.created_by}</span>
              </div>
            {/if}
            {#if record.modified_at}
              <div class="metadata-item">
                <span class="metadata-label">Last Modified</span>
                <span class="metadata-value">{formatDateTime(record.modified_at)}</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="card-footer-danger">
        <button class="btn-text-danger" on:click={deleteRecord}>
          <span class="material-symbols-outlined icon-sm">delete</span> Delete this record
        </button>
      </div>
    </section>

    <!-- Images Section -->
    <section class="card">
      <div class="card-header">
        <h2>Images ({record.images?.length || 0})</h2>
        <button class="btn-secondary btn-sm" on:click={openCapture}>
          <span class="material-symbols-outlined icon-sm">add_a_photo</span> Add Captures
        </button>
      </div>
      <div class="card-body">
        {#if !record.images || record.images.length === 0}
          <div class="empty-state-small">
            <span class="material-symbols-outlined icon-lg" style="color: var(--text-muted); margin-bottom: 0.5rem;">image</span>
            <p>No images captured yet.</p>
            <button class="btn-primary btn-sm" on:click={openCapture}>
              <span class="material-symbols-outlined icon-sm">photo_camera</span> Start Capturing
            </button>
          </div>
        {:else}
          <div class="images-grid">
            {#each record.images as image}
              <div
                class="image-card"
                on:click={() => viewImage(image)}
                on:keydown={(e) => e.key === 'Enter' && viewImage(image)}
                role="button"
                tabindex="0"
              >
                <div class="image-card-preview">
                  {#if image.thumbnail_path}
                    <img src={recordsApi.getImageThumbnailUrl(image.id)} alt={image.filename} loading="lazy" />
                  {:else}
                    <span class="material-symbols-outlined" style="font-size:2rem; color: var(--text-muted);">image</span>
                  {/if}
                </div>
                <div class="image-card-info">
                  <span class="image-card-name">{image.filename}</span>
                  <div class="image-card-meta">
                    {#if image.role}
                      <span class="badge badge-xs">{image.role}</span>
                    {/if}
                    {#if image.file_size}
                      <span>{formatFileSize(image.file_size)}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {:else}
    <div class="alert alert-warning">Record not found</div>
  {/if}
</div>

<!-- Image Detail Viewer Modal -->
{#if showImageViewer && selectedImage}
  <div class="modal-overlay" on:click={closeImageViewer} on:keydown={(e) => e.key === 'Escape' && closeImageViewer()} role="dialog" tabindex="-1">
    <div class="modal image-viewer-modal" on:click|stopPropagation role="document">
      <div class="modal-header">
        <h2>{selectedImage.filename}</h2>
        <button class="close-btn" on:click={closeImageViewer}>&times;</button>
      </div>
      <div class="modal-body image-viewer-body">
        <div class="image-viewer-preview">
          <img src={recordsApi.getImageFileUrl(selectedImage.id)} alt={selectedImage.filename} />
        </div>
        <div class="image-viewer-details">
          <h3>Image Details</h3>
          <div class="metadata-grid metadata-grid-compact">
            <div class="metadata-item">
              <span class="metadata-label">Format</span>
              <span class="metadata-value">{selectedImage.format || 'N/A'}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Size</span>
              <span class="metadata-value">{formatFileSize(selectedImage.file_size)}</span>
            </div>
            {#if selectedImage.resolution_width && selectedImage.resolution_height}
              <div class="metadata-item">
                <span class="metadata-label">Resolution</span>
                <span class="metadata-value">{selectedImage.resolution_width} &times; {selectedImage.resolution_height}</span>
              </div>
            {/if}
            {#if selectedImage.role}
              <div class="metadata-item">
                <span class="metadata-label">Role</span>
                <span class="metadata-value">{selectedImage.role}</span>
              </div>
            {/if}
            {#if selectedImage.capture_id}
              <div class="metadata-item">
                <span class="metadata-label">Capture ID</span>
                <span class="metadata-value" style="font-size:0.75rem">{selectedImage.capture_id}</span>
              </div>
            {/if}
            <div class="metadata-item">
              <span class="metadata-label">Captured</span>
              <span class="metadata-value">{formatDateTime(selectedImage.created_at)}</span>
            </div>
          </div>

          {#if selectedImage.camera_settings}
            <h3 style="margin-top:1rem;">Camera Settings</h3>
            <div class="metadata-grid metadata-grid-compact">
              {#if selectedImage.camera_settings.camera_model}
                <div class="metadata-item">
                  <span class="metadata-label">Camera</span>
                  <span class="metadata-value">{selectedImage.camera_settings.camera_model}</span>
                </div>
              {/if}
              {#if selectedImage.camera_settings.iso}
                <div class="metadata-item">
                  <span class="metadata-label">ISO</span>
                  <span class="metadata-value">{selectedImage.camera_settings.iso}</span>
                </div>
              {/if}
              {#if selectedImage.camera_settings.aperture}
                <div class="metadata-item">
                  <span class="metadata-label">Aperture</span>
                  <span class="metadata-value">f/{selectedImage.camera_settings.aperture}</span>
                </div>
              {/if}
              {#if selectedImage.camera_settings.shutter_speed}
                <div class="metadata-item">
                  <span class="metadata-label">Shutter Speed</span>
                  <span class="metadata-value">{selectedImage.camera_settings.shutter_speed}</span>
                </div>
              {/if}
              {#if selectedImage.camera_settings.focal_length}
                <div class="metadata-item">
                  <span class="metadata-label">Focal Length</span>
                  <span class="metadata-value">{selectedImage.camera_settings.focal_length}mm</span>
                </div>
              {/if}
              {#if selectedImage.camera_settings.white_balance}
                <div class="metadata-item">
                  <span class="metadata-label">White Balance</span>
                  <span class="metadata-value">{selectedImage.camera_settings.white_balance}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
      <div class="modal-footer">
        <a href={recordsApi.getImageFileUrl(selectedImage.id)} download class="btn-secondary btn-sm">
          <span class="material-symbols-outlined icon-sm">download</span> Download
        </a>
        <button class="btn-secondary btn-sm" on:click={closeImageViewer}>Close</button>
      </div>
    </div>
  </div>
{/if}

<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    projectsApi,
    collectionsApi,
    recordsApi,
    camerasApi,
    type Project,
    type Collection,
    type Record,
    type CameraDevice,
    type CaptureResponse,
    type RecordImage
  } from '$lib/api';

  // Route params & query
  $: projectId = parseInt($page.params.projectId);
  $: queryRecordId = $page.url.searchParams.get('record_id');
  $: queryCollectionId = $page.url.searchParams.get('collection_id');

  // State
  let project: Project | null = null;
  let collection: Collection | null = null;
  let record: Record | null = null;
  let cameras: CameraDevice[] = [];

  let loading = true;
  let error: string | null = null;

  // Step: 'metadata' (create record) or 'capture' (take photos)
  let step: 'metadata' | 'capture' = 'capture';

  // New record form
  let formTitle = '';
  let formDescription = '';
  let formTypology = '';
  let formAuthor = '';
  let formMaterial = '';
  let formDate = '';
  let formError = '';

  // Capture state
  let capturing = false;
  let captureResult: CaptureResponse | null = null;
  let capturedImages: RecordImage[] = [];
  let sequenceCounter = 1;
  let captureMessage = '';
  let resolution = 'medium';

  // Calibration state
  let calibrating = false;
  let calibrationMessage = '';
  let showCalibration = false;
  let calibrationCameraIndex = 0;

  const typologyOptions = [
    { value: 'book', label: 'Book' },
    { value: 'dossier', label: 'Dossier' },
    { value: 'document', label: 'Document' },
    { value: 'map', label: 'Map' },
    { value: 'planimetry', label: 'Planimetry' },
    { value: 'other', label: 'Other' }
  ];

  const resolutionOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' }
  ];

  $: if (projectId) {
    init();
  }

  async function init() {
    try {
      loading = true;
      error = null;

      // Load project
      project = await projectsApi.get(projectId);

      // Load collection if specified
      if (queryCollectionId) {
        try {
          collection = await collectionsApi.get(parseInt(queryCollectionId));
        } catch { collection = null; }
      }

      // Load cameras
      try {
        cameras = await camerasApi.listDevices();
      } catch {
        cameras = [];
      }

      // If record_id provided, load existing record → go straight to capture
      if (queryRecordId) {
        try {
          record = await recordsApi.get(parseInt(queryRecordId));
          // Reload images to keep track
          capturedImages = record.images || [];
          sequenceCounter = capturedImages.length + 1;
          step = 'capture';
        } catch (e: any) {
          error = 'Record not found: ' + e.message;
        }
      } else {
        // No record yet → show metadata form first
        step = 'metadata';
      }

    } catch (e: any) {
      error = e.message || 'Failed to initialize capture';
    } finally {
      loading = false;
    }
  }

  async function createRecord() {
    if (!formTitle.trim()) {
      formError = 'Title is required';
      return;
    }

    try {
      formError = '';
      const newRecord = await recordsApi.create({
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        object_typology: formTypology || undefined,
        author: formAuthor.trim() || undefined,
        material: formMaterial.trim() || undefined,
        date: formDate.trim() || undefined,
        project_id: projectId,
        collection_id: queryCollectionId ? parseInt(queryCollectionId) : undefined
      });

      record = newRecord;
      capturedImages = [];
      sequenceCounter = 1;
      step = 'capture';
    } catch (e: any) {
      formError = e.message || 'Failed to create record';
    }
  }

  async function handleCapture() {
    if (!record || !project) return;
    try {
      capturing = true;
      captureMessage = '';
      captureResult = null;

      let result: CaptureResponse;

      if (cameras.length >= 2) {
        // Dual capture
        result = await camerasApi.captureDual({
          project_name: project.name,
          resolution,
          record_id: record.id,
          record_title: record.title,
          sequence: sequenceCounter
        });
      } else {
        // Single capture
        result = await camerasApi.capture({
          project_name: project.name,
          camera_index: cameras.length > 0 ? cameras[0].index : 0,
          resolution,
          record_id: record.id,
          record_title: record.title
        });
      }

      captureResult = result;

      if (result.success) {
        captureMessage = cameras.length >= 2
          ? `Dual capture successful (${result.image_ids?.length || 0} images)`
          : 'Capture successful';
        sequenceCounter++;

        // Reload record images
        const updatedRecord = await recordsApi.get(record.id);
        record = updatedRecord;
        capturedImages = updatedRecord.images || [];
      } else {
        captureMessage = result.error || 'Capture failed';
      }
    } catch (e: any) {
      captureMessage = e.message || 'Capture failed';
    } finally {
      capturing = false;
    }
  }

  async function handleCalibrate(type: 'autofocus' | 'white-balance') {
    try {
      calibrating = true;
      calibrationMessage = '';

      if (type === 'autofocus') {
        const result = await camerasApi.calibrate({ camera_index: calibrationCameraIndex, resolution: 'high' });
        if (result.success) {
          calibrationMessage = `Autofocus calibrated. Lens position: ${result.lens_position}, AF time: ${result.af_time?.toFixed(2)}s`;
        } else {
          calibrationMessage = result.error || 'Autofocus calibration failed';
        }
      } else {
        const result = await camerasApi.calibrateWhiteBalance({ camera_index: calibrationCameraIndex, resolution: 'high' });
        if (result.success) {
          calibrationMessage = `White balance calibrated. Temperature: ${result.colour_temperature}K`;
        } else {
          calibrationMessage = result.error || 'White balance calibration failed';
        }
      }
    } catch (e: any) {
      calibrationMessage = e.message || 'Calibration failed';
    } finally {
      calibrating = false;
    }
  }

  function finishCapture() {
    if (record) {
      goto(`/dashboard/records/${record.id}`);
    } else if (collection) {
      goto(`/dashboard/collections/${collection.id}`);
    } else {
      goto(`/dashboard/projects/${projectId}`);
    }
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
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
    <span class="breadcrumb-separator">/</span>
    <span class="breadcrumb-current">{step === 'metadata' ? 'New Record' : 'Capture'}</span>
  </div>

  {#if loading}
    <div class="loading-state">Initializing capture...</div>
  {:else if error}
    <div class="alert alert-error">{error}</div>
  {:else}

    <!-- ===================== -->
    <!-- STEP 1: METADATA FORM -->
    <!-- ===================== -->
    {#if step === 'metadata'}
      <header class="page-header">
        <div>
          <h1>New Record</h1>
          <p style="color: var(--text-muted); margin:0;">Enter the basic metadata for this record, then proceed to capture images.</p>
        </div>
      </header>

      <section class="card">
        <div class="card-header">
          <h2>Record Metadata</h2>
        </div>
        <div class="card-body">
          {#if formError}
            <div class="alert alert-error">{formError}</div>
          {/if}

          <div class="record-form">
            <div class="form-row">
              <div class="form-group">
                <label for="new-title">Title *</label>
                <input id="new-title" type="text" class="form-input" bind:value={formTitle} placeholder="Record title" />
              </div>
              <div class="form-group">
                <label for="new-typology">Object Typology</label>
                <select id="new-typology" class="form-select" bind:value={formTypology}>
                  <option value="">Select type</option>
                  {#each typologyOptions as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="new-author">Author</label>
                <input id="new-author" type="text" class="form-input" bind:value={formAuthor} placeholder="Author name" />
              </div>
              <div class="form-group">
                <label for="new-date">Date</label>
                <input id="new-date" type="text" class="form-input" bind:value={formDate} placeholder="e.g. 1920, c. 1800s" />
              </div>
            </div>

            <div class="form-group">
              <label for="new-material">Material</label>
              <input id="new-material" type="text" class="form-input" bind:value={formMaterial} placeholder="e.g. Paper, Parchment, Vellum" />
            </div>

            <div class="form-group">
              <label for="new-description">Description</label>
              <textarea id="new-description" class="form-textarea" bind:value={formDescription} rows="3" placeholder="Describe the record (optional)"></textarea>
            </div>

            {#if collection}
              <div class="project-context">
                <strong>Collection:</strong> {collection.name}
              </div>
            {/if}

            <div class="form-actions">
              <button class="btn-secondary" on:click={() => history.back()}>Cancel</button>
              <button class="btn-primary" on:click={createRecord} disabled={!formTitle.trim()}>
                Create &amp; Start Capture
                <span class="material-symbols-outlined icon-sm" style="vertical-align: middle; margin-left:0.25rem;">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </section>

    <!-- ======================== -->
    <!-- STEP 2: CAPTURE INTERFACE -->
    <!-- ======================== -->
    {:else if step === 'capture' && record}
      <header class="page-header">
        <div>
          <h1>Capture: {record.title}</h1>
          {#if record.object_typology}
            <span class="badge badge-primary">{record.object_typology}</span>
          {/if}
        </div>
        <div class="header-actions">
          <button class="btn-primary" on:click={finishCapture}>
            <span class="material-symbols-outlined icon-sm">check</span> Done
          </button>
        </div>
      </header>

      <!-- Camera Status -->
      <section class="card">
        <div class="card-header">
          <h2>
            <span class="material-symbols-outlined icon-sm" style="vertical-align:middle; margin-right:0.25rem;">videocam</span>
            Cameras ({cameras.length})
          </h2>
          <button class="btn-secondary btn-sm" on:click={() => { showCalibration = !showCalibration; }}>
            <span class="material-symbols-outlined icon-sm">tune</span> Calibrate
          </button>
        </div>
        <div class="card-body">
          {#if cameras.length === 0}
            <div class="alert" style="background:#fff3cd; color:#856404; border:1px solid #ffc107;">
              <span class="material-symbols-outlined icon-sm" style="vertical-align:middle; margin-right:0.25rem;">warning</span>
              No cameras detected. Make sure cameras are connected and the backend is running natively.
            </div>
          {:else}
            <div class="camera-cards">
              {#each cameras as camera, idx}
                <div class="camera-card" class:camera-card-calibrated={camera.calibrated}>
                  <div class="camera-card-header">
                    <span class="material-symbols-outlined">photo_camera</span>
                    <span class="camera-card-label">{camera.label || `Camera ${camera.index}`}</span>
                    {#if camera.calibrated}
                      <span class="badge badge-xs" style="background:#e8f5e9; color:#2e7d32;">Calibrated</span>
                    {:else}
                      <span class="badge badge-xs" style="background:#fff3cd; color:#856404;">Not calibrated</span>
                    {/if}
                  </div>
                  <div class="camera-card-body">
                    <span class="camera-card-detail">Model: {camera.model}</span>
                    <span class="camera-card-detail">Index: {camera.index}</span>
                    {#if camera.hardware_id}
                      <span class="camera-card-detail camera-card-hwid">{camera.hardware_id}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <!-- Calibration Panel -->
            {#if showCalibration}
              <div class="calibration-panel">
                <h3>Camera Calibration</h3>
                <div class="form-row">
                  <div class="form-group">
                    <label for="cal-camera">Camera</label>
                    <select id="cal-camera" class="form-select" bind:value={calibrationCameraIndex}>
                      {#each cameras as camera}
                        <option value={camera.index}>{camera.label || camera.model} (index {camera.index})</option>
                      {/each}
                    </select>
                  </div>
                </div>
                <div class="calibration-actions">
                  <button class="btn-secondary btn-sm" on:click={() => handleCalibrate('autofocus')} disabled={calibrating}>
                    <span class="material-symbols-outlined icon-sm">center_focus_strong</span>
                    {calibrating ? 'Calibrating...' : 'Autofocus'}
                  </button>
                  <button class="btn-secondary btn-sm" on:click={() => handleCalibrate('white-balance')} disabled={calibrating}>
                    <span class="material-symbols-outlined icon-sm">wb_sunny</span>
                    {calibrating ? 'Calibrating...' : 'White Balance'}
                  </button>
                </div>
                {#if calibrationMessage}
                  <p class="calibration-message">{calibrationMessage}</p>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      </section>

      <!-- Capture Controls -->
      <section class="card">
        <div class="card-header">
          <h2>Capture Controls</h2>
        </div>
        <div class="card-body">
          <div class="capture-controls">
            <div class="capture-settings">
              <div class="form-group" style="margin-bottom:0;">
                <label for="capture-res">Resolution</label>
                <select id="capture-res" class="form-select" bind:value={resolution}>
                  {#each resolutionOptions as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
              <div class="capture-info">
                <span>Mode: {cameras.length >= 2 ? 'Dual Capture' : 'Single Capture'}</span>
                <span>Sequence: #{sequenceCounter}</span>
              </div>
            </div>

            <button
              class="capture-button"
              on:click={handleCapture}
              disabled={capturing || cameras.length === 0}
            >
              {#if capturing}
                <span class="material-symbols-outlined capture-button-icon">hourglass_top</span>
                <span>Capturing...</span>
              {:else}
                <span class="material-symbols-outlined capture-button-icon">photo_camera</span>
                <span>Capture</span>
              {/if}
            </button>

            {#if captureMessage}
              <p class="capture-message" class:capture-message-error={captureMessage.includes('fail') || captureMessage.includes('Failed')}>
                {captureMessage}
              </p>
            {/if}
          </div>
        </div>
      </section>

      <!-- Captured Images -->
      {#if capturedImages.length > 0}
        <section class="card">
          <div class="card-header">
            <h2>Captured Images ({capturedImages.length})</h2>
          </div>
          <div class="card-body">
            <div class="captured-images-grid">
              {#each capturedImages as img}
                <div class="captured-image-item">
                  <div class="captured-image-preview">
                    {#if img.thumbnail_path}
                      <img src={recordsApi.getImageThumbnailUrl(img.id)} alt={img.filename} loading="lazy" />
                    {:else}
                      <span class="material-symbols-outlined" style="font-size:2rem; color:var(--text-muted);">image</span>
                    {/if}
                  </div>
                  <div class="captured-image-info">
                    <span class="captured-image-name">{img.filename}</span>
                    {#if img.role}
                      <span class="badge badge-xs">{img.role}</span>
                    {/if}
                    {#if img.file_size}
                      <span class="captured-image-size">{formatFileSize(img.file_size)}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </section>
      {/if}

    {/if}
  {/if}
</div>

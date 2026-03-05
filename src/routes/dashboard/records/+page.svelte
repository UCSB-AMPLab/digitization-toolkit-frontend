<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    recordsApi, projectsApi, collectionsApi,
    type Record, type Project, type Collection
  } from '$lib/api';

  let records: Record[] = [];
  let projects: Project[] = [];
  let collections: Collection[] = [];
  let loading = true;
  let error: string | null = null;

  // Modal state
  type ModalMode = 'assign-project' | 'assign-collection' | 'delete' | null;
  let modalMode: ModalMode = null;
  let selectedRecord: Record | null = null;
  let assignProjectId = '';
  let assignCollectionId = '';
  let actionError = '';
  let actionLoading = false;

  onMount(async () => {
    await load();
  });

  async function load() {
    loading = true;
    error = null;
    try {
      [records, projects, collections] = await Promise.all([
        recordsApi.list({ orphaned: true }),
        projectsApi.list(),
        collectionsApi.list()
      ]);
    } catch (e: any) {
      error = e.message || 'Failed to load orphaned records';
    } finally {
      loading = false;
    }
  }

  function openModal(mode: ModalMode, record: Record) {
    selectedRecord = record;
    modalMode = mode;
    assignProjectId = '';
    assignCollectionId = '';
    actionError = '';
  }

  function closeModal() {
    modalMode = null;
    selectedRecord = null;
    actionError = '';
    actionLoading = false;
  }

  async function handleAssignProject() {
    if (!selectedRecord || !assignProjectId) {
      actionError = 'Please select a project';
      return;
    }
    actionLoading = true;
    try {
      await recordsApi.update(selectedRecord.id, {
        project_id: parseInt(assignProjectId),
        collection_id: null
      });
      await load();
      closeModal();
    } catch (e: any) {
      actionError = e.message || 'Failed to assign record';
    } finally {
      actionLoading = false;
    }
  }

  async function handleAssignCollection() {
    if (!selectedRecord || !assignCollectionId) {
      actionError = 'Please select a collection';
      return;
    }
    actionLoading = true;
    try {
      await recordsApi.update(selectedRecord.id, {
        collection_id: parseInt(assignCollectionId),
        project_id: null
      });
      await load();
      closeModal();
    } catch (e: any) {
      actionError = e.message || 'Failed to assign record';
    } finally {
      actionLoading = false;
    }
  }

  async function handleDelete() {
    if (!selectedRecord) return;
    actionLoading = true;
    try {
      await recordsApi.delete(selectedRecord.id);
      await load();
      closeModal();
    } catch (e: any) {
      actionError = e.message || 'Failed to delete record';
    } finally {
      actionLoading = false;
    }
  }

  function getThumbnailUrl(record: Record): string | null {
    if (record.images && record.images.length > 0 && record.images[0].thumbnail_path) {
      return recordsApi.getImageThumbnailUrl(record.images[0].id);
    }
    return null;
  }

  function formatDate(dateString?: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString();
  }
</script>

<div class="page-container">
  <header class="page-header">
    <div>
      <h1>Orphaned Records</h1>
      <p class="page-subtitle">Records with no project or collection assignment.</p>
    </div>
    <button class="btn-secondary" on:click={load} disabled={loading}>
      <span class="material-symbols-outlined">refresh</span>
    </button>
  </header>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if loading}
    <div class="loading-state">Loading…</div>
  {:else if records.length === 0}
    <div class="empty-state">
      <span class="material-symbols-outlined" style="font-size: 3rem; color: var(--color-success, #4caf50);">check_circle</span>
      <p>No orphaned records. Everything is assigned!</p>
    </div>
  {:else}
    <div class="alert alert-warning" style="margin-bottom: 1rem;">
      <span class="material-symbols-outlined icon-sm">warning</span>
      {records.length} record{records.length !== 1 ? 's are' : ' is'} unassigned and may be lost without action.
    </div>

    <div class="records-grid">
      {#each records as record (record.id)}
        <div class="record-card orphan-card">
          <div class="record-thumbnail">
            {#if getThumbnailUrl(record)}
              <img src={getThumbnailUrl(record)} alt={record.title} loading="lazy" />
            {:else}
              <div class="thumbnail-placeholder">
                <span class="material-symbols-outlined">article</span>
              </div>
            {/if}
          </div>
          <div class="record-info">
            <p class="record-title">{record.title}</p>
            {#if record.description}
              <p class="record-description">{record.description}</p>
            {/if}
            <div class="record-meta">
              <span class="badge badge-xs">{record.images?.length ?? 0} image(s)</span>
              {#if record.object_typology}
                <span class="badge badge-outline badge-xs">{record.object_typology}</span>
              {/if}
            </div>
            {#if record.created_at}
              <p class="record-date">{formatDate(record.created_at)}</p>
            {/if}
          </div>
          <div class="orphan-actions">
            <button
              class="btn-secondary btn-sm"
              on:click={() => openModal('assign-project', record)}
              title="Assign to a project"
            >
              <span class="material-symbols-outlined icon-sm">folder</span>
              Project
            </button>
            <button
              class="btn-secondary btn-sm"
              on:click={() => openModal('assign-collection', record)}
              title="Assign to a collection"
            >
              <span class="material-symbols-outlined icon-sm">collections_bookmark</span>
              Collection
            </button>
            <button
              class="icon-btn danger"
              on:click={() => openModal('delete', record)}
              title="Delete permanently"
            >
              <span class="material-symbols-outlined icon-sm">delete</span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Assign to Project Modal -->
{#if modalMode === 'assign-project' && selectedRecord}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal modal-small" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Assign to Project</h2>
        <button class="close-btn" on:click={closeModal}>×</button>
      </div>
      <div class="modal-body">
        <p class="modal-context">Record: <strong>{selectedRecord.title}</strong></p>
        {#if actionError}
          <div class="alert alert-error">{actionError}</div>
        {/if}
        <div class="form-group">
          <label for="assign-project-select">Project</label>
          <select id="assign-project-select" bind:value={assignProjectId} class="form-select">
            <option value="">— Select a project —</option>
            {#each projects as project}
              <option value={project.id}>{project.name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModal} disabled={actionLoading}>Cancel</button>
        <button class="btn-primary" on:click={handleAssignProject} disabled={actionLoading || !assignProjectId}>
          {actionLoading ? 'Saving…' : 'Assign'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Assign to Collection Modal -->
{#if modalMode === 'assign-collection' && selectedRecord}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal modal-small" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Assign to Collection</h2>
        <button class="close-btn" on:click={closeModal}>×</button>
      </div>
      <div class="modal-body">
        <p class="modal-context">Record: <strong>{selectedRecord.title}</strong></p>
        {#if actionError}
          <div class="alert alert-error">{actionError}</div>
        {/if}
        <div class="form-group">
          <label for="assign-collection-select">Collection</label>
          <select id="assign-collection-select" bind:value={assignCollectionId} class="form-select">
            <option value="">— Select a collection —</option>
            {#each collections as col}
              <option value={col.id}>{col.name}{col.collection_type ? ` (${col.collection_type})` : ''}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModal} disabled={actionLoading}>Cancel</button>
        <button class="btn-primary" on:click={handleAssignCollection} disabled={actionLoading || !assignCollectionId}>
          {actionLoading ? 'Saving…' : 'Assign'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if modalMode === 'delete' && selectedRecord}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal modal-small" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Delete Record</h2>
        <button class="close-btn" on:click={closeModal}>×</button>
      </div>
      <div class="modal-body">
        <p>Permanently delete <strong>{selectedRecord.title}</strong>?</p>
        <p class="warning-text">This will delete the record and all {selectedRecord.images?.length ?? 0} image(s). This cannot be undone.</p>
        {#if actionError}
          <div class="alert alert-error">{actionError}</div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeModal} disabled={actionLoading}>Cancel</button>
        <button class="btn-danger" on:click={handleDelete} disabled={actionLoading}>
          {actionLoading ? 'Deleting…' : 'Delete Permanently'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-subtitle {
    color: var(--color-text-muted, #888);
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }

  .orphan-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .orphan-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border, #e0e0e0);
    flex-wrap: wrap;
  }

  .modal-context {
    margin-bottom: 1rem;
    color: var(--color-text-muted, #888);
    font-size: 0.9rem;
  }
</style>

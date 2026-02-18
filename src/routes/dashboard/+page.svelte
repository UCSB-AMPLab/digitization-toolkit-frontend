<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { projectsApi, collectionsApi, recordsApi, type Project, type Record, type RecordImage } from '$lib/api';

  interface DashboardStats {
    projectCount: number;
    collectionCount: number;
    recordCount: number;
  }

  let stats: DashboardStats = { projectCount: 0, collectionCount: 0, recordCount: 0 };
  let lastRecord: Record | null = null;
  let lastRecordProject: Project | null = null;
  let lastRecordThumbnailUrl: string | null = null;
  let loading = true;

  onMount(async () => {
    try {
      const [projects, collections, records] = await Promise.all([
        projectsApi.list(),
        collectionsApi.list(),
        recordsApi.list({ limit: 1 })
      ]);

      stats = {
        projectCount: projects.length,
        collectionCount: collections.length,
        recordCount: 0
      };

      // Get total record count by fetching without limit
      try {
        const allRecords = await recordsApi.list();
        stats.recordCount = allRecords.length;
        if (allRecords.length > 0) {
          // Most recent record (sorted by created_at desc)
          const sorted = [...allRecords].sort((a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
          );
          lastRecord = sorted[0];
          if (lastRecord.project_id) {
            lastRecordProject = projects.find(p => p.id === lastRecord!.project_id) ?? null;
          }
          // Fetch full record to get images
          try {
            const fullRecord = await recordsApi.get(lastRecord.id);
            const imgs = fullRecord.images ?? [];
            if (imgs.length > 0) {
              const lastImg = imgs[imgs.length - 1];
              lastRecordThumbnailUrl = recordsApi.getImageThumbnailUrl(lastImg.id);
            }
          } catch {
            // thumbnail not critical
          }
        }
      } catch {
        // records API may be empty — not an error
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      loading = false;
    }
  });

  function formatDate(dateString: string | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      + ' · '
      + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function resumeRecord() {
    if (lastRecord?.id) {
      goto(`/dashboard/records/${lastRecord.id}`);
    } else {
      goto('/dashboard/projects');
    }
  }
</script>

<div class="page-container">
  <header class="page-header">
    <h1>Dashboard</h1>
  </header>

  <div class="db-layout">

    <!-- ① Last Record -->
    <section class="db-last-recording card">
      <div class="card-header">
        <span class="material-symbols-outlined card-header-icon">history</span>
        <h2>Last Record</h2>
      </div>
      <div class="card-body">
        {#if loading}
          <p class="loading-text">Loading…</p>
        {:else if lastRecord}
          <div class="last-rec-row">
            {#if lastRecordThumbnailUrl}
              <img src={lastRecordThumbnailUrl} alt="Last capture" class="last-rec-thumb" />
            {:else}
              <span class="material-symbols-outlined last-rec-icon">article</span>
            {/if}
            <div class="last-rec-info">
              <p class="last-rec-title">{lastRecord.title}</p>
              {#if lastRecordProject}
                <p class="last-rec-meta">
                  <span class="material-symbols-outlined icon-sm">folder</span>
                  {lastRecordProject.name}
                </p>
              {/if}
              <p class="last-rec-time">{formatDate(lastRecord.modified_at)}</p>
            </div>
            <button class="btn-primary last-rec-resume" on:click={resumeRecord}>
              <span class="material-symbols-outlined icon-sm">photo_camera</span>
              Resume
            </button>
          </div>
        {:else}
          <div class="last-rec-empty">
            <span class="material-symbols-outlined last-rec-empty-icon">inbox</span>
            <p>No recordings yet.</p>
            <a href="/dashboard/capture" class="btn-primary">Start Capture</a>
          </div>
        {/if}
      </div>
    </section>

    <!-- ② Stats -->
    <div class="db-stats">
      <div class="stat-card">
        <span class="material-symbols-outlined stat-icon">folder</span>
        {#if loading}
          <span class="stat-value">—</span>
        {:else}
          <span class="stat-value">{stats.projectCount}</span>
        {/if}
        <span class="stat-label">Projects</span>
      </div>
      <div class="stat-card">
        <span class="material-symbols-outlined stat-icon">collections_bookmark</span>
        {#if loading}
          <span class="stat-value">—</span>
        {:else}
          <span class="stat-value">{stats.collectionCount}</span>
        {/if}
        <span class="stat-label">Collections</span>
      </div>
      <div class="stat-card">
        <span class="material-symbols-outlined stat-icon">article</span>
        {#if loading}
          <span class="stat-value">—</span>
        {:else}
          <span class="stat-value">{stats.recordCount}</span>
        {/if}
        <span class="stat-label">Records</span>
      </div>
    </div>

  </div>
</div>

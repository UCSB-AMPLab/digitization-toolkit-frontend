<script lang="ts">
  import { onMount } from 'svelte';
  import { projectsApi } from '$lib/api';

  let lastActivity: {
    type: string;
    name: string;
    timestamp: string;
  } | null = null;
  let recentProjects: any[] = [];
  let loading = true;

  onMount(async () => {
    try {
      // Fetch recent projects for last activity
      const projects = await projectsApi.list();
      recentProjects = projects.slice(0, 3);
      
      // Mock last activity - in future this will come from actual capture sessions
      if (projects.length > 0) {
        const newest = projects[0];
        lastActivity = {
          type: 'Project',
          name: newest.name,
          timestamp: newest.created_at
        };
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      loading = false;
    }
  });

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="page-container">
  <header class="page-header">
    <h1>Dashboard</h1>
  </header>

  <div class="dashboard-content">
    <!-- Last Activity Section -->
    <section class="card last-activity-card">
      <h2>Last Activity</h2>
      {#if loading}
        <p class="loading-text">Loading...</p>
      {:else if lastActivity}
        <div class="activity-details">
          <div class="activity-icon">📁</div>
          <div class="activity-info">
            <p class="activity-type">{lastActivity.type}</p>
            <p class="activity-name">{lastActivity.name}</p>
            <p class="activity-time">{formatDate(lastActivity.timestamp)}</p>
          </div>
          <button class="btn-primary resume-btn">Resume Capture</button>
        </div>
      {:else}
        <p class="empty-state">No recent activity. Create a project to get started!</p>
      {/if}
    </section>

    <!-- Quick Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <h3>{recentProjects.length}</h3>
        <p>Total Projects</p>
      </div>
      <div class="stat-card">
        <h3>0</h3>
        <p>Records Captured</p>
      </div>
      <div class="stat-card">
        <h3>0</h3>
        <p>Collections</p>
      </div>
    </div>

    <!-- Recent Projects -->
    {#if recentProjects.length > 0}
      <section class="card recent-projects-card">
        <h2>Recent Projects</h2>
        <div class="projects-list">
          {#each recentProjects as project}
            <a href="/dashboard/projects/{project.id}" class="project-item">
              <span class="project-icon">📁</span>
              <div class="project-details">
                <p class="project-name">{project.name}</p>
                {#if project.description}
                  <p class="project-description">{project.description}</p>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>

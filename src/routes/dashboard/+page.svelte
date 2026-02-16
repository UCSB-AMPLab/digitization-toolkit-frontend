<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth, isAuthenticated } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let authenticated = false;

  onMount(() => {
    const unsubscribe = isAuthenticated.subscribe(value => {
      authenticated = value;
      if (!value) {
        goto('/welcome');
      }
    });
    return unsubscribe;
  });

  function handleLogout() {
    auth.logout();
    goto('/welcome');
  }
</script>

{#if authenticated}
  <div class="dashboard-container">
    <header class="dashboard-header">
      <h1>Dashboard</h1>
      <button class="logout-btn" on:click={handleLogout}>Logout</button>
    </header>

    <div class="dashboard-content">
      <div class="welcome-message">
        <h2>Welcome to Digitization Toolkit</h2>
        <p>Your dashboard is coming soon!</p>
      </div>

      <div class="feature-grid">
        <div class="feature-card">
          <h3>📁 Projects</h3>
          <p>Manage your digitization projects</p>
          <span class="coming-soon">Coming Soon</span>
        </div>

        <div class="feature-card">
          <h3>📄 Documents</h3>
          <p>View and organize captured documents</p>
          <span class="coming-soon">Coming Soon</span>
        </div>

        <div class="feature-card">
          <h3>📷 Cameras</h3>
          <p>Configure and manage your cameras</p>
          <span class="coming-soon">Coming Soon</span>
        </div>

        <div class="feature-card">
          <h3>⚙️ Settings</h3>
          <p>Customize your toolkit settings</p>
          <span class="coming-soon">Coming Soon</span>
        </div>
      </div>
    </div>
  </div>
{/if}

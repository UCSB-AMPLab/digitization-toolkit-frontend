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

<style>
  .dashboard-container {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1.5rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
  }

  .logout-btn {
    padding: 0.5rem 1.5rem;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 2px solid white;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .logout-btn:hover {
    background: white;
    color: #667eea;
  }

  .dashboard-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 3rem 2rem;
  }

  .welcome-message {
    text-align: center;
    margin-bottom: 3rem;
  }

  .welcome-message h2 {
    color: #1f2937;
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
  }

  .welcome-message p {
    color: #6b7280;
    font-size: 1.1rem;
    margin: 0;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .feature-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
    transition: transform 0.2s, box-shadow 0.2s;
    position: relative;
  }

  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  }

  .feature-card h3 {
    margin: 0 0 0.75rem 0;
    color: #1f2937;
    font-size: 1.3rem;
  }

  .feature-card p {
    margin: 0;
    color: #6b7280;
    line-height: 1.5;
  }

  .coming-soon {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.25rem 0.75rem;
    background: #fef3c7;
    color: #92400e;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }
</style>

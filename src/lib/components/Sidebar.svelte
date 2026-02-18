<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth';

  interface MenuItem {
    label: string;
    path: string;
    icon: string;
  }

  const menuItems: MenuItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Projects', path: '/dashboard/projects', icon: 'folder' },
    { label: 'Settings', path: '/dashboard/settings', icon: 'settings' }
  ];

  function isActive(path: string): boolean {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }

  function handleLogout() {
    auth.logout();
    goto('/welcome');
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <h2 class="sidebar-title">DTK</h2>
    <p class="sidebar-subtitle">Digitization Toolkit</p>
  </div>

  <nav class="sidebar-nav">
    {#each menuItems as item}
      <a 
        href={item.path} 
        class="sidebar-item"
        class:active={isActive(item.path)}
      >
        <span class="material-symbols-outlined sidebar-icon">{item.icon}</span>
        <span class="sidebar-label">{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <button class="sidebar-logout" on:click={handleLogout}>
      <span class="material-symbols-outlined sidebar-icon">logout</span>
      <span class="sidebar-label">Logout</span>
    </button>
    <p class="sidebar-version">v0.1.0-alpha</p>
  </div>
</aside>

<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';

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
</script>

{#if authenticated}
  <div class="dashboard-layout">
    <Sidebar />
    <main class="dashboard-main">
      <slot />
    </main>
  </div>
{/if}

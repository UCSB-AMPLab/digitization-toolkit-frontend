<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth';

  onMount(() => {
    const unsubscribe = isAuthenticated.subscribe(authenticated => {
      if (authenticated) {
        goto('/dashboard');
      } else {
        goto('/welcome');
      }
    });
    return unsubscribe;
  });
</script>

<div class="loading">
  <p>Loading...</p>
</div>

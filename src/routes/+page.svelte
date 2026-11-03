<script lang="ts">
  // Root route: it only redirects and renders nothing. A stored user goes to
  // `/dashboard`, whose layout validates the session cookie against
  // `/users/me`; no stored user goes to `/welcome`.
  //
  // Version: 0.1.0-beta

  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';

  if (browser) {
    if (authStore.getUser()) {
      goto('/dashboard');
    } else {
      goto('/welcome');
    }
  }
</script>
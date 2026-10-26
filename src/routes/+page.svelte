<script lang="ts">
  // Root route: it only redirects and renders nothing. A stored token together
  // with a stored user goes to `/dashboard`; anything else goes to `/welcome`,
  // and a token without a user (a half-open session) is cleared first.

  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';

  if (browser) {
    // Read the session once without keeping a subscription open.
    let token: string | null = null;
    let user: any = null;
    const unsub = authStore.subscribe(s => { token = s.token; user = s.user; });
    unsub();

    if (token && user) {
      goto('/dashboard');
    } else {
      if (token && !user) authStore.clearSession();
      goto('/welcome');
    }
  }
</script>
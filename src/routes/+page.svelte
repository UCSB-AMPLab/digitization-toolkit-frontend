<script lang="ts">
  // ============================================================================
  // PÁGINA RAÍZ: +page.svelte — Ruta: /
  //
  // Solo lógica de redirección, sin HTML visible.
  //
  // ¿Hay token guardado?
  //   Sí → /dashboard (sesión activa)
  //   No → /welcome  (splash screen)
  //
  // Para cambiar la página de entrada sin sesión, edita el goto('/welcome').
  // ============================================================================

  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';

  if (browser) {
    // Leer sesión actual sin crear suscripción permanente
    let token: string | null = null;
    let user: any = null;
    const unsub = authStore.subscribe(s => { token = s.token; user = s.user; });
    unsub();

    if (token && user) {
      // Sesión completa → ir directo al dashboard
      goto('/dashboard');
    } else {
      // Sin sesión (o sesión incompleta) → splash screen
      if (token && !user) authStore.clearSession();
      goto('/welcome');
    }
  }
</script>
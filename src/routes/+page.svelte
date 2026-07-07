<script lang="ts">
  // ============================================================================
  // PÁGINA RAÍZ: +page.svelte — Ruta: /
  //
  // Solo lógica de redirección, sin HTML visible.
  //
  // ¿Hay token guardado?
  //   Sí → /dashboard (sesión activa)
  //   No → /welcome (pantalla de bienvenida; el botón "Comenzar" ahí decide
  //        si va a /setup o /login según haya usuarios registrados)
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
      if (token && !user) authStore.clearSession();
      // Sin sesión: mostrar la pantalla de bienvenida
      goto('/welcome');
    }
  }
</script>
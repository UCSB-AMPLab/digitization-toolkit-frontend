<script lang="ts">
  // ============================================================================
  // PÁGINA RAÍZ: +page.svelte — Ruta: /
  //
  // Solo lógica de redirección, sin HTML visible.
  //
  // ¿Hay token guardado?
  //   Sí → /dashboard (sesión activa)
  //   No → verifica si hay usuarios registrados
  //        ├ Sin usuarios → /setup  (primera instalación)
  //        └ Con usuarios → /login  (flujo normal)
  // ============================================================================

  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';
  import { authApi } from '$lib/api';

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
      // Sin sesión: comprobar si es primera instalación (sin usuarios)
      authApi.setupStatus()
        .then(({ needs_setup }) => goto(needs_setup ? '/setup' : '/login'))
        .catch(() => goto('/login'));
    }
  }
</script>
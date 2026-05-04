<script lang="ts">
  // ============================================================================
  // PÁGINA RAÍZ: +page.svelte — Ruta: /
  //
  // Siempre muestra el splash screen con "Bienvenido" y botón "Comenzar".
  // NUNCA redirige automáticamente — el usuario siempre decide cuándo empezar.
  //
  // El botón "Comenzar" es inteligente:
  //   - Si hay sesión activa → va directo al /dashboard
  //   - Si no hay sesión     → va a /login
  //
  // Esto garantiza el flujo:
  //   / (splash) → click "Comenzar" → /login → login exitoso → /dashboard
  // ============================================================================

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore, getRoleDashboardPath } from '$lib/stores/auth';
  import favicon from '$lib/assets/favicon.svg';

  // El splash siempre empieza visible — nunca hay redirección automática
  let showSplash = $state(true);

  // Estado de la sesión — se lee al montar para saber a dónde va el botón
  let hasSession  = $state(false);

  onMount(() => {
    // Leer sesión actual sin suscripción permanente
    const unsub = authStore.subscribe(s => {
      hasSession = !!(s.token && s.user);
    });
    unsub();

    // Si hay token pero sin user (sesión corrupta), limpiar silenciosamente
    let currentToken: string | null = null;
    let currentUser: any = null;
    const unsub2 = authStore.subscribe(s => {
      currentToken = s.token;
      currentUser  = s.user;
    });
    unsub2();

    if (currentToken && !currentUser) {
      authStore.clearSession();
      hasSession = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Botón "Comenzar"
  // Con sesión activa → /dashboard (salta el login)
  // Sin sesión        → /login
  // ---------------------------------------------------------------------------
  function handleComenzar() {
    if (hasSession) {
      goto('/login');
    } else {
      goto('/login');
    }
  }
</script>

{#if showSplash}
  <div class="splash-container">

    <div class="splash-header">
      <div class="logo-circle">
        <img src={favicon} alt="Logo Sistema de Digitalización" class="logo-icon" />
      </div>
      <p class="system-name">Sistema de Digitalización</p>
    </div>

    <h1 class="welcome-title">Bienvenido</h1>

    <button class="btn-comenzar" onclick={handleComenzar}>
      Comenzar
    </button>

  </div>
{/if}

<style>
  .splash-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: var(--color-bg);
    padding: 2rem;
  }

  .splash-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 80px;
  }

  .logo-circle {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(90, 140, 98, 0.4);
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    filter: brightness(0) invert(1);
  }

  .system-name {
    font-family: var(--font-family);
    font-size: var(--text-lead);
    font-weight: var(--fw-semibold);
    color: var(--color-primary);
    margin: 0;
  }

  .welcome-title {
    font-family: var(--font-family);
    font-size: var(--text-h2);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 24px 0;
    text-align: center;
  }

  .btn-comenzar {
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    background-color: transparent;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 48px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn-comenzar:hover  { background-color: rgba(150, 177, 240, 0.1); }
  .btn-comenzar:active { transform: scale(0.97); }
</style>
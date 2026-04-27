<script lang="ts">
  // ============================================================================
  // PÁGINA RAÍZ: +page.svelte
  // Ruta: / (raíz de la aplicación)
  //
  // Esta página tiene DOS funciones:
  //   1. Si el usuario YA tiene sesión activa → redirige directo al dashboard
  //   2. Si NO tiene sesión → muestra la pantalla de bienvenida (splash screen)
  //      con el logo, el mensaje "Bienvenido" y el botón "Comenzar"
  //
  // El botón "Comenzar" navega a /login donde el usuario ingresa sus credenciales.
  // ============================================================================

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore, getRoleDashboardPath } from '$lib/stores/auth';
  import favicon from '$lib/assets/favicon.svg';

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Controla si se muestra el splash o si todavía está verificando la sesión.
  // Empieza en false para evitar flash de contenido antes de verificar el token.
  let showSplash = $state(true);

  // ---------------------------------------------------------------------------
  // AL MONTAR EL COMPONENTE
  // Verifica si hay sesión guardada y redirige al dashboard correspondiente.
  // ---------------------------------------------------------------------------
  
  onMount(() => {
  let currentToken: string | null = null;
  let currentUser: any = null;

  const unsub = authStore.subscribe((s) => {
    currentToken = s.token;
    currentUser = s.user;
  });
  unsub();

  if (currentToken && currentUser) {
    // ── Sesión completa → ir al dashboard ─────────────────────────────────
    goto(getRoleDashboardPath(currentUser.role));

  } else if (currentToken && !currentUser) {
    // ── Token guardado pero sin datos del usuario (ej: recarga de página) ──
    // Limpia el token silenciosamente y QUEDA en el splash.
    // NO hacer goto('/login') aquí — el usuario decide cuándo continuar.
    authStore.clearSession();
  }

  // Sin token → showSplash ya es true desde el inicio → no hacer nada
});

// ── Hay token guardado ─────────────────────────────────────────────────
      // Nota: el token existe pero no se verificó con el backend todavía.
      // El guard del dashboard (+layout.svelte) hará esa verificación.
      // Por ahora, intenta navegar al dashboard del usuario.
            // Si tenemos datos del usuario en el store, ir a su dashboard
      // (esto pasa si el usuario recargó la página pero la sesión sigue en memoria)
      // Si no, ir a /login para que vuelva a autenticarse de forma segura
      // ── PARA CAMBIAR EL COMPORTAMIENTO POST-RELOAD, modifica este bloque ──

  // ---------------------------------------------------------------------------
  // ACCIÓN: Botón "Comenzar"
  // Navega a la página de login.
  // Para cambiar el destino (ej: a un onboarding), cambia la ruta aquí.
  // ---------------------------------------------------------------------------
  function handleComenzar() {
    goto('/login');
  }
</script>

<!-- ============================================================
     PANTALLA DE BIENVENIDA (SPLASH SCREEN)
     Solo se muestra si showSplash = true (sin sesión activa)
     ============================================================ -->
{#if showSplash}
  <div class="splash-container">

    <!-- ── Logo + nombre del sistema ── -->
    <div class="splash-header">
      <!-- Ícono circular con el logo (asterisco/copo) -->
      <div class="logo-circle">
        <img src={favicon} alt="Logo Sistema de Digitalización" class="logo-icon" />
      </div>
      <!-- Nombre del sistema — para cambiar el nombre, edita este texto -->
      <p class="system-name">Sistema de Digitalización</p>
    </div>

    <!-- ── Mensaje principal ── -->
    <!-- Para cambiar el mensaje de bienvenida, edita el texto aquí -->
    <h1 class="welcome-title">Bienvenido</h1>

    <!-- ── Botón de entrada ── -->
    <!-- Para cambiar a dónde va el botón, modifica handleComenzar() arriba -->
    <button class="btn-comenzar" onclick={handleComenzar}>
      Comenzar
    </button>

  </div>
{/if}

<style>
  /* ── Contenedor principal: ocupa toda la pantalla ── */
  .splash-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: var(--color-bg);
    /* Espaciado interno para tablets pequeñas */
    padding: 2rem;
    gap: 0;
  }

  /* ── Grupo logo + nombre, posicionado más arriba que el centro ── */
  .splash-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    /* Empuja el logo hacia arriba del centro visual */
    margin-bottom: 80px;
  }

  /* ── Círculo verde que contiene el ícono ── */
  .logo-circle {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    /* Sombra suave para darle profundidad */
    box-shadow: 0 4px 16px rgba(90, 140, 98, 0.4);
  }

  /* ── Ícono dentro del círculo ── */
  .logo-icon {
    width: 28px;
    height: 28px;
    /* Invierte el color para que se vea blanco sobre fondo verde */
    filter: brightness(0) invert(1);
  }

  /* ── Texto del nombre del sistema ── */
  .system-name {
    font-family: var(--font-family);
    font-size: var(--text-lead);        /* 21px */
    font-weight: var(--fw-semibold);    /* 600 */
    color: var(--color-primary);        /* verde primario */
    margin: 0;
  }

  /* ── Título "Bienvenido" ── */
  .welcome-title {
    font-family: var(--font-family);
    font-size: var(--text-h2);          /* 28px */
    font-weight: var(--fw-bold);        /* 700 */
    color: var(--color-light);          /* blanco cálido */
    margin: 0 0 24px 0;
    text-align: center;
  }

  /* ── Botón "Comenzar" ── */
  /* Sigue el estilo ghost/outlined del design system (borde secundario azul) */
  .btn-comenzar {
    font-family: var(--font-family);
    font-size: var(--text-base);        /* 16px */
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);      /* azul secundario */
    background-color: transparent;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 48px;
    min-height: var(--touch-target-min); /* mínimo 44px para touch */
    cursor: pointer;
    transition: background-color var(--transition-base),
                color var(--transition-base);
  }

  .btn-comenzar:hover {
    background-color: rgba(150, 177, 240, 0.1);
  }

  .btn-comenzar:active {
    transform: scale(0.97);
  }
</style>

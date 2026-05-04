<script lang="ts">
  // ============================================================================
  // PÁGINA RAÍZ: +page.svelte
  // Ruta: / (raíz de la aplicación)
  //
  // Siempre muestra el splash screen con logo, "Bienvenido" y botón "Comenzar".
  // No tiene lógica de redirección automática — el usuario siempre ve el splash.
  //
  // El botón "Comenzar" navega a /login.
  // El login se encarga de redirigir al /dashboard si ya hay sesión activa.
  //
  // Flujo completo:
  //   / → click "Comenzar" → /login → login exitoso → /dashboard
  //
  // Para cambiar el destino del botón "Comenzar", edita el goto aquí abajo.
  // Para cambiar el texto del botón, edita el HTML más abajo.
  // Para cambiar el nombre del sistema, edita el texto en el HTML.
  // ============================================================================

  import { goto } from '$app/navigation';
  import favicon from '$lib/assets/favicon.svg';

  // ---------------------------------------------------------------------------
  // ACCIÓN: Botón "Comenzar"
  // Siempre va a /login.
  // El login detecta si ya hay sesión activa y redirige al dashboard sin
  // mostrar el formulario.
  // Para cambiar el destino, modifica la ruta aquí:
  // ---------------------------------------------------------------------------
  function handleComenzar() {
    goto('/login');
  }
</script>

<!-- ============================================================
     SPLASH SCREEN
     Visible siempre que el usuario esté en la raíz /
     ============================================================ -->
<div class="splash">

  <!-- ── Logo + nombre del sistema ── -->
  <div class="header">
    <!-- Círculo verde con el ícono del sistema -->
    <div class="logo">
      <img src={favicon} alt="Logo Sistema de Digitalización" class="logo-img" />
    </div>
    <!-- Nombre del sistema — para cambiarlo, edita este texto -->
    <p class="name">Sistema de Digitalización</p>
  </div>

  <!-- Mensaje de bienvenida — para cambiarlo, edita este texto -->
  <h1 class="title">Bienvenido</h1>

  <!-- Botón de entrada — llama a handleComenzar() definida arriba -->
  <button class="btn" onclick={handleComenzar}>
    Comenzar
  </button>

</div>

<style>
  /* Pantalla completa centrada con fondo oscuro del design system */
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: var(--color-bg);
  }

  /* Grupo logo + nombre, desplazado hacia arriba del centro visual */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 80px;
  }

  /* Círculo verde que contiene el ícono */
  .logo {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(90, 140, 98, 0.4);
  }

  /* Ícono SVG dentro del círculo — invertido a blanco */
  .logo-img {
    width: 28px;
    height: 28px;
    filter: brightness(0) invert(1);
  }

  /* Nombre del sistema en verde primario */
  .name {
    font-family: var(--font-family);
    font-size: var(--text-lead);
    font-weight: var(--fw-semibold);
    color: var(--color-primary);
    margin: 0;
  }

  /* Título "Bienvenido" */
  .title {
    font-family: var(--font-family);
    font-size: var(--text-h2);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 24px;
    text-align: center;
  }

  /* Botón "Comenzar" — estilo ghost con borde azul secundario */
  .btn {
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    background: transparent;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 48px;
    min-height: var(--touch-target-min);  /* mínimo 44px para touch */
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn:hover  { background-color: rgba(150, 177, 240, 0.1); }
  .btn:active { transform: scale(0.97); }
</style>

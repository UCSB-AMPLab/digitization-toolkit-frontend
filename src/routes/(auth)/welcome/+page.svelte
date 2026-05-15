<script lang="ts">
  // ============================================================================
  // PÁGINA: Welcome / Splash Screen
  // Ruta: /welcome
  //
  // Pantalla de bienvenida con logo y botón "Comenzar".
  // El botón lleva a /login donde el usuario ingresa sus credenciales.
  // Para cambiar el destino del botón, edita el goto en handleComenzar().
  // ============================================================================

  import { goto } from '$app/navigation';
  import favicon from '$lib/assets/favicon.svg';

  // Botón "Comenzar" → siempre va a /login
  function handleComenzar() {
    goto('/login');
  }
</script>

<div class="splash">

  <!-- Logo + nombre del sistema -->
  <div class="header">
    <!-- Círculo verde con el ícono del sistema -->
    <div class="logo">
      <img src={favicon} alt="Logo Sistema de Digitalización" class="logo-img" />
    </div>
    <!-- Para cambiar el nombre del sistema, edita este texto -->
    <p class="name">Preservia - DigiTool</p>
  </div>

  <!-- Título de bienvenida -->
  <h1 class="title">Bienvenido/a</h1>

  <!-- Botón de entrada — llama a handleComenzar() -->
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
    width: 56px; height: 56px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(90,140,98,0.4);
  }

  /* Ícono SVG invertido a blanco sobre fondo verde */
  .logo-img {
    width: 28px; height: 28px;
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

  /* Botón ghost con borde azul secundario */
  .btn {
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    background: transparent;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 48px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn:hover  { background-color: rgba(150,177,240,0.1); }
  .btn:active { transform: scale(0.97); }
</style>

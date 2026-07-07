<script lang="ts">
  // ============================================================================
  // PÁGINA: Welcome / Splash Screen
  // Ruta: /welcome
  //
  // Pantalla de bienvenida con logo y botón "Comenzar".
  // El botón consulta si es primera instalación (sin usuarios registrados):
  //   Sí → /setup  (crear cuenta de administrador)
  //   No → /login  (flujo normal)
  // ============================================================================

  import { goto } from '$app/navigation';
  import { authApi } from '$lib/api';
  import logo from '$lib/assets/captua-logo-descrp-light-esp.svg';

  let isChecking = $state(false);

  // Botón "Comenzar" → decide entre /setup y /login según haya usuarios
  async function handleComenzar() {
    if (isChecking) return;
    isChecking = true;
    try {
      const { needs_setup } = await authApi.setupStatus();
      goto(needs_setup ? '/setup' : '/login');
    } catch {
      goto('/login');
    } finally {
      isChecking = false;
    }
  }
</script>

<div class="splash">

  <!-- Logo + nombre del sistema -->
  <div class="header">
    	<div class="card-logo-area">
			<img src={logo} alt="Captua" class="brand-logo-xl" />
		</div>

  </div>

  <!-- Título de bienvenida -->
  <h1 class="title">Bienvenido/a</h1>

  <!-- Botón de entrada — llama a handleComenzar() -->
  <button class="btn" onclick={handleComenzar} disabled={isChecking} aria-busy={isChecking}>
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

  .btn:hover:not(:disabled)  { background-color: rgba(150,177,240,0.1); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

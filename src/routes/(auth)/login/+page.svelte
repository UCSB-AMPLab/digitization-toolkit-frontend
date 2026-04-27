<script lang="ts">
  // ============================================================================
  // PÁGINA: Login
  // Ruta: /login → src/routes/(auth)/login/+page.svelte
  //
  // Estados que maneja esta página:
  //   - Default:  formulario vacío, listo para ingresar credenciales
  //   - Loading:  spinner + overlay mientras espera respuesta del backend
  //   - Error:    muestra alerta roja "Usuario o contraseña incorrectos"
  //
  // Funcionalidades:
  //   - Mostrar/ocultar contraseña (ícono ojo)
  //   - Checkbox "Recuérdame" (extiende persistencia del token)
  //   - Selector de idioma ES | EN | PT (actualmente visual, listo para i18n)
  //   - Indicador de conexión al backend (healthcheck)
  //   - Redirección al dashboard según rol tras login exitoso
  // ============================================================================

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authApi, healthApi } from '$lib/api';
  import { authStore, getRoleDashboardPath, type UserRole } from '$lib/stores/auth';
  import favicon from '$lib/assets/favicon.svg';

  // ---------------------------------------------------------------------------
  // ESTADO DEL FORMULARIO
  // ---------------------------------------------------------------------------

  let username = $state('');         // valor del campo Usuario
  let password = $state('');         // valor del campo Contraseña
  let rememberMe = $state(false);    // checkbox "Recuérdame"
  let showPassword = $state(false);  // toggle mostrar/ocultar contraseña

  // ---------------------------------------------------------------------------
  // ESTADO DE LA UI
  // ---------------------------------------------------------------------------

  let isLoading = $state(false);       // true mientras se procesa el login
  let errorMessage = $state('');       // mensaje de error (vacío = sin error)
  let isConnected = $state(false);     // true si el backend responde al healthcheck
  let currentLang = $state('ES');      // idioma activo en el selector

  // Idiomas disponibles en el selector
  // Para agregar idiomas, añadirlos a este array y manejar la traducción
  const languages = ['ES', 'EN', 'PT'];

  // ---------------------------------------------------------------------------
  // AL MONTAR: verifica conexión con el backend
  // ---------------------------------------------------------------------------
  onMount(async () => {
    // Si ya hay sesión activa, redirigir al dashboard
    if (authStore.isAuthenticated()) {
      goto('/');  // la página raíz se encarga de redirigir al dashboard correcto
      return;
    }

    // Verificar que el backend esté disponible
    // Esto muestra el punto verde/rojo de "Conectado" en el footer del card
    await checkConnection();
  });

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Verifica si el backend está respondiendo
  // Actualiza el indicador "Conectado / Sin conexión" en el footer del card.
  // Para cambiar el endpoint de healthcheck, modifica healthApi.check() en api.ts
  // ---------------------------------------------------------------------------
  async function checkConnection() {
    try {
      await healthApi.check();
      isConnected = true;
    } catch {
      // Si el backend no responde, el punto se pone rojo
      isConnected = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Maneja el submit del formulario de login
  // Flujo:
  //   1. Valida campos no vacíos
  //   2. Activa loading
  //   3. Llama al backend (authApi.login)
  //   4. Si OK → obtiene datos del usuario → redirige al dashboard
  //   5. Si error → muestra mensaje de error
  // ---------------------------------------------------------------------------
  async function handleLogin() {
    // Limpiar error anterior antes de cada intento
    errorMessage = '';

    // ── Validación básica de campos ─────────────────────────────────────────
    if (!username.trim() || !password.trim()) {
      errorMessage = 'Por favor completa todos los campos';
      return;
    }

    // ── Activar estado de carga ─────────────────────────────────────────────
    isLoading = true;

    try {
      // ── Paso 1: Login → obtiene el token JWT ───────────────────────────────
      const authResponse = await authApi.login({
        username: username.trim(),
        password: password,
      });

      // ── Paso 2: Obtener datos del usuario (incluyendo rol) ─────────────────
      // El endpoint /users/me devuelve los datos del usuario autenticado.
      // Si el backend usa otro endpoint, cámbialo en api.ts (usersApi.getMe)
      // NOTA: Si el backend no tiene este endpoint aún, el login fallará aquí.
      //       En ese caso, comenta el bloque de getUserData y usa un rol por defecto.
      const userData = await getUserData(authResponse.access_token);

      // ── Paso 3: Guardar sesión en el store global ──────────────────────────
      authStore.setSession(authResponse.access_token, userData);

      // ── Paso 4: Redirigir al dashboard según el rol ────────────────────────
      const dashboardPath = getRoleDashboardPath(userData.role);
      goto(dashboardPath);

    } catch (error) {
      // ── Manejo de errores ──────────────────────────────────────────────────
      // El error puede ser de red, credenciales incorrectas, etc.
      const message = error instanceof Error ? error.message : String(error);

      // Mensaje genérico para no revelar si el usuario existe o no
      // Para mensajes más específicos, evalúa el código HTTP del error
      errorMessage = 'Usuario o contraseña incorrectos';

      // Log en consola solo en desarrollo (el error real puede tener info útil)
      console.error('[Login] Error:', message);

    } finally {
      // ── Siempre desactivar loading al terminar (éxito o error) ─────────────
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Obtiene los datos del usuario desde el backend
  // Llama al endpoint de perfil del usuario autenticado.
  //
  // ⚠️ IMPORTANTE: Este endpoint debe devolver el campo "role" con uno de:
  //    'admin' | 'operator' | 'reviewer'
  //    Si el backend usa otros nombres de rol, actualizar en auth.ts → UserRole
  // ---------------------------------------------------------------------------
  async function getUserData(token: string) {
    const response = await fetch(`${getApiBase()}/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error('No se pudo obtener los datos del usuario');
    }

    return response.json();
  }

  // Helper para obtener la base URL de la API (igual que en api.ts)
  function getApiBase(): string {
    return import.meta.env.PUBLIC_API_BASE || 'http://localhost:8000';
  }

  // ---------------------------------------------------------------------------
  // ACCIÓN: Cambiar idioma
  // Actualmente solo cambia el estado visual.
  // Para conectar con una librería de i18n (ej: paraglide, i18next),
  // implementar la lógica en esta función.
  // ---------------------------------------------------------------------------
  function setLanguage(lang: string) {
    currentLang = lang;
    // TODO: implementar cambio de idioma real cuando se agregue i18n
    // ejemplo: locale.set(lang.toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // ACCIÓN: Toggle mostrar/ocultar contraseña
  // ---------------------------------------------------------------------------
  function togglePassword() {
    showPassword = !showPassword;
  }

  // ---------------------------------------------------------------------------
  // ACCIÓN: "¿Olvidaste tu contraseña?" — placeholder
  // Para implementar recuperación de contraseña, redirige a la ruta correspondiente
  // ---------------------------------------------------------------------------
  function handleForgotPassword() {
    // TODO: implementar flujo de recuperación de contraseña
    // goto('/forgot-password');
    console.log('[Login] Forgot password - no implementado aún');
  }

  // ---------------------------------------------------------------------------
  // TECLADO: permitir submit con Enter
  // ---------------------------------------------------------------------------
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !isLoading) {
      handleLogin();
    }
  }
</script>

<!-- ============================================================
     CONTENEDOR PRINCIPAL: ocupa toda la pantalla
     ============================================================ -->
<div class="login-wrapper" onkeydown={handleKeydown} role="main">

  <!-- ── CARD DE LOGIN ─────────────────────────────────────────── -->
  <div class="login-card" class:is-loading={isLoading}>

    <!-- ── Logo (parte superior del card, sobresale hacia arriba) ── -->
    <div class="card-logo-area">
      <div class="logo-circle">
        <img src={favicon} alt="Logo" class="logo-icon" />
      </div>
      <!-- Nombre del sistema — para cambiar el nombre, edita este texto -->
      <p class="system-name">Sistema de Digitalización</p>
    </div>

    <!-- ── Espaciado interno del formulario ── -->
    <div class="form-area">

      <!-- CAMPO: Usuario ── -->
      <div class="field-group">
        <label class="field-label" for="username">Usuario</label>
        <div class="input-wrapper">
          <!-- Ícono de persona a la izquierda del input -->
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <input
            id="username"
            type="text"
            class="input"
            class:input-error={errorMessage}
            placeholder="Ingresa tu usuario"
            bind:value={username}
            disabled={isLoading}
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
          />
        </div>
      </div>

      <!-- CAMPO: Contraseña ── -->
      <div class="field-group">
        <label class="field-label" for="password">Contraseña</label>
        <div class="input-wrapper">
          <!-- Ícono de candado a la izquierda -->
          <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <!-- El type cambia entre "password" y "text" según showPassword -->
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            class="input input-with-action"
            class:input-error={errorMessage}
            placeholder="Ingresa tu contraseña"
            bind:value={password}
            disabled={isLoading}
            autocomplete="current-password"
          />
          <!-- Botón ojo para mostrar/ocultar contraseña -->
          <button
            type="button"
            class="input-action-btn"
            onclick={togglePassword}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            tabindex="0"
          >
            {#if showPassword}
              <!-- Ojo tachado (contraseña visible) -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            {:else}
              <!-- Ojo abierto (contraseña oculta) -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <!-- FILA: Recuérdame + ¿Olvidaste tu contraseña? ── -->
      <div class="row-options">
        <label class="remember-label">
          <input
            type="checkbox"
            class="checkbox"
            bind:checked={rememberMe}
            disabled={isLoading}
          />
          <span>Recuérdame</span>
        </label>
        <!-- Para implementar recuperación de contraseña, edita handleForgotPassword() -->
        <button
          type="button"
          class="forgot-link"
          onclick={handleForgotPassword}
          disabled={isLoading}
        >
          ¿Olvidaste tu contraseña?
        </button>
      </div>

      <!-- ALERTA DE ERROR: solo se muestra si hay errorMessage ── -->
      {#if errorMessage}
        <div class="alert alert-error" role="alert" aria-live="polite">
          <!-- Ícono de prohibido -->
          <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <!-- BOTÓN: Iniciar sesión ── -->
      <button
        type="button"
        class="btn-login"
        onclick={handleLogin}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {#if isLoading}
          <!-- Texto en mayúsculas durante la carga (como en el diseño) -->
          INICIAR SESIÓN
        {:else}
          Iniciar sesión
        {/if}
      </button>

    </div><!-- /form-area -->

    <!-- ── FOOTER DEL CARD: estado de conexión + selector de idioma ── -->
    <div class="card-footer">
      <!-- Indicador de conexión al backend -->
      <div class="connection-status">
        <!-- El punto cambia de color según isConnected -->
        <span
          class="status-dot"
          class:success={isConnected}
          class:error={!isConnected}
        ></span>
        <span class="status-text">
          {isConnected ? 'Conectado' : 'Sin conexión'}
        </span>
      </div>

      <!-- Selector de idioma -->
      <!-- Para conectar con i18n real, edita la función setLanguage() arriba -->
      <div class="lang-selector">
        <!-- Ícono de globo -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="globe-icon">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        {#each languages as lang, i}
          <button
            type="button"
            class="lang-btn"
            class:active={currentLang === lang}
            onclick={() => setLanguage(lang)}
          >
            {lang}
          </button>
          <!-- Separador | entre idiomas (excepto el último) -->
          {#if i < languages.length - 1}
            <span class="lang-sep">|</span>
          {/if}
        {/each}
      </div>
    </div>

    <!-- ── OVERLAY DE CARGA: se superpone sobre el card durante el login ── -->
    <!-- Solo visible cuando isLoading = true -->
    {#if isLoading}
      <div class="loading-overlay" aria-label="Cargando" role="status">
        <!-- Spinner animado -->
        <div class="spinner"></div>
        <p class="loading-text">Cargando</p>
      </div>
    {/if}

  </div><!-- /login-card -->

</div><!-- /login-wrapper -->

<style>
  /* ── Wrapper: pantalla completa, fondo oscuro ── */
  .login-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: var(--color-bg);
    padding: 24px 16px;
  }

  /* ── Card principal ── */
  .login-card {
    position: relative;          /* para el overlay de carga */
    width: 100%;
    max-width: 370px;
    background-color: var(--color-surface);
    border-radius: var(--radius-xl);   /* 16px, bordes muy redondeados */
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    /* Transición suave cuando se activa el loading */
    transition: opacity var(--transition-base);
  }

  /* Estado de carga: el card se opaca ligeramente */
  .login-card.is-loading .form-area {
    pointer-events: none;
    opacity: 0.5;
  }

  /* ── Área del logo (parte superior del card) ── */
  .card-logo-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 32px 24px 0;
  }

  /* ── Círculo verde con el logo ── */
  .logo-circle {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(90, 140, 98, 0.35);
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    filter: brightness(0) invert(1);
  }

  .system-name {
    font-size: var(--text-lead);
    font-weight: var(--fw-semibold);
    color: var(--color-primary);
    margin: 0;
    text-align: center;
  }

  /* ── Área del formulario ── */
  .form-area {
    padding: 28px 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ── Grupo de campo (label + input) ── */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: var(--text-sm);         /* 12px */
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    /* No uppercase aquí — el diseño muestra "Usuario", no "USUARIO" */
  }

  /* ── Input con ícono ── */
  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  /* Ícono a la izquierda del input */
  .input-icon {
    position: absolute;
    left: 12px;
    width: 18px;
    height: 18px;
    color: var(--color-light-grey);
    pointer-events: none;   /* no interfiere con clicks */
    flex-shrink: 0;
  }

  /* Input base (hereda de app.css pero con ajustes específicos) */
  .input-wrapper .input {
    padding-left: 40px;     /* espacio para el ícono izquierdo */
    background-color: var(--color-surface-alt);
    border-color: transparent;
    font-size: var(--text-base);
    transition: border-color var(--transition-base),
                background-color var(--transition-base);
  }

  .input-wrapper .input:focus {
    border-color: var(--color-primary);
    background-color: rgba(36, 44, 35, 0.8);
    outline: none;
  }

  /* Input con botón de acción a la derecha (contraseña) */
  .input-with-action {
    padding-right: 44px;
  }

  /* Botón ojo (mostrar/ocultar contraseña) */
  .input-action-btn {
    position: absolute;
    right: 10px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-light-grey);
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast);
  }

  .input-action-btn:hover {
    color: var(--color-light);
  }

  .input-action-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Estado error en inputs */
  .input-error {
    border-color: var(--color-error) !important;
  }

  /* ── Fila opciones: Recuérdame + ¿Olvidaste contraseña? ── */
  .row-options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .remember-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    user-select: none;
  }

  .remember-label .checkbox {
    cursor: pointer;
  }

  .forgot-link {
    background: none;
    border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-secondary);   /* azul secundario */
    cursor: pointer;
    padding: 0;
    transition: opacity var(--transition-fast);
    white-space: nowrap;
  }

  .forgot-link:hover {
    opacity: 0.8;
  }

  /* ── Alerta de error ── */
  .alert {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
  }

  .alert-error {
    background-color: var(--color-error-bg);
    border: 1px solid var(--color-error);
    color: var(--color-error);
  }

  .alert-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  /* ── Botón Iniciar sesión ── */
  .btn-login {
    width: 100%;
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    background-color: var(--color-primary);
    border: none;
    border-radius: var(--radius-md);
    padding: 14px;
    min-height: var(--touch-target-lg);  /* 52px — bien grande para tablet */
    cursor: pointer;
    transition: background-color var(--transition-base),
                opacity var(--transition-base);
    letter-spacing: 0.01em;
  }

  .btn-login:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .btn-login:active:not(:disabled) {
    transform: scale(0.98);
  }

  .btn-login:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    letter-spacing: 0.08em;  /* el texto en mayúsculas tiene más tracking */
  }

  /* ── Footer del card ── */
  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background-color: rgba(255,255,255,0.03);
    border-top: 1px solid var(--border-color);
    min-height: 44px;
  }

  /* Indicador de conexión */
  .connection-status {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.success { background-color: var(--color-success); }
  .status-dot.error   { background-color: var(--color-error); }

  .status-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
  }

  /* Selector de idioma */
  .lang-selector {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .globe-icon {
    width: 16px;
    height: 16px;
    color: var(--color-light-grey);
    margin-right: 4px;
  }

  .lang-btn {
    background: none;
    border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    padding: 2px 4px;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--transition-fast);
    border-radius: var(--radius-sm);
  }

  .lang-btn.active {
    color: var(--color-light);
    font-weight: var(--fw-bold);
  }

  .lang-btn:hover {
    color: var(--color-light);
  }

  .lang-sep {
    font-size: var(--text-sm);
    color: var(--border-color);
    user-select: none;
  }

  /* ── Overlay de carga ── */
  .loading-overlay {
    position: absolute;
    inset: 0;                         /* cubre todo el card */
    background-color: rgba(19, 17, 16, 0.6);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    border-radius: var(--radius-xl);
    z-index: 10;
    backdrop-filter: blur(2px);
  }

  /* Spinner giratorio */
  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-light);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    font-size: var(--text-base);
    font-weight: var(--fw-medium);
    color: var(--color-light);
    margin: 0;
  }

  /* Animación del spinner */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>

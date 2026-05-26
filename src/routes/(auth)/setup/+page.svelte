<script lang="ts">
  // ============================================================================
  // PÁGINA: Setup — Primera instalación
  // Ruta: /setup → src/routes/(auth)/setup/+page.svelte
  //
  // Solo se muestra cuando no existe ningún usuario en el sistema.
  // El formulario crea el primer administrador usando POST /auth/register,
  // que en ausencia de usuarios no requiere autenticación.
  //
  // Tras crear la cuenta, redirige a /login.
  // Si ya existen usuarios (instalación no nueva), redirige a /login.
  // ============================================================================

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authApi } from '$lib/api';
  import favicon from '$lib/assets/favicon.svg';

  // ---------------------------------------------------------------------------
  // ESTADO DEL FORMULARIO
  // ---------------------------------------------------------------------------
  let username = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  // ---------------------------------------------------------------------------
  // ESTADO DE LA UI
  // ---------------------------------------------------------------------------
  let isLoading = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');

  // ---------------------------------------------------------------------------
  // AL MONTAR: verificar que realmente sea primera instalación
  // ---------------------------------------------------------------------------
  onMount(async () => {
    try {
      const { needs_setup } = await authApi.setupStatus();
      if (!needs_setup) {
        goto('/login');
      }
    } catch {
      goto('/login');
    }
  });

  // ---------------------------------------------------------------------------
  // VALIDACIÓN
  // ---------------------------------------------------------------------------
  function validate(): string {
    if (!username.trim()) return 'El nombre de usuario es obligatorio';
    if (username.trim().length < 3) return 'El usuario debe tener al menos 3 caracteres';
    if (!email.trim()) return 'El correo electrónico es obligatorio';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Formato de correo no válido';
    if (!password) return 'La contraseña es obligatoria';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (password !== confirmPassword) return 'Las contraseñas no coinciden';
    return '';
  }

  // ---------------------------------------------------------------------------
  // SUBMIT
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    errorMessage = '';
    successMessage = '';

    const validationError = validate();
    if (validationError) {
      errorMessage = validationError;
      return;
    }

    isLoading = true;
    try {
      await authApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      successMessage = '¡Cuenta creada! Redirigiendo al inicio de sesión…';
      setTimeout(() => goto('/login'), 1500);
    } catch (err: any) {
      const detail = err?.message || '';
      if (detail.includes('409') || detail.toLowerCase().includes('already')) {
        errorMessage = 'Ese usuario o correo ya existe';
      } else {
        errorMessage = 'No se pudo crear la cuenta. Verifica la conexión al servidor.';
      }
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !isLoading) {
      handleSubmit();
    }
  }
</script>

<!-- ============================================================
     CONTENEDOR PRINCIPAL
     ============================================================ -->
<div
  class="setup-wrapper"
  onkeydown={handleKeydown}
  role="main"
>

  <div class="setup-card" class:is-loading={isLoading}>

    <!-- ── LOADING OVERLAY ─────────────────────────────────────── -->
    {#if isLoading}
      <div class="setup-loading-overlay" aria-hidden="true">
        <div class="setup-spinner"></div>
      </div>
    {/if}

    <!-- ── LOGO + TÍTULOS ──────────────────────────────────────── -->
    <div class="setup-logo-area">
      <div class="setup-logo-circle">
        <img src={favicon} alt="Logo" class="setup-logo-icon" />
      </div>
      <p class="setup-system-name">Preservia</p>
      <p class="setup-title">Primera instalación</p>
      <p class="setup-subtitle">
        Crea la cuenta de administrador para comenzar a usar el sistema.
      </p>
    </div>

    <!-- ── FORMULARIO ─────────────────────────────────────────── -->
    <div class="setup-form-area">

      <!-- CAMPO: Usuario -->
      <div class="setup-field-group">
        <label class="setup-field-label" for="su-username">Usuario</label>
        <div class="setup-input-wrapper">
          <svg class="setup-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <input
            id="su-username"
            type="text"
            class="setup-input"
            class:input-error={errorMessage}
            placeholder="ej. admin"
            bind:value={username}
            disabled={isLoading}
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
          />
        </div>
      </div>

      <!-- CAMPO: Correo -->
      <div class="setup-field-group">
        <label class="setup-field-label" for="su-email">Correo electrónico</label>
        <div class="setup-input-wrapper">
          <svg class="setup-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <input
            id="su-email"
            type="email"
            class="setup-input"
            class:input-error={errorMessage}
            placeholder="admin@ejemplo.com"
            bind:value={email}
            disabled={isLoading}
            autocomplete="email"
          />
        </div>
      </div>

      <!-- CAMPO: Contraseña -->
      <div class="setup-field-group">
        <label class="setup-field-label" for="su-password">Contraseña</label>
        <div class="setup-input-wrapper">
          <svg class="setup-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <input
            id="su-password"
            type={showPassword ? 'text' : 'password'}
            class="setup-input setup-input-with-action"
            class:input-error={errorMessage}
            placeholder="Mínimo 8 caracteres"
            bind:value={password}
            disabled={isLoading}
            autocomplete="new-password"
          />
          <button
            type="button"
            class="setup-input-action-btn"
            onclick={() => (showPassword = !showPassword)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {#if showPassword}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            {/if}
          </button>
        </div>
        <span class="setup-hint">Mínimo 8 caracteres</span>
      </div>

      <!-- CAMPO: Confirmar contraseña -->
      <div class="setup-field-group">
        <label class="setup-field-label" for="su-confirm">Confirmar contraseña</label>
        <div class="setup-input-wrapper">
          <svg class="setup-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <input
            id="su-confirm"
            type={showConfirmPassword ? 'text' : 'password'}
            class="setup-input setup-input-with-action"
            class:input-error={errorMessage}
            placeholder="Repite la contraseña"
            bind:value={confirmPassword}
            disabled={isLoading}
            autocomplete="new-password"
          />
          <button
            type="button"
            class="setup-input-action-btn"
            onclick={() => (showConfirmPassword = !showConfirmPassword)}
            aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {#if showConfirmPassword}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <!-- ALERTA: Error -->
      {#if errorMessage}
        <div class="alert alert-error" role="alert" aria-live="polite">
          <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <!-- ALERTA: Éxito -->
      {#if successMessage}
        <div class="alert alert-success" role="status" aria-live="polite">
          <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>{successMessage}</span>
        </div>
      {/if}

      <!-- BOTÓN: Crear cuenta -->
      <button
        type="button"
        class="setup-btn"
        onclick={handleSubmit}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? 'Creando cuenta…' : 'Crear cuenta de administrador'}
      </button>

    </div>
    <!-- /.setup-form-area -->

  </div>
  <!-- /.setup-card -->

</div>
<!-- /.setup-wrapper -->

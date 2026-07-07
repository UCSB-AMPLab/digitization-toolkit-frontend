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
	import logo from '$lib/assets/captua-logo.svg';

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
				password
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
<div class="setup-wrapper" onkeydown={handleKeydown} role="main">
	<div class="setup-card" class:is-loading={isLoading}>
		<!-- Logo + nombre del sistema + título -->
		<div class="card-logo-area">
			<div class="header">
				<div class="card-logo-area">
					<img src={logo} alt="Captua" class="brand-logo-xl" />
				</div>
			</div>
			<p class="setup-title">Primera instalación</p>
			<p class="setup-subtitle">Crea cuenta del administrador.</p>
		</div>

		<!-- Formulario -->
		<div class="form-area">
			<!-- CAMPO: Usuario -->
			<div class="field-group">
				<label class="field-label" for="su-username">Usuario</label>
				<div class="input-wrapper">
					<svg
						class="input-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
					<input
						id="su-username"
						type="text"
						class="input"
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
			<div class="field-group">
				<label class="field-label" for="su-email">Correo electrónico</label>
				<div class="input-wrapper">
					<svg
						class="input-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
						<polyline points="22,6 12,13 2,6" />
					</svg>
					<input
						id="su-email"
						type="email"
						class="input"
						class:input-error={errorMessage}
						placeholder="admin@ejemplo.com"
						bind:value={email}
						disabled={isLoading}
						autocomplete="email"
					/>
				</div>
			</div>

			<!-- CAMPO: Contraseña -->
			<div class="field-group">
				<label class="field-label" for="su-password">Contraseña</label>
				<div class="input-wrapper">
					<svg
						class="input-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<input
						id="su-password"
						type={showPassword ? 'text' : 'password'}
						class="input input-with-action"
						class:input-error={errorMessage}
						placeholder="Mínimo 8 caracteres"
						bind:value={password}
						disabled={isLoading}
						autocomplete="new-password"
					/>
					<button
						type="button"
						class="input-action-btn"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
					>
						{#if showPassword}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path
									d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
								/>
								<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
								<line x1="1" y1="1" x2="23" y2="23" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{/if}
					</button>
				</div>
				<span class="setup-hint">Mínimo 8 caracteres</span>
			</div>

			<!-- CAMPO: Confirmar contraseña -->
			<div class="field-group">
				<label class="field-label" for="su-confirm">Confirmar contraseña</label>
				<div class="input-wrapper">
					<svg
						class="input-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<input
						id="su-confirm"
						type={showConfirmPassword ? 'text' : 'password'}
						class="input input-with-action"
						class:input-error={errorMessage}
						placeholder="Repite la contraseña"
						bind:value={confirmPassword}
						disabled={isLoading}
						autocomplete="new-password"
					/>
					<button
						type="button"
						class="input-action-btn"
						onclick={() => (showConfirmPassword = !showConfirmPassword)}
						aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
					>
						{#if showConfirmPassword}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path
									d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
								/>
								<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
								<line x1="1" y1="1" x2="23" y2="23" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{/if}
					</button>
				</div>
			</div>

			<!-- ALERTA: Error -->
			{#if errorMessage}
				<div class="alert alert-error" role="alert" aria-live="polite">
					<svg
						class="alert-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
					</svg>
					<span>{errorMessage}</span>
				</div>
			{/if}

			<!-- ALERTA: Éxito -->
			{#if successMessage}
				<div class="alert alert-success" role="status" aria-live="polite">
					<svg
						class="alert-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span>{successMessage}</span>
				</div>
			{/if}

			<!-- BOTÓN: Crear cuenta -->
			<button
				type="button"
				class="btn-login"
				onclick={handleSubmit}
				disabled={isLoading}
				aria-busy={isLoading}
			>
				{isLoading ? 'CREANDO CUENTA' : 'Crear cuenta de administrador'}
			</button>
		</div>
		<!-- /.form-area -->

		<!-- OVERLAY DE CARGA -->
		{#if isLoading}
			<div class="loading-overlay" aria-label="Cargando" role="status">
				<div class="spinner"></div>
				<p class="loading-text">Creando cuenta</p>
			</div>
		{/if}
	</div>
	<!-- /.setup-card -->
</div>
<!-- /.setup-wrapper -->

<style>
	/* ── Wrapper: pantalla completa ── */
	.setup-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background-color: var(--color-bg);
		padding: 24px 16px;
	}

	/* ── Card principal ── */
	.setup-card {
		position: relative;
		width: 100%;
		max-width: 370px;
		background-color: var(--color-surface);
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
	}

	/* Opacidad reducida del formulario durante la carga */
	.setup-card.is-loading .form-area {
		pointer-events: none;
		opacity: 0.5;
	}

	/* ── Área del logo ── */
	.card-logo-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 32px 24px 0;
	}

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

	.setup-title {
		font-size: var(--text-h5);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
		text-align: center;
	}

	.setup-subtitle {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
		text-align: center;
		line-height: 1.5;
	}

	/* ── Área del formulario ── */
	.form-area {
		padding: 28px 24px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: var(--fw-medium);
		color: var(--color-light-grey);
	}

	.setup-hint {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		opacity: 0.75;
	}

	/* Input con ícono a la izquierda */
	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-icon {
		position: absolute;
		left: 12px;
		width: 18px;
		height: 18px;
		color: var(--color-light-grey);
		pointer-events: none;
	}

	.input-wrapper .input {
		padding-left: 40px;
		background-color: var(--color-surface-alt);
		border-color: #323a31;
	}

	.input-wrapper .input:focus {
		border-color: var(--color-primary);
		outline: none;
	}

	.input-with-action {
		padding-right: 44px;
	}

	/* Botón ojo */
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

	/* Error en inputs */
	.input-error {
		border-color: var(--color-error) !important;
	}

	/* Alertas */
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

	.alert-success {
		background-color: var(--color-success-bg);
		border: 1px solid var(--color-success);
		color: var(--color-success);
	}

	.alert-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	/* Botón principal */
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
		min-height: var(--touch-target-lg);
		cursor: pointer;
		transition:
			background-color var(--transition-base),
			opacity var(--transition-base);
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
		letter-spacing: 0.08em;
	}

	/* Overlay de carga */
	.loading-overlay {
		position: absolute;
		inset: 0;
		background-color: rgba(19, 17, 16, 0.65);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		border-radius: var(--radius-xl);
		z-index: 10;
		backdrop-filter: blur(2px);
	}

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

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

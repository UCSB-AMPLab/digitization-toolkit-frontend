<script lang="ts">
	// ============================================================================
	// PÁGINA: Login
	// Ruta: /login → src/routes/(auth)/login/+page.svelte
	//
	// Estados que maneja:
	//   - Default:  formulario vacío listo para ingresar credenciales
	//   - Loading:  spinner + overlay mientras espera respuesta del backend
	//   - Error:    alerta roja "Usuario o contraseña incorrectos"
	//   - Popup:    modal "¿Olvidaste tu contraseña?" con instrucción de contacto
	// ============================================================================

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authApi, healthApi, usersApi, tokenStore } from '$lib/api';
	import { classifyLoginError } from '$lib/login-error';
	import { authStore, getRoleDashboardPath, isUserRole } from '$lib/stores/auth';
	import { m, locale, setLanguage, type Locale } from '$lib/i18n';
	import logo from '$lib/assets/captua-logo-descrp-light-esp.svg';
	import favicon from '$lib/assets/favicon.svg';

	// ---------------------------------------------------------------------------
	// ESTADO DEL FORMULARIO
	// ---------------------------------------------------------------------------

	let username = $state(''); // valor del campo Usuario
	let password = $state(''); // valor del campo Contraseña
	let rememberMe = $state(false); // checkbox "Recuérdame"
	let showPassword = $state(false); // toggle mostrar/ocultar contraseña

	// ---------------------------------------------------------------------------
	// ESTADO DE LA UI
	// ---------------------------------------------------------------------------

	let isLoading = $state(false); // true mientras se procesa el login
	let errorMessage = $state(''); // mensaje de error (vacío = sin error)
	let isConnected = $state(false); // true si el backend responde

	// ── POPUP "¿Olvidaste tu contraseña?" ─────────────────────────────────────
	// showForgotPopup controla la visibilidad del modal.
	// Para cambiar el mensaje del popup, edita login_forgot_message en $lib/i18n.
	let showForgotPopup = $state(false);

	// Idiomas disponibles en el selector de idioma del footer.
	// Las siglas se muestran siempre en su propio idioma (no se traducen).
	// PT queda fuera hasta que exista un catálogo pt.ts en $lib/i18n.
	const languages: { code: Locale; label: string }[] = [
		{ code: 'es', label: 'ES' },
		{ code: 'en', label: 'EN' }
	];

	// ---------------------------------------------------------------------------
	// AL MONTAR: verifica si ya hay sesión y chequea conexión al backend
	// ---------------------------------------------------------------------------
	onMount(async () => {
		// Si ya hay sesión activa, no tiene sentido mostrar el login
		if (authStore.isAuthenticated()) {
			goto('/');
			return;
		}
		// Verifica que el backend esté respondiendo para mostrar el indicador
		await checkConnection();
	});

	// ---------------------------------------------------------------------------
	// FUNCIÓN: Verifica si el backend está disponible
	// Actualiza el punto verde/rojo de "Conectado / Sin conexión" en el footer.
	// El endpoint de healthcheck está en api.ts → healthApi.check()
	// ---------------------------------------------------------------------------
	async function checkConnection() {
		try {
			await healthApi.check();
			isConnected = true;
		} catch {
			isConnected = false;
		}
	}

	// ---------------------------------------------------------------------------
	// FUNCIÓN: Maneja el submit del formulario de login
	//
	//   1. Llama a authApi.login() con las credenciales
	//   2. Obtiene datos del usuario con /users/me
	//   3. Guarda sesión y redirige al dashboard según rol
	// ---------------------------------------------------------------------------
	async function handleLogin() {
		// Limpiar error anterior en cada intento
		errorMessage = '';

		// Validación de campos vacíos
		if (!username.trim() || !password.trim()) {
			errorMessage = $m.login_error_fill_all_fields;
			return;
		}

		isLoading = true;

		// Flipped once /auth/login returns 200, so a later failure can't be
		// reported as a bad password.
		let credentialsChecked = false;

		try {
			// Paso 1: autenticar y obtener token JWT
			const authResponse = await authApi.login({
				username: username.trim(),
				password
			});
			credentialsChecked = true;

			// Paso 2: obtener datos del usuario autenticado (incluye el rol)
			// El rol que devuelve /users/me tiene que estar en USER_ROLES
			// (stores/auth.ts). Si el backend agrega roles, esa lista es el único
			// lugar donde hay que tocarlos — el paso 3 valida contra ella.
			//
			// usersApi.me() usa apiRequest, que arma el header Authorization desde
			// tokenStore — hay que persistir el token recién obtenido primero para
			// que este llamado lo levante.
			tokenStore.set(authResponse.access_token);
			const userData = await usersApi.me();

			// Paso 3: validar el rol antes de abrir sesión. Sin esto, un rol que
			// el frontend no conoce entra igual y termina decidiendo navegación y
			// permisos de cámara (NEH-117).
			//
			// Hay que limpiar la sesión: el token ya quedó en localStorage para
			// poder llamar a /users/me, y el estado inicial de authStore lo vuelve
			// a leer de ahí — dejarlo puesto significa recargar la página y
			// aparecer con sesión a medias. clearSession borra también el
			// auth_user que pudiera haber quedado de una sesión anterior.
			if (!isUserRole(userData.role)) {
				authStore.clearSession();
				console.error('[Login] Rol no reconocido:', userData.role);
				errorMessage = $m.login_error_unknown_role;
				return;
			}

			// Paso 4: guardar sesión en el store global
			authStore.setSession(authResponse.access_token, userData);

			// Paso 5: redirigir al dashboard según rol
			goto(getRoleDashboardPath(userData.role));
		} catch (error) {
			// Bad credentials vs. unreachable backend. The credentials
			// message stays generic; it just no longer covers connection failures.
			if (classifyLoginError(error, { credentialsChecked }) === 'credentials') {
				errorMessage = $m.login_error_bad_credentials;
			} else {
				errorMessage = $m.login_error_backend_unavailable;
				// Keep the footer's connection dot consistent with the message.
				await checkConnection();
			}
			console.error('[Login] Error:', error);
		} finally {
			// Siempre apagar el loading al terminar (éxito o error)
			isLoading = false;
		}
	}

	// ---------------------------------------------------------------------------
	// ACCIÓN: Abrir popup "¿Olvidaste tu contraseña?"
	// Muestra el modal con el mensaje de contacto.
	// Para cambiar el mensaje, edita la variable forgotMessage arriba.
	// ---------------------------------------------------------------------------
	function handleForgotPassword() {
		showForgotPopup = true;
	}

	// ---------------------------------------------------------------------------
	// ACCIÓN: Cerrar el popup de contraseña olvidada
	// Se llama desde el botón "Cerrar" dentro del modal.
	// ---------------------------------------------------------------------------
	function closeForgotPopup() {
		showForgotPopup = false;
	}

	// ---------------------------------------------------------------------------
	// ACCIÓN: Cerrar popup con clic en el backdrop (fuera del modal)
	// ---------------------------------------------------------------------------
	function handleBackdropClick(event: MouseEvent) {
		// Solo cierra si el click fue directamente en el backdrop,
		// no en el contenido del modal
		if ((event.target as HTMLElement).classList.contains('popup-backdrop')) {
			closeForgotPopup();
		}
	}

	// ---------------------------------------------------------------------------
	// ACCIÓN: Cerrar popup con tecla Escape
	// ---------------------------------------------------------------------------
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showForgotPopup) {
			closeForgotPopup();
			return;
		}
		// Permite enviar el formulario con Enter cuando el popup está cerrado
		if (event.key === 'Enter' && !isLoading && !showForgotPopup) {
			handleLogin();
		}
	}

	// ---------------------------------------------------------------------------
	// ACCIÓN: Toggle mostrar/ocultar contraseña
	// ---------------------------------------------------------------------------
	function togglePassword() {
		showPassword = !showPassword;
	}

	// El cambio de idioma lo hace setLanguage de $lib/i18n: escribe la cookie
	// dtk_locale y recarga la página para que el SSR renderice el idioma nuevo.
</script>

<!-- ============================================================
     CONTENEDOR PRINCIPAL
     ============================================================ -->
<div class="login-wrapper" onkeydown={handleKeydown} role="main">
	<!-- ── CARD DE LOGIN ─────────────────────────────────────────── -->
	<div class="login-card" class:is-loading={isLoading}>
		<!-- Logo + nombre del sistema -->
		<div class="card-logo-area">
			<img src={logo} alt="Captua" class="brand-logo" />
		</div>

		<!-- Formulario -->
		<div class="form-area">
			<!-- CAMPO: Usuario -->
			<div class="field-group">
				<label class="field-label" for="username">{$m.common_username_label}</label>
				<div class="input-wrapper">
					<!-- Ícono persona -->
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
						id="username"
						type="text"
						class="input"
						class:input-error={errorMessage}
						placeholder={$m.login_username_placeholder}
						bind:value={username}
						disabled={isLoading}
						autocomplete="username"
						autocapitalize="none"
						autocorrect="off"
					/>
				</div>
			</div>

			<!-- CAMPO: Contraseña -->
			<div class="field-group">
				<label class="field-label" for="password">{$m.common_password_label}</label>
				<div class="input-wrapper">
					<!-- Ícono candado -->
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
					<!-- type cambia según showPassword -->
					<input
						id="password"
						type={showPassword ? 'text' : 'password'}
						class="input input-with-action"
						class:input-error={errorMessage}
						placeholder={$m.login_password_placeholder}
						bind:value={password}
						disabled={isLoading}
						autocomplete="current-password"
					/>
					<!-- Botón ojo mostrar/ocultar -->
					<button
						type="button"
						class="input-action-btn"
						onclick={togglePassword}
						aria-label={showPassword ? $m.common_hide_password : $m.common_show_password}
					>
						{#if showPassword}
							<!-- Ojo tachado: contraseña visible -->
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path
									d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
								/>
								<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
								<line x1="1" y1="1" x2="23" y2="23" />
							</svg>
						{:else}
							<!-- Ojo abierto: contraseña oculta -->
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{/if}
					</button>
				</div>
			</div>

			<!-- FILA: Recuérdame + ¿Olvidaste tu contraseña? -->
			<div class="row-options">
				<label class="remember-label">
					<input type="checkbox" class="checkbox" bind:checked={rememberMe} disabled={isLoading} />
					<span>{$m.login_remember_me}</span>
				</label>
				<!-- Al hacer click abre el popup — ver handleForgotPassword() arriba -->
				<button
					type="button"
					class="forgot-link"
					onclick={handleForgotPassword}
					disabled={isLoading}
				>
					{$m.login_forgot_link}
				</button>
			</div>

			<!-- ALERTA DE ERROR: visible solo cuando hay errorMessage -->
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

			<!-- BOTÓN: Iniciar sesión -->
			<button
				type="button"
				class="btn-login"
				onclick={handleLogin}
				disabled={isLoading}
				aria-busy={isLoading}
			>
				<!-- En estado loading el texto va en mayúsculas (igual que en el diseño) -->
				{isLoading ? $m.login_submit_loading : $m.login_submit}
			</button>
		</div>
		<!-- /form-area -->

		<!-- FOOTER: estado de conexión + selector de idioma -->
		<div class="card-footer">
			<!-- Punto verde/rojo + texto "Conectado" / "Sin conexión" -->
			<div class="connection-status">
				<span class="status-dot" class:success={isConnected} class:error={!isConnected}></span>
				<span class="status-text">{isConnected ? $m.login_connected : $m.login_offline}</span>
			</div>

			<!-- Selector de idioma — escribe la cookie y recarga (ver $lib/i18n) -->
			<div class="lang-selector">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="globe-icon"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="2" y1="12" x2="22" y2="12" />
					<path
						d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
					/>
				</svg>
				{#each languages as lang, i}
					<button
						type="button"
						class="lang-btn"
						class:active={$locale === lang.code}
						onclick={() => setLanguage(lang.code)}
					>
						{lang.label}
					</button>
					{#if i < languages.length - 1}
						<span class="lang-sep">|</span>
					{/if}
				{/each}
			</div>
		</div>

		<!-- OVERLAY DE CARGA: se superpone sobre el card durante el login -->
		{#if isLoading}
			<div class="loading-overlay" aria-label={$m.common_loading} role="status">
				<div class="spinner"></div>
				<p class="loading-text">{$m.common_loading}</p>
			</div>
		{/if}
	</div>
	<!-- /login-card -->
</div>
<!-- /login-wrapper -->

<!-- ============================================================
     POPUP: ¿Olvidaste tu contraseña?
     Se muestra sobre todo el contenido cuando showForgotPopup = true.
     Para cambiar el mensaje, edita login_forgot_message en $lib/i18n.
     Para cerrar: botón "Cerrar", tecla Escape, o click fuera del modal.
     ============================================================ -->
{#if showForgotPopup}
	<!-- Backdrop oscuro — click fuera del modal lo cierra -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="popup-backdrop"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label={$m.login_forgot_dialog_aria}
	>
		<!-- Contenido del modal -->
		<div class="popup-card">
			<!-- Ícono de advertencia/información -->
			<div class="popup-icon-wrapper">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="popup-icon"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			</div>

			<!-- Título del popup -->
			<h3 class="popup-title">{$m.login_forgot_title}</h3>

			<!-- Mensaje principal -->
			<!-- Para cambiar este texto, edita login_forgot_message en $lib/i18n -->
			<p class="popup-message">{$m.login_forgot_message}</p>

			<!-- Botón cerrar -->
			<button type="button" class="popup-close-btn" onclick={closeForgotPopup}>
				{$m.common_close}
			</button>
		</div>
	</div>
{/if}

<style>
	/* ── Wrapper: pantalla completa ── */
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
		position: relative;
		width: 100%;
		max-width: 370px;
		background-color: var(--color-surface);
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
	}

	/* Opacidad reducida del formulario durante la carga */
	.login-card.is-loading .form-area {
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

	.brand-logo {
		width: 100%;
		max-width: 224px;
		height: auto;
		display: block;
		margin: 0 auto;
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

	/* Fila recuérdame + ¿olvidaste? */
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

	/* Link ¿Olvidaste? — abre el popup al hacer click */
	.forgot-link {
		background: none;
		border: none;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		color: var(--color-secondary);
		cursor: pointer;
		padding: 0;
		transition: opacity var(--transition-fast);
		white-space: nowrap;
	}

	.forgot-link:hover {
		opacity: 0.8;
	}
	.forgot-link:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Alerta de error */
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

	/* Botón principal de login */
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

	/* Footer del card */
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background-color: rgba(255, 255, 255, 0.03);
		border-top: 1px solid var(--border-color);
		min-height: 44px;
	}

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

	.status-dot.success {
		background-color: var(--color-success);
	}
	.status-dot.error {
		background-color: var(--color-error);
	}
	.status-text {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}

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
		border-radius: var(--radius-sm);
		transition: color var(--transition-fast);
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

	/* ══════════════════════════════════════════════════════════════
     POPUP: ¿Olvidaste tu contraseña?
     ══════════════════════════════════════════════════════════════ */

	/* Backdrop: capa oscura semitransparente sobre toda la pantalla */
	.popup-backdrop {
		position: fixed;
		inset: 0; /* cubre toda la viewport */
		background-color: rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100; /* por encima de todo */
		padding: 24px;
		backdrop-filter: blur(3px); /* desenfoca el fondo */
		/* Animación de entrada */
		animation: fadeIn 0.15s ease;
	}

	/* Card del modal */
	.popup-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 32px 28px;
		width: 100%;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		box-shadow: var(--shadow-lg);
		/* Animación de entrada del modal */
		animation: slideUp 0.2s ease;
	}

	/* Círculo con ícono de información */
	.popup-icon-wrapper {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background-color: rgba(150, 177, 240, 0.12); /* azul tenue */
		border: 1px solid var(--color-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.popup-icon {
		width: 26px;
		height: 26px;
		color: var(--color-secondary);
	}

	/* Título del popup */
	.popup-title {
		font-size: var(--text-h4); /* 20px */
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
		text-align: center;
	}

	/* Mensaje del popup */
	/* Para cambiar el texto, edita la variable forgotMessage en el <script> */
	.popup-message {
		font-size: var(--text-base);
		color: var(--color-light-grey);
		text-align: center;
		line-height: 1.6;
		margin: 0;
	}

	/* Botón cerrar */
	.popup-close-btn {
		width: 100%;
		font-family: var(--font-family);
		font-size: var(--text-base);
		font-weight: var(--fw-semibold);
		color: var(--color-light);
		background-color: var(--color-primary);
		border: none;
		border-radius: var(--radius-md);
		padding: 12px;
		min-height: var(--touch-target-min);
		cursor: pointer;
		margin-top: 4px;
		transition: background-color var(--transition-base);
	}

	.popup-close-btn:hover {
		background-color: var(--color-primary-hover);
	}
	.popup-close-btn:active {
		transform: scale(0.98);
	}

	/* Animaciones del popup */
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

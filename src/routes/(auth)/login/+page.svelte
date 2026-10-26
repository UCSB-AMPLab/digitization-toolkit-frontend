<script lang="ts">
	// Login page. Before it opens a session it validates the role that
	// `/users/me` returns (NEH-117), and it tells bad credentials, a login
	// lockout and an unreachable backend apart so each gets its own message.
	// The footer shows whether the backend answers and holds the language selector.

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authApi, healthApi, usersApi, tokenStore } from '$lib/api';
	import { classifyLoginError, lockoutMinutes, retryAfterOf } from '$lib/login-error';
	import { authStore, isUserRole } from '$lib/stores/auth';
	import { m, locale, setLanguage, type Locale } from '$lib/i18n';
	import logoEs from '$lib/assets/captua-logo-descrp-light-esp.svg';
	import logoEn from '$lib/assets/captua-logo-descrp-light-eng.svg';
	import favicon from '$lib/assets/favicon.svg';

	// the descriptor in the logo is baked into the SVG, so the asset
	// itself has to follow the locale.
	let logo = $derived($locale === 'en' ? logoEn : logoEs);

	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);

	let isLoading = $state(false);
	let errorMessage = $state(''); // empty = no error
	let isConnected = $state(false);

	let showForgotPopup = $state(false);

	// The labels stay in their own language rather than being translated. PT
	// is left out until `$lib/i18n` has a `pt.ts` catalogue.
	const languages: { code: Locale; label: string }[] = [
		{ code: 'es', label: 'ES' },
		{ code: 'en', label: 'EN' }
	];

	onMount(async () => {
		// A signed-in user has no reason to see the login form.
		if (authStore.isAuthenticated()) {
			goto('/');
			return;
		}
		await checkConnection();
	});

	async function checkConnection() {
		try {
			await healthApi.check();
			isConnected = true;
		} catch {
			isConnected = false;
		}
	}

	async function handleLogin() {
		errorMessage = '';

		if (!username.trim() || !password.trim()) {
			errorMessage = $m.login_error_fill_all_fields;
			return;
		}

		isLoading = true;

		// Flipped once /auth/login returns 200, so a later failure can't be
		// reported as a bad password.
		let credentialsChecked = false;

		try {
			const authResponse = await authApi.login({
				username: username.trim(),
				password
			});
			credentialsChecked = true;

			// The role `/users/me` returns has to be in `USER_ROLES`
			// (stores/auth.ts). If the backend adds roles, that list is the only
			// place to add them — the role check below validates against it.
			//
			// `usersApi.me()` goes through `apiRequest`, which builds the
			// Authorization header from `tokenStore`, so the new token has to be
			// stored first for this call to pick it up.
			tokenStore.set(authResponse.access_token);
			const userData = await usersApi.me();

			// Validate the role before opening a session. Without this check, a
			// role the frontend does not know gets in anyway and ends up deciding
			// navigation and camera permissions (NEH-117).
			//
			// The session has to be cleared: the token is already in localStorage
			// so that `/users/me` could be called, and `authStore` reads its
			// initial state from there — leaving it in place means a reload shows
			// a half-open session. `clearSession` also removes any `auth_user`
			// left over from an earlier session.
			if (!isUserRole(userData.role)) {
				authStore.clearSession();
				console.error('[Login] Unrecognized role:', userData.role);
				errorMessage = $m.login_error_unknown_role;
				return;
			}

			authStore.setSession(authResponse.access_token, userData);

			goto('/dashboard');
		} catch (error) {
			// Bad credentials, a lockout and an unreachable backend each get their
			// own message. The credentials message stays generic, and it does not
			// cover connection failures.
			const failure = classifyLoginError(error, { credentialsChecked });
			if (failure === 'credentials') {
				errorMessage = $m.login_error_bad_credentials;
			} else if (failure === 'throttled') {
				// The backend locks login after repeated failures and says for
				// how long in Retry-After (seconds).
				const minutes = lockoutMinutes(retryAfterOf(error));
				errorMessage =
					minutes === null
						? $m.login_error_locked_out_unknown
						: $m.login_error_locked_out(minutes);
			} else {
				errorMessage = $m.login_error_backend_unavailable;
				// Keep the footer's connection dot consistent with the message.
				await checkConnection();
			}
			console.error('[Login] Error:', error);
		} finally {
			isLoading = false;
		}
	}

	function handleForgotPassword() {
		showForgotPopup = true;
	}

	function closeForgotPopup() {
		showForgotPopup = false;
	}

	function handleBackdropClick(event: MouseEvent) {
		// Clicks inside the modal content bubble up to the backdrop too; only a
		// click on the backdrop itself closes the popup.
		if ((event.target as HTMLElement).classList.contains('popup-backdrop')) {
			closeForgotPopup();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showForgotPopup) {
			closeForgotPopup();
			return;
		}
		// The fields are not in a <form>, so Enter submits here, while the popup is closed.
		if (event.key === 'Enter' && !isLoading && !showForgotPopup) {
			handleLogin();
		}
	}

	function togglePassword() {
		showPassword = !showPassword;
	}

	// `setLanguage` in `$lib/i18n` switches the language: it writes the
	// `dtk_locale` cookie and reloads the page so that SSR renders the new one.
</script>

<div class="login-wrapper" onkeydown={handleKeydown} role="main">
	<div class="login-card" class:is-loading={isLoading}>
		<div class="card-logo-area">
			<img src={logo} alt="Captua" class="brand-logo" />
		</div>

		<div class="form-area">
			<div class="field-group">
				<label class="field-label" for="username">{$m.common_username_label}</label>
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

			<div class="field-group">
				<label class="field-label" for="password">{$m.common_password_label}</label>
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
						id="password"
						type={showPassword ? 'text' : 'password'}
						class="input input-with-action"
						class:input-error={errorMessage}
						placeholder={$m.login_password_placeholder}
						bind:value={password}
						disabled={isLoading}
						autocomplete="current-password"
					/>
					<button
						type="button"
						class="input-action-btn"
						onclick={togglePassword}
						aria-label={showPassword ? $m.common_hide_password : $m.common_show_password}
					>
						{#if showPassword}
							<!-- Crossed-out eye: the password is visible -->
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path
									d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
								/>
								<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
								<line x1="1" y1="1" x2="23" y2="23" />
							</svg>
						{:else}
							<!-- Open eye: the password is hidden -->
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
						{/if}
					</button>
				</div>
			</div>

			<div class="row-options">
				<button
					type="button"
					class="forgot-link"
					onclick={handleForgotPassword}
					disabled={isLoading}
				>
					{$m.login_forgot_link}
				</button>
			</div>

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

			<button
				type="button"
				class="btn-login"
				onclick={handleLogin}
				disabled={isLoading}
				aria-busy={isLoading}
			>
				<!-- The loading label is uppercase in the i18n catalogues, as in the design -->
				{isLoading ? $m.login_submit_loading : $m.login_submit}
			</button>
		</div>
		<!-- /form-area -->

		<div class="card-footer">
			<div class="connection-status">
				<span class="status-dot" class:success={isConnected} class:error={!isConnected}></span>
				<span class="status-text">{isConnected ? $m.login_connected : $m.login_offline}</span>
			</div>

			<!-- `setLanguage` writes the locale cookie and reloads (see `$lib/i18n`) -->
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

<!-- The popup closes on its Close button, Escape, or a click outside the modal. -->
{#if showForgotPopup}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="popup-backdrop"
		onclick={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label={$m.login_forgot_dialog_aria}
	>
		<div class="popup-card">
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

			<h3 class="popup-title">{$m.login_forgot_title}</h3>

			<p class="popup-message">{$m.login_forgot_message}</p>

			<button type="button" class="popup-close-btn" onclick={closeForgotPopup}>
				{$m.common_close}
			</button>
		</div>
	</div>
{/if}

<style>
	.login-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background-color: var(--color-bg);
		padding: 24px 16px;
	}

	.login-card {
		position: relative;
		width: 100%;
		max-width: 370px;
		background-color: var(--color-surface);
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
	}

	.login-card.is-loading .form-area {
		pointer-events: none;
		opacity: 0.5;
	}

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

	.input-error {
		border-color: var(--color-error) !important;
	}

	/* There is no "remember me" checkbox: the session persists either way
	   (NEH-152). */
	.row-options {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}


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

	.popup-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
		backdrop-filter: blur(3px);
		animation: fadeIn 0.15s ease;
	}

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
		animation: slideUp 0.2s ease;
	}

	.popup-icon-wrapper {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background-color: rgba(150, 177, 240, 0.12);
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

	.popup-title {
		font-size: var(--text-h4); /* 20px */
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
		text-align: center;
	}

	.popup-message {
		font-size: var(--text-base);
		color: var(--color-light-grey);
		text-align: center;
		line-height: 1.6;
		margin: 0;
	}

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

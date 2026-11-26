<script lang="ts">
	// Login page. Before it opens a session it validates the role that
	// `/users/me` returns (NEH-117), and it tells bad credentials, a login
	// lockout and an unreachable backend apart so each gets its own message.
	// The footer shows whether the backend answers.
	// The page has no language picker: it is shown in the unit's language
	// (hooks.server.ts renders it so; on a client-side visit, after a sign-out,
	// the store is set from `/auth/setup/status`). A unit with no account yet
	// goes to the first-run wizard. After sign-in, a person's stored language
	// is written to the cookie, and the dashboard is loaded in it; a person with
	// none is asked once, on this page, and the choice is stored with
	// PUT /users/me/language (NEH-336). A failure to store it does not hold the
	// sign-in back: the person goes on in the language chosen and is asked
	// again at the next sign-in. Once a sign-in has started, the unit's
	// language is never applied: its request is aborted and its answer
	// ignored, also after the page is gone. The dashboard is loaded anew in
	// the person's language only when this browser kept the signed-in user
	// (read back from storage); otherwise a reload would arrive with no
	// session, so the cookie and the language are set and the page goes on
	// without a reload. The footer links to the credits page.
	// After a person's own password change the app ends the session and opens
	// this page with loginNotice set: the confirmation is shown above the form,
	// as a status region, and the notice is cleared when the page is left, so
	// it is shown for that one visit.
	//
	// Version: 0.3.0

	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authApi, healthApi, usersApi } from '$lib/api';
	import { classifyLoginError, lockoutMinutes, retryAfterOf } from '$lib/login-error';
	import { authStore, isUserRole } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { m, locale, storeLanguage, isLocale, type Locale } from '$lib/i18n';
	import { switchLanguage } from '$lib/language-switch';
	import { pageLife } from '$lib/page-life';
	import { dismissible } from '$lib/dialog';
	import { loginNotice } from '$lib/stores/login-notice';
	// The logo's descriptor follows the locale inside CaptuaLogo.
	import CaptuaLogo from '$lib/components/CaptuaLogo.svelte';

	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);

	let isLoading = $state(false);
	let errorMessage = $state(''); // empty = no error
	let isConnected = $state(false);

	let showForgotPopup = $state(false);

	// The question for a person with no language yet. Each name is in its own
	// language, whatever the page's.
	const LANGUAGES: { code: Locale; label: string }[] = [
		{ code: 'es', label: 'Español' },
		{ code: 'en', label: 'English' }
	];
	let askLanguage = $state(false);
	let savingLanguage = $state(false);

	// Each request's answer acts only while its operation is current
	// ($lib/page-life): the page is mounted and no newer one of its kind has
	// started. A sign-in stops the unit's status read.
	const life = pageLife();

	onDestroy(() => loginNotice.set(null));

	onMount(async () => {
		// A signed-in user has no reason to see the login form.
		if (authStore.isAuthenticated()) {
			goto('/');
			return;
		}
		void followUnit();
		await checkConnection();
	});

	// A unit with no account goes to the wizard; otherwise the page takes the
	// unit's language. A failed read changes nothing.
	async function followUnit() {
		const op = life.begin('unit');
		try {
			const status = await authApi.setupStatus(op.signal);
			if (!op.current()) return;
			if (status.needs_setup) {
				goto('/setup');
				return;
			}
			const unitLanguage = status.default_language;
			if (isLocale(unitLanguage) && unitLanguage !== get(locale)) {
				locale.set(unitLanguage);
				document.documentElement.lang = unitLanguage;
			}
		} catch {
			// The page stays in the language the server rendered.
		}
	}

	// Into the dashboard in `language`: the cookie is written, and the page
	// is loaded anew when it is not the language already shown.
	function enterIn(language: Locale) {
		if (language !== get(locale)) {
			switchLanguage(language, '/dashboard');
			return;
		}
		storeLanguage(language);
		goto('/dashboard');
	}

	async function chooseLanguage(language: Locale) {
		if (savingLanguage) return;
		const op = life.begin('language');
		savingLanguage = true;
		try {
			const user = await usersApi.setMyLanguage(language);
			if (!op.current()) return;
			if (isUserRole(user?.role)) authStore.setSession(user);
		} catch (error) {
			if (!op.current()) return;
			console.error('[Login] Could not store the language:', error);
		}
		enterIn(language);
	}

	async function checkConnection() {
		const op = life.begin('health');
		try {
			await healthApi.check();
			if (!op.current()) return;
			isConnected = true;
		} catch {
			if (!op.current()) return;
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
		life.stop('unit');
		const op = life.begin('signin');

		// Flipped once /auth/login returns 200, so a later failure can't be
		// reported as a bad password.
		let credentialsChecked = false;

		try {
			// The backend answers with the httpOnly session cookie, which no
			// script reads; the browser sends it with every request after this.
			await authApi.login({
				username: username.trim(),
				password
			});
			if (!op.current()) return;
			credentialsChecked = true;

			// The role `/users/me` returns has to be in `USER_ROLES`
			// (stores/auth.ts). If the backend adds roles, that list is the only
			// place to add them — the role check below validates against it.
			const userData = await usersApi.me();
			if (!op.current()) return;

			// Validate the role before opening a session. Without this check, a
			// role the frontend does not know gets in anyway and ends up deciding
			// navigation and camera permissions (NEH-117).
			//
			// The session has to be closed: the backend has already set the
			// cookie, and leaving it means a half-open session with a role the
			// app does not handle. `authApi.logout()` asks the backend to clear
			// the cookie and also removes any `auth_user` left over from an
			// earlier session.
			if (!isUserRole(userData.role)) {
				await authApi.logout();
				if (!op.current()) return;
				console.error('[Login] Unrecognized role:', userData.role);
				errorMessage = $m.login_error_unknown_role;
				return;
			}

			authStore.setSession(userData, { signIn: true });

			if (isLocale(userData.language)) enterIn(userData.language);
			else askLanguage = true;
		} catch (error) {
			if (!op.current()) return;
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
					minutes === null ? $m.login_error_locked_out_unknown : $m.login_error_locked_out(minutes);
			} else {
				errorMessage = $m.login_error_backend_unavailable;
				// Keep the footer's connection dot consistent with the message.
				await checkConnection();
			}
			console.error('[Login] Error:', error);
		} finally {
			if (op.current()) isLoading = false;
		}
	}

	function handleForgotPassword() {
		showForgotPopup = true;
	}

	function closeForgotPopup() {
		showForgotPopup = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		// The fields are not in a <form>, so Enter submits here, while the popup is closed.
		if (event.key === 'Enter' && !isLoading && !showForgotPopup && !askLanguage) {
			handleLogin();
		}
	}

	function togglePassword() {
		showPassword = !showPassword;
	}
</script>

<div class="login-wrapper" onkeydown={handleKeydown} role="main">
	<div class="login-card" class:is-loading={isLoading}>
		<div class="card-logo-area">
			<CaptuaLogo wordmark="descriptor" class="brand-logo" />
		</div>

		{#if $loginNotice === 'password_changed'}
			<div class="notice" role="status">
				<p class="notice-title">{$m.account_password_done_title}</p>
				<p class="notice-text">{$m.account_password_done}</p>
			</div>
		{/if}

		{#if askLanguage}
			<div class="form-area language-question">
				<h1 class="question-title">{$m.login_language_title}</h1>
				<p class="question-text">{$m.login_language_desc}</p>
				<div class="question-options">
					{#each LANGUAGES as lang (lang.code)}
						<button
							type="button"
							class="btn-login"
							lang={lang.code}
							onclick={() => chooseLanguage(lang.code)}
							disabled={savingLanguage}
						>
							{lang.label}
						</button>
					{/each}
				</div>
			</div>
		{:else}
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
									<path
										d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
									/>
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
		{/if}

		<div class="card-footer">
			<div class="connection-status">
				<span class="status-dot" class:success={isConnected} class:error={!isConnected}></span>
				<span class="status-text">{isConnected ? $m.login_connected : $m.login_offline}</span>
			</div>
			<!-- Bilingual whatever the page's language, as in the first-run wizard. -->
			<a href="/credits?from=login" class="credits-link"
				>Credits / <span lang="es">Créditos</span></a
			>
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
	<div
		class="popup-backdrop"
		use:dismissible={{ onDismiss: closeForgotPopup }}
		role="dialog"
		aria-modal="true"
		aria-label={$m.login_forgot_dialog_aria}
	>
		<div class="popup-card dialog-fit">
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

	.notice {
		margin: 0 0 16px;
		padding: 12px 14px;
		border: 1px solid rgba(90, 140, 98, 0.4);
		border-radius: var(--radius-md);
		background-color: rgba(90, 140, 98, 0.08);
		color: var(--color-light);
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	.notice-title {
		margin: 0 0 4px;
		font-weight: var(--fw-bold);
	}
	.notice-text {
		margin: 0;
		color: var(--color-light-grey);
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

	.credits-link {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-secondary);
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

	/* The question for a person with no language yet. */
	.language-question {
		gap: 10px;
	}
	.question-title {
		margin: 0;
		font-size: var(--text-h5);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		text-align: center;
	}
	.question-text {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		text-align: center;
		line-height: 1.45;
	}
	.question-options {
		display: flex;
		flex-direction: column;
		gap: 10px;
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

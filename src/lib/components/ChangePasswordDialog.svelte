<script lang="ts">
	// Change password (NEH-395): the signed-in user changes their own password
	// through POST /auth/password-reset, with their current password. The
	// account menu opens it for every role but the testing account, whose
	// password an administrator sets in Settings.
	//
	// Before a request the dialog checks the current password is given and the
	// new one is not blank, has at least PASSWORD_MIN_LENGTH characters and is
	// typed the same twice, as the Users page's create form checks it; until
	// then no request is sent. A wrong current password (the backend's 401 "Old
	// password incorrect") gets its own message and the dialog stays open for
	// another try; it counts against the login throttle on the backend, and
	// once the account is locked the route answers 429 as the login does, which
	// the dialog shows with the login page's message. Any other 401 means this
	// tab's session is already dead: the dialog ends it as the rest of the app
	// does. Other refusals are shown in the interface's own words.
	//
	// On success the backend has ended every session of the user, this one
	// included, so the dialog ends this tab's session at once, as any dead
	// session is ended (endDeadSession: the local session cleared, renewals
	// stopped, the login page opened), and leaves the confirmation for the
	// login page in loginNotice. A 401 that reaches another request first
	// takes the screen to the login page before the answer arrives; the
	// notice set then still appears there.
	//
	// The answer acts only for the session it was sent in. At submit the
	// dialog notes the signed-in user's id; `destroyed` is set when it goes.
	// If the answer arrives after the dialog has gone and someone else is
	// signed in, it does nothing at all; if nobody is signed in, it sets the
	// notice only, since the screen is already at the login page. The auth
	// store holds the user and nothing that marks one sign-in from the next,
	// so a later sign-in by the same person reads as the same session.
	//
	// The browser's password manager: the form carries the signed-in user's
	// username in a read-only autocomplete="username" field, the current
	// password is autocomplete="current-password" and the new ones
	// autocomplete="new-password", so the browser can offer to update the
	// saved password of this account.
	//
	// The dialog is moved to <body> (toBody): the account menu sits in top bars
	// and the sidebar, which are stacking contexts. The keyboard stays in it
	// (trapFocus).

	import { onDestroy, onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { authApi, ApiError, AuthError, endDeadSession } from '$lib/api';
	import { loginNotice } from '$lib/stores/login-notice';
	import { m } from '$lib/i18n';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import PasswordField from './PasswordField.svelte';
	import {
		PASSWORD_MIN_LENGTH,
		passwordTooShort,
		isPasswordTooShortRefusal
	} from '$lib/password-rule';
	import { lockoutMinutes, retryAfterOf } from '$lib/login-error';

	// The backend's text for a wrong current password (app/api/auth.py, reset_password).
	const WRONG_CURRENT = 'Old password incorrect';

	let {
		username,
		onCancel
	}: {
		username: string;
		onCancel: () => void;
	} = $props();

	let current = $state('');
	let newPassword = $state('');
	let repeat = $state('');
	let sending = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<'current' | 'new' | 'repeat' | null>(null);
	let currentInput = $state<HTMLInputElement | undefined>(undefined);

	onMount(() => {
		currentInput?.focus();
	});

	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
	});

	function codeOf(err: unknown): unknown {
		const detail = (err as { detail?: unknown } | null)?.detail;
		return typeof detail === 'object' && detail !== null
			? (detail as { code?: unknown }).code
			: undefined;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		error = null;
		invalidField = null;
		if (!current) {
			invalidField = 'current';
			error = $m.account_password_val_current_required;
			return;
		}
		if (!newPassword.trim()) {
			invalidField = 'new';
			error = $m.users_val_password_required;
			return;
		}
		if (passwordTooShort(newPassword)) {
			invalidField = 'new';
			error = $m.common_password_too_short(PASSWORD_MIN_LENGTH);
			return;
		}
		if (newPassword !== repeat) {
			invalidField = 'repeat';
			error = $m.users_val_password_mismatch;
			return;
		}
		sending = true;
		const sentAs = authStore.getUser()?.id;
		try {
			await authApi.resetPassword(current, newPassword);
			const now = authStore.getUser();
			if (destroyed && now !== null && now.id !== sentAs) return;
			loginNotice.set('password_changed');
			if (destroyed && now === null) return;
			endDeadSession();
		} catch (err) {
			// The backend's English text goes to the console only; it never carries a password.
			console.error('[ChangePasswordDialog] Error changing the password:', err);
			if (err instanceof AuthError && err.status === 401) {
				if (err.message === WRONG_CURRENT) {
					invalidField = 'current';
					error = $m.account_password_err_wrong_current;
				} else {
					const now = authStore.getUser();
					if (!(destroyed && now !== null && now.id !== sentAs)) endDeadSession();
				}
			} else if (err instanceof ApiError && err.status === 429) {
				const minutes = lockoutMinutes(retryAfterOf(err));
				error =
					minutes === null ? $m.login_error_locked_out_unknown : $m.login_error_locked_out(minutes);
			} else if (isPasswordTooShortRefusal(err)) {
				invalidField = 'new';
				error = $m.common_password_too_short(PASSWORD_MIN_LENGTH);
			} else if (codeOf(err) === 'testing_account') {
				error = $m.account_password_err_testing_account;
			} else if (err instanceof ApiError && err.status === 422) {
				error = $m.account_password_err_invalid;
			} else {
				error = $m.account_password_err_generic;
			}
		} finally {
			current = '';
			newPassword = '';
			repeat = '';
			sending = false;
		}
	}

	function cancel() {
		if (sending) return;
		onCancel();
	}
</script>

<div
	class="cp-backdrop"
	use:toBody
	use:dismissible={{ onDismiss: cancel, escape: !sending, backdrop: false }}
>
	<div
		class="cp-card dialog-fit"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		use:trapFocus
		aria-labelledby="cp-title"
	>
		<form class="cp-form" onsubmit={submit} novalidate>
			<h2 class="cp-title" id="cp-title">{$m.account_password_title}</h2>

			<div class="cp-field">
				<label class="cp-label" for="cp-username">{$m.users_field_username}</label>
				<input
					id="cp-username"
					class="cp-input"
					type="text"
					autocomplete="username"
					readonly
					value={username}
				/>
			</div>

			<PasswordField
				id="cp-current"
				label={$m.account_password_current_label}
				autocomplete="current-password"
				bind:value={current}
				bind:input={currentInput}
				disabled={sending}
				invalid={invalidField === 'current'}
			/>
			<PasswordField
				id="cp-new"
				label={$m.account_password_new_label}
				autocomplete="new-password"
				bind:value={newPassword}
				disabled={sending}
				invalid={invalidField === 'new'}
			/>
			<PasswordField
				id="cp-repeat"
				label={$m.account_password_repeat_label}
				autocomplete="new-password"
				bind:value={repeat}
				disabled={sending}
				invalid={invalidField === 'repeat'}
			/>

			<p class="cp-note">{$m.account_password_signout_note}</p>

			{#if error}
				<div class="cp-error" role="alert">{error}</div>
			{/if}

			<div class="cp-actions">
				<button type="button" class="btn-ghost" onclick={cancel} disabled={sending}
					>{$m.common_cancel}</button
				>
				<button type="submit" class="cp-save" disabled={sending}
					>{sending ? $m.common_saving : $m.common_save}</button
				>
			</div>
		</form>
	</div>
</div>

<style>
	.cp-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 24px;
	}
	.cp-card {
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 28px;
		width: 100%;
		max-width: 420px;
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.cp-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.cp-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
	}
	.cp-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cp-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.cp-input {
		font-family: var(--font-family);
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		padding: 9px 12px;
		outline: none;
		min-height: var(--touch-target-min);
		width: 100%;
	}
	.cp-note {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
		line-height: 1.4;
	}
	.cp-error {
		padding: 10px 14px;
		background-color: rgba(214, 103, 74, 0.08);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--color-error);
		line-height: 1.4;
	}
	.cp-actions {
		display: flex;
		gap: 12px;
		padding-top: 4px;
		border-top: 1px solid var(--border-color);
	}
	.cp-actions .btn-ghost {
		flex: 1;
	}
	.cp-save {
		flex: 1;
		background-color: var(--color-primary);
		color: white;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		border: none;
		border-radius: var(--radius-md);
		padding: 9px 18px;
		min-height: var(--touch-target-min);
		cursor: pointer;
	}
	.cp-save:hover {
		background-color: var(--color-primary-hover);
	}
</style>

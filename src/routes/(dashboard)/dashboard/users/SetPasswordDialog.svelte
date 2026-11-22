<script lang="ts">
	// Set password (NEH-395): an administrator gives another user a new
	// password, through PUT /auth/users/{user_id}/password. The backend ends
	// every session of that user when it stores the password. The Users page
	// opens this dialog for one user and offers it on every row but the
	// testing account's and the administrator's own (the account menu is
	// where they change their own, with their current password).
	//
	// The two password fields hold to the create form's checks: a password that
	// is not blank, of at least PASSWORD_MIN_LENGTH characters (the backend's
	// rule), typed the same twice. Until all hold, no request is sent.
	// A refusal is shown from `detail.code` (or the status), in the interface's
	// own words, and the dialog stays open; on success the caller closes it and
	// confirms on the page.
	//
	// The browser's password manager: the form carries the TARGET user's
	// username in a read-only autocomplete="username" field, and the two
	// password inputs are autocomplete="new-password", so the browser reads
	// the form as a password for that account and never as a change to the
	// administrator's own login (as the testing account's password form in
	// Settings does).
	//
	// The keyboard stays in the dialog (trapFocus), and the focus starts in the
	// new-password field. Escape and Cancel close it while no request runs; a
	// tap on the backdrop does not, so a stray tap loses nothing.

	import { onMount } from 'svelte';
	import { usersApi, ApiError, AuthError, type UserRead } from '$lib/api';
	import { m } from '$lib/i18n';
	import { dismissible, trapFocus } from '$lib/dialog';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import {
		PASSWORD_MIN_LENGTH,
		passwordTooShort,
		isPasswordTooShortRefusal
	} from '$lib/password-rule';

	let {
		user,
		onCancel,
		onDone
	}: {
		user: Pick<UserRead, 'id' | 'username'>;
		onCancel: () => void;
		onDone: (user: UserRead) => void;
	} = $props();

	let newPassword = $state('');
	let repeat = $state('');
	let sending = $state(false);
	let error = $state<string | null>(null);
	let invalidField = $state<'new' | 'repeat' | null>(null);
	let newInput = $state<HTMLInputElement | undefined>(undefined);

	onMount(() => {
		newInput?.focus();
	});

	function codeOf(err: unknown): unknown {
		const detail = (err as { detail?: unknown } | null)?.detail;
		return typeof detail === 'object' && detail !== null
			? (detail as { code?: unknown }).code
			: undefined;
	}

	function refusalText(err: unknown): string {
		const code = codeOf(err);
		if (isPasswordTooShortRefusal(err)) return $m.common_password_too_short(PASSWORD_MIN_LENGTH);
		if (code === 'user_not_found') return $m.users_password_err_user_not_found;
		if (code === 'testing_account') return $m.users_password_err_testing_account;
		if (code === 'use_own_password_change') return $m.users_password_err_own_account;
		if (err instanceof AuthError && err.status === 403) return $m.users_password_err_not_permitted;
		if (err instanceof ApiError && err.status === 422) return $m.users_password_err_invalid;
		return $m.users_password_err_generic;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (sending) return;
		error = null;
		invalidField = null;
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
		try {
			const updated = await usersApi.setPassword(user.id, newPassword);
			newPassword = '';
			repeat = '';
			onDone(updated);
		} catch (err) {
			// The backend's English text goes to the console only; it never carries the password.
			console.error('[SetPasswordDialog] Error setting the password:', err);
			error = refusalText(err);
		} finally {
			sending = false;
		}
	}

	function cancel() {
		if (sending) return;
		onCancel();
	}
</script>

<div class="sp-backdrop" use:dismissible={{ onDismiss: cancel, escape: !sending, backdrop: false }}>
	<div
		class="sp-card dialog-fit"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		use:trapFocus
		aria-labelledby="sp-title"
	>
		<form class="sp-form" onsubmit={submit} novalidate>
			<h2 class="sp-title" id="sp-title">{$m.users_password_title(user.username)}</h2>

			<div class="sp-field">
				<label class="sp-label" for="sp-username">{$m.users_field_username}</label>
				<input
					id="sp-username"
					class="sp-input"
					type="text"
					autocomplete="username"
					readonly
					value={user.username}
				/>
			</div>

			<PasswordField
				id="sp-new"
				label={$m.users_password_new_label}
				autocomplete="new-password"
				bind:value={newPassword}
				bind:input={newInput}
				disabled={sending}
				invalid={invalidField === 'new'}
			/>
			<PasswordField
				id="sp-repeat"
				label={$m.users_password_repeat_label}
				autocomplete="new-password"
				bind:value={repeat}
				disabled={sending}
				invalid={invalidField === 'repeat'}
			/>

			<p class="sp-note">{$m.users_password_signout_note}</p>

			{#if error}
				<div class="sp-error" role="alert">{error}</div>
			{/if}

			<div class="sp-actions">
				<button type="button" class="btn-ghost" onclick={cancel} disabled={sending}
					>{$m.common_cancel}</button
				>
				<button type="submit" class="sp-save" disabled={sending}
					>{sending ? $m.common_saving : $m.common_save}</button
				>
			</div>
		</form>
	</div>
</div>

<style>
	.sp-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
	}
	.sp-card {
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 28px;
		width: 100%;
		max-width: 420px;
		box-shadow: var(--shadow-lg);
	}
	.sp-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.sp-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
		overflow-wrap: anywhere;
	}
	.sp-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.sp-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.sp-input {
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
	.sp-note {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
		line-height: 1.4;
	}
	.sp-error {
		padding: 10px 14px;
		background-color: rgba(214, 103, 74, 0.08);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--color-error);
		line-height: 1.4;
	}
	.sp-actions {
		display: flex;
		gap: 12px;
		padding-top: 4px;
		border-top: 1px solid var(--border-color);
	}
	.sp-actions .btn-ghost {
		flex: 1;
	}
	.sp-save {
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
	.sp-save:hover {
		background-color: var(--color-primary-hover);
	}
	.sp-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

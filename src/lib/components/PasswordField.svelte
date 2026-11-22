<script lang="ts">
	// One password input with the show/hide control the login page and the
	// Users page's create form have: the eye button switches the input between
	// `password` and `text`, and its accessible name says what a press does.
	// `autocomplete` is the caller's (current-password or new-password), so
	// the browser's password manager reads each field for what it is.
	//
	// Version: 0.3.0

	import { m } from '$lib/i18n';

	let {
		id,
		label,
		value = $bindable(''),
		autocomplete,
		disabled = false,
		invalid = false,
		input = $bindable<HTMLInputElement | undefined>(undefined)
	}: {
		id: string;
		label: string;
		value?: string;
		autocomplete: 'current-password' | 'new-password';
		disabled?: boolean;
		invalid?: boolean;
		input?: HTMLInputElement | undefined;
	} = $props();

	let shown = $state(false);
</script>

<div class="pw-field">
	<label class="pw-label" for={id}>{label}</label>
	<div class="pw-wrapper">
		<input
			{id}
			class="pw-input"
			class:pw-invalid={invalid}
			type={shown ? 'text' : 'password'}
			{autocomplete}
			autocapitalize="none"
			spellcheck="false"
			bind:value
			bind:this={input}
			{disabled}
			aria-invalid={invalid ? 'true' : undefined}
		/>
		<button
			type="button"
			class="pw-eye"
			onclick={() => (shown = !shown)}
			aria-label={shown ? $m.common_hide_password : $m.common_show_password}
			aria-controls={id}
			{disabled}
		>
			{#if shown}
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
					/>
					<line x1="1" y1="1" x2="23" y2="23" />
				</svg>
			{:else}
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
			{/if}
		</button>
	</div>
</div>

<style>
	.pw-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pw-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.pw-wrapper {
		position: relative;
	}
	.pw-input {
		font-family: var(--font-family);
		font-size: var(--text-sm);
		color: var(--color-light);
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		padding: 9px 40px 9px 12px;
		outline: none;
		min-height: var(--touch-target-min);
		width: 100%;
		transition: border-color var(--transition-base);
	}
	.pw-input:focus {
		border-color: var(--color-primary);
	}
	.pw-input.pw-invalid {
		border-color: var(--color-error);
	}
	.pw-eye {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--color-light-grey);
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		min-height: 0;
	}
	.pw-eye:hover {
		color: var(--color-light);
	}
</style>

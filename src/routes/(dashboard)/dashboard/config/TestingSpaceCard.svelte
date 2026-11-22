<script lang="ts">
	// Settings → Testing (NEH-391), admin only. The testing space is one shared
	// account with the role `testing`; it sees and creates only testing
	// projects and volumes, which stay on this unit and are never sent to
	// Fisqua. The card reads GET /system/testing when it is shown and offers
	// what the state allows. With no account, a form for the username, the
	// password and the term, and Switch on. With an account, in either state:
	// the term (Save term), a new username and a new password. Off, Switch on
	// sends the term in the field; on, Switch off asks for a confirmation
	// first. While that confirmation is open the term and account controls are
	// hidden, so nothing else can be sent from behind it.
	//
	// Every place that takes a password is its own <form>, so Enter submits
	// that form only. The create form's username field has
	// autocomplete="username"; the new-password form carries the testing
	// account's current username in a read-only field with the same attribute,
	// so a browser's password manager does not read the field as a change to
	// the administrator's own login. Password inputs are
	// autocomplete="new-password".
	//
	// Before a request the card checks what the backend checks: a username of
	// 1 to 150 characters once trimmed, a password that is not empty, and a
	// term that is a whole number from 1 to 365. A refusal is shown from
	// `detail.code`, in the interface's own words, never the backend's text; a
	// code, a status or a failure this version does not know gets the generic
	// line. After any request that fails the card reads the state again and
	// shows what the backend holds (the failed action's message stays
	// visible); if that read fails too it shows the load failure.
	//
	// What the administrator typed: a request does not change the fields of
	// another action. The term field takes the stored term on load and after a
	// request that sets the term (first switch-on, switch-on, Save term); the
	// new-username field is emptied after a rename; the password fields are
	// emptied after every request, whatever the answer, and a password is never
	// logged. While a request runs every control is disabled and a second
	// request is not sent.
	//
	// Focus: opening the confirmation moves focus to Cancel and Cancel returns
	// it to Switch off; after a switch-on or switch-off focus goes to the
	// control that replaced the one pressed; after any other request focus
	// stays where it was.
	//
	// The free space kept for real work (reserve_gb, a whole number of GB from
	// 1 to 10000) has its own form, saved as the term is, with the free space
	// read beside it. "Clear the testing space" asks for a confirmation that
	// says what it removes; while it is open the other controls are hidden.
	// After the clearing, whether it worked or not, the card reads the state
	// again; it says what was removed and, when the backend skipped volumes
	// being captured into, that those were left. Focus goes to Cancel when the
	// confirmation opens and back to the clear button when it closes.
	//
	// Version: 0.3.0

	import { onMount, tick } from 'svelte';
	import { m, locale } from '$lib/i18n';
	import { systemApi, type TestingCleared, type TestingSpace } from '$lib/api';

	const USERNAME_MAX = 150;
	const DAYS_MIN = 1;
	const DAYS_MAX = 365;
	const RESERVE_MIN = 1;
	const RESERVE_MAX = 10000;

	let info = $state<TestingSpace | null>(null);
	let loadFailed = $state(false);
	let username = $state('');
	let password = $state('');
	let days = $state('30');
	let reserve = $state('');
	let confirmingClear = $state(false);
	let cleared = $state<TestingCleared | null>(null);
	let clearBtn = $state<HTMLButtonElement>();
	let clearCancelBtn = $state<HTMLButtonElement>();
	let newUsername = $state('');
	let newPassword = $state('');
	let confirmingOff = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let saved = $state(false);

	let switchOffBtn = $state<HTMLButtonElement>();
	let switchOnBtn = $state<HTMLButtonElement>();
	let cancelBtn = $state<HTMLButtonElement>();

	let hasAccount = $derived(!!info && info.username !== null);

	onMount(() => {
		let alive = true;
		systemApi.getTesting().then(
			(next) => {
				if (alive) show(next, true);
			},
			() => {
				if (alive) loadFailed = true;
			}
		);
		return () => {
			alive = false;
		};
	});

	function show(next: TestingSpace, resetDays: boolean, resetReserve = resetDays) {
		info = next;
		loadFailed = false;
		if (resetDays) days = String(next.expiry_days);
		if (resetReserve) reserve = typeof next.reserve_gb === 'number' ? String(next.reserve_gb) : '';
		// A space the backend holds off has nothing left to confirm switching off.
		if (!next.enabled) confirmingOff = false;
	}

	// The message for a refusal code, or the generic line.
	function refusalText(err: unknown): string {
		const detail =
			typeof err === 'object' && err !== null ? (err as { detail?: unknown }).detail : null;
		const code =
			typeof detail === 'object' && detail !== null ? (detail as { code?: unknown }).code : null;
		switch (code) {
			case 'account_required':
				return $m.testing_err_account_required;
			case 'space_off':
				return $m.testing_err_space_off;
			case 'username_taken':
				return $m.testing_err_username_taken;
			case 'account_exists':
				return $m.testing_err_account_exists;
			case 'no_testing_account':
				return $m.testing_err_no_account;
			case 'password_empty':
				return $m.testing_err_password_empty;
			case 'password_invalid':
				return $m.testing_err_password_invalid;
			default:
				return $m.testing_err_generic;
		}
	}

	function checkUsername(value: string): string | null {
		const trimmed = value.trim();
		return trimmed.length < 1 || trimmed.length > USERNAME_MAX ? null : trimmed;
	}

	function checkDays(value: string): number | null {
		const text = value.trim();
		if (!/^\d+$/.test(text)) return null;
		const n = Number(text);
		return n >= DAYS_MIN && n <= DAYS_MAX ? n : null;
	}

	type After = 'switch-on-control' | 'switch-off-control' | null;

	// Sends one request. The password fields are emptied whatever the answer;
	// a failure is followed by a read of the state the backend holds.
	async function send(
		call: () => Promise<TestingSpace>,
		opts: { resetDays?: boolean; resetReserve?: boolean; after?: After; renamed?: boolean } = {}
	) {
		if (busy) return;
		const origin = document.activeElement as HTMLElement | null;
		const wasConfirmingOff = confirmingOff;
		busy = true;
		error = null;
		saved = false;
		cleared = null;
		let failed = false;
		try {
			show(await call(), !!opts.resetDays, !!opts.resetReserve);
			confirmingOff = false;
			if (opts.renamed) newUsername = '';
			saved = true;
		} catch (err) {
			failed = true;
			error = refusalText(err);
			try {
				show(await systemApi.getTesting(), false);
			} catch {
				info = null;
				loadFailed = true;
			}
		} finally {
			password = '';
			newPassword = '';
			busy = false;
		}
		await tick();
		// A switch-off whose answer was lost, read back as off, ends at Switch on too.
		const lostOff = failed && wasConfirmingOff && !!info && !info.enabled;
		const target =
			lostOff || (!failed && opts.after === 'switch-on-control')
				? switchOnBtn
				: !failed && opts.after === 'switch-off-control'
					? switchOffBtn
					: null;
		if (target) target.focus();
		else if (
			origin &&
			origin.isConnected &&
			(!document.activeElement || document.activeElement === document.body)
		)
			origin.focus();
	}

	function refuse(message: string) {
		error = message;
		saved = false;
		cleared = null;
	}

	function checkReserve(value: string): number | null {
		const text = value.trim();
		if (!/^\d+$/.test(text)) return null;
		const n = Number(text);
		return n >= RESERVE_MIN && n <= RESERVE_MAX ? n : null;
	}

	// Save the reserve without changing whether the space is on.
	function saveReserve() {
		const gb = checkReserve(reserve);
		if (gb === null) return refuse($m.testing_err_reserve_value);
		const enabled = !!info?.enabled;
		send(() => systemApi.setTesting({ enabled, reserve_gb: gb }), { resetReserve: true });
	}

	async function askClear() {
		error = null;
		saved = false;
		cleared = null;
		confirmingClear = true;
		await tick();
		clearCancelBtn?.focus();
	}

	async function cancelClear() {
		confirmingClear = false;
		await tick();
		clearBtn?.focus();
	}

	// Clear now; the state is read again whatever the answer.
	async function clearSpace() {
		if (busy) return;
		busy = true;
		error = null;
		saved = false;
		cleared = null;
		try {
			cleared = await systemApi.clearTesting();
		} catch (err) {
			const detail =
				typeof err === 'object' && err !== null
					? (err as { status?: unknown; detail?: unknown })
					: null;
			const code =
				typeof detail?.detail === 'object' && detail.detail !== null
					? (detail.detail as { code?: unknown }).code
					: null;
			// A purge already under way (409 testing_purge_running) has its own line.
			error =
				detail?.status === 409 && code === 'testing_purge_running'
					? $m.testing_err_purge_running
					: $m.testing_err_clear;
		}
		try {
			show(await systemApi.getTesting(), false);
		} catch {
			info = null;
			loadFailed = true;
		}
		busy = false;
		confirmingClear = false;
		await tick();
		clearBtn?.focus();
	}

	// The free space beside the reserve, in the interface's locale.
	function freeText(gb: number | null | undefined): string {
		return typeof gb === 'number'
			? $m.testing_reserve_free(gb.toLocaleString($locale === 'es' ? 'es-CO' : 'en-US'))
			: $m.testing_reserve_free_unknown;
	}

	// First switch-on, with no account: username, password and term.
	function createAndSwitchOn() {
		const name = checkUsername(username);
		if (name === null) return refuse($m.testing_err_username);
		if (password === '') return refuse($m.testing_err_password_empty);
		const term = checkDays(days);
		if (term === null) return refuse($m.testing_err_days);
		const pw = password;
		send(
			() =>
				systemApi.setTesting({ enabled: true, username: name, password: pw, expiry_days: term }),
			{ resetDays: true, after: 'switch-off-control' }
		);
	}

	// Switch on with an account: the term in the field is sent with it.
	function switchOn() {
		const term = checkDays(days);
		if (term === null) return refuse($m.testing_err_days);
		send(() => systemApi.setTesting({ enabled: true, expiry_days: term }), {
			resetDays: true,
			after: 'switch-off-control'
		});
	}

	// Save the term without changing whether the space is on.
	function saveTerm() {
		const term = checkDays(days);
		if (term === null) return refuse($m.testing_err_days);
		const enabled = !!info?.enabled;
		send(() => systemApi.setTesting({ enabled, expiry_days: term }), { resetDays: true });
	}

	function switchOff() {
		send(() => systemApi.setTesting({ enabled: false }), { after: 'switch-on-control' });
	}

	async function askSwitchOff() {
		error = null;
		saved = false;
		confirmingOff = true;
		await tick();
		cancelBtn?.focus();
	}

	async function cancelSwitchOff() {
		confirmingOff = false;
		await tick();
		switchOffBtn?.focus();
	}

	function rename() {
		const name = checkUsername(newUsername);
		if (name === null) return refuse($m.testing_err_username);
		send(() => systemApi.updateTestingAccount({ username: name }), { renamed: true });
	}

	function setPassword() {
		if (newPassword === '') return refuse($m.testing_err_password_empty);
		const pw = newPassword;
		send(() => systemApi.updateTestingAccount({ password: pw }));
	}

	function submit(action: () => void) {
		return (e: SubmitEvent) => {
			e.preventDefault();
			action();
		};
	}
</script>

<p class="t-desc">{$m.testing_desc}</p>

<div class="t-card">
	{#if !info}
		{#if loadFailed}
			<p class="t-error" role="alert">{$m.testing_err_load}</p>
		{:else}
			<p class="t-muted">{$m.common_loading_ellipsis}</p>
		{/if}
	{:else}
		<div class="t-facts">
			<div class="t-fact">
				<span class="t-label">{$m.testing_state_label}</span>
				<span class="t-value">{info.enabled ? $m.testing_state_on : $m.testing_state_off}</span>
			</div>
			<div class="t-fact">
				<span class="t-label">{$m.testing_account_label}</span>
				<span class="t-value">{info.username ?? $m.testing_account_none}</span>
			</div>
		</div>
		<p class="t-muted">{$m.testing_counts(info.projects, info.volumes)}</p>

		{#if error}
			<p class="t-error" role="alert">{error}</p>
		{:else if cleared}
			<p class="t-muted" role="status">
				{$m.testing_cleared(cleared.projects, cleared.volumes)}
				{#if cleared.skipped > 0}{' '}{$m.testing_cleared_skipped(cleared.skipped)}{/if}
			</p>
		{:else if saved}
			<p class="t-muted" role="status">{$m.testing_saved}</p>
		{/if}

		{#if !hasAccount && !info.enabled}
			<form class="t-form" onsubmit={submit(createAndSwitchOn)} novalidate>
				<div class="t-field">
					<label class="t-label" for="testing-username">{$m.testing_username_label}</label>
					<input
						id="testing-username"
						class="t-input"
						type="text"
						autocomplete="username"
						autocapitalize="none"
						spellcheck="false"
						bind:value={username}
						disabled={busy}
					/>
				</div>
				<div class="t-field">
					<label class="t-label" for="testing-password">{$m.testing_password_label}</label>
					<input
						id="testing-password"
						class="t-input"
						type="password"
						autocomplete="new-password"
						bind:value={password}
						disabled={busy}
					/>
				</div>
				<div class="t-field">
					<label class="t-label" for="testing-expiry">{$m.testing_expiry_label}</label>
					<input
						id="testing-expiry"
						class="t-input t-input-short"
						type="text"
						inputmode="numeric"
						autocomplete="off"
						bind:value={days}
						disabled={busy}
						aria-describedby="testing-expiry-hint"
					/>
					<span class="t-muted" id="testing-expiry-hint">{$m.testing_expiry_hint}</span>
				</div>
				<div class="t-actions">
					<button type="submit" class="t-btn-save" disabled={busy}>{$m.testing_switch_on}</button>
				</div>
			</form>
		{/if}

		{#if hasAccount && !confirmingOff && !confirmingClear}
			<form class="t-form" onsubmit={submit(saveTerm)} novalidate>
				<div class="t-field">
					<label class="t-label" for="testing-expiry">{$m.testing_expiry_label}</label>
					<input
						id="testing-expiry"
						class="t-input t-input-short"
						type="text"
						inputmode="numeric"
						autocomplete="off"
						bind:value={days}
						disabled={busy}
						aria-describedby="testing-expiry-hint"
					/>
					<span class="t-muted" id="testing-expiry-hint">{$m.testing_expiry_hint}</span>
				</div>
				<div class="t-actions">
					<button type="submit" class="t-btn-ghost" disabled={busy}>{$m.testing_term_save}</button>
				</div>
			</form>

			{#if !info.enabled}
				<div class="t-actions">
					<button
						type="button"
						class="t-btn-save"
						bind:this={switchOnBtn}
						onclick={switchOn}
						disabled={busy}>{$m.testing_switch_on}</button
					>
				</div>
			{/if}

			<form class="t-form" onsubmit={submit(rename)} novalidate>
				<div class="t-field">
					<label class="t-label" for="testing-new-username">{$m.testing_new_username_label}</label>
					<input
						id="testing-new-username"
						class="t-input"
						type="text"
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
						bind:value={newUsername}
						disabled={busy}
					/>
				</div>
				<div class="t-actions">
					<button type="submit" class="t-btn-ghost" disabled={busy}>{$m.testing_rename}</button>
				</div>
			</form>

			<form class="t-form" onsubmit={submit(setPassword)} novalidate>
				<div class="t-field">
					<label class="t-label" for="testing-account-username">{$m.testing_account_label}</label>
					<input
						id="testing-account-username"
						class="t-input"
						type="text"
						autocomplete="username"
						readonly
						value={info.username ?? ''}
					/>
				</div>
				<div class="t-field">
					<label class="t-label" for="testing-new-password">{$m.testing_new_password_label}</label>
					<input
						id="testing-new-password"
						class="t-input"
						type="password"
						autocomplete="new-password"
						bind:value={newPassword}
						disabled={busy}
					/>
					<span class="t-muted">{$m.testing_password_signout}</span>
				</div>
				<div class="t-actions">
					<button type="submit" class="t-btn-ghost" disabled={busy}
						>{$m.testing_password_set}</button
					>
				</div>
			</form>
		{/if}

		{#if !confirmingOff && !confirmingClear}
			<form class="t-form" onsubmit={submit(saveReserve)} novalidate>
				<div class="t-field">
					<label class="t-label" for="testing-reserve">{$m.testing_reserve_label}</label>
					<input
						id="testing-reserve"
						class="t-input t-input-short"
						type="text"
						inputmode="numeric"
						autocomplete="off"
						bind:value={reserve}
						disabled={busy}
						aria-describedby="testing-reserve-hint testing-reserve-free"
					/>
					<span class="t-muted" id="testing-reserve-hint">{$m.testing_reserve_hint}</span>
					<span class="t-muted" id="testing-reserve-free">{freeText(info.free_gb)}</span>
				</div>
				<div class="t-actions">
					<button type="submit" class="t-btn-ghost" disabled={busy}
						>{$m.testing_reserve_save}</button
					>
				</div>
			</form>
		{/if}

		{#if confirmingClear}
			<div
				class="t-notice"
				role="group"
				aria-label={$m.testing_clear}
				aria-describedby="testing-clear-text"
			>
				<p class="t-notice-line" id="testing-clear-text">{$m.testing_clear_confirm_text}</p>
				<div class="t-actions">
					<button
						type="button"
						class="t-btn-ghost"
						bind:this={clearCancelBtn}
						onclick={cancelClear}
						disabled={busy}>{$m.common_cancel}</button
					>
					<button type="button" class="t-btn-danger" onclick={clearSpace} disabled={busy}
						>{$m.testing_clear_confirm}</button
					>
				</div>
			</div>
		{:else if !confirmingOff}
			<div class="t-actions">
				<button
					type="button"
					class="t-btn-danger"
					bind:this={clearBtn}
					onclick={askClear}
					disabled={busy}>{$m.testing_clear}</button
				>
			</div>
		{/if}

		{#if info.enabled && !confirmingClear}
			{#if confirmingOff}
				<div
					class="t-notice"
					role="group"
					aria-label={$m.testing_switch_off}
					aria-describedby="testing-off-text"
				>
					<p class="t-notice-line" id="testing-off-text">{$m.testing_off_confirm_text}</p>
					<div class="t-actions">
						<button
							type="button"
							class="t-btn-ghost"
							bind:this={cancelBtn}
							onclick={cancelSwitchOff}
							disabled={busy}>{$m.common_cancel}</button
						>
						<button type="button" class="t-btn-danger" onclick={switchOff} disabled={busy}
							>{$m.testing_off_confirm}</button
						>
					</div>
				</div>
			{:else}
				<div class="t-actions">
					<button
						type="button"
						class="t-btn-danger"
						bind:this={switchOffBtn}
						onclick={askSwitchOff}
						disabled={busy}>{$m.testing_switch_off}</button
					>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	/* The tokens and shapes of FisquaLinkCard, beside it on the same page. */
	.t-desc {
		margin: -6px 0 14px;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.5;
		max-width: 760px;
	}

	.t-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 860px;
	}

	.t-muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.45;
	}
	.t-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-error);
		line-height: 1.45;
	}

	.t-facts {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
	}
	.t-fact {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.t-value {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-bold);
	}
	.t-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.t-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.t-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 420px;
	}
	.t-input {
		min-height: var(--touch-target-min);
		padding: 0 12px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-alt-2);
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: var(--text-base);
	}
	.t-input-short {
		max-width: 120px;
	}

	.t-notice {
		padding: 14px 16px;
		border-radius: var(--radius-md);
		background-color: var(--color-error-bg);
		border: 1px solid rgba(214, 103, 74, 0.45);
		color: var(--color-light);
		font-size: var(--text-sm);
		line-height: 1.45;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.t-notice-line {
		margin: 0;
	}

	.t-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-top: 4px;
	}

	.t-btn-save {
		min-height: var(--touch-target-min);
		padding: 0 22px;
		border: 0;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		color: white;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		cursor: pointer;
		transition: background-color var(--transition-base);
	}
	.t-btn-save:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}
	.t-btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.t-btn-ghost {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		padding: 0 18px;
		background: none;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		color: var(--color-light-grey);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.t-btn-ghost:hover:not(:disabled) {
		color: var(--color-light);
		border-color: rgba(255, 255, 255, 0.2);
	}
	.t-btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.t-btn-danger {
		min-height: var(--touch-target-min);
		padding: 0 18px;
		background: none;
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		color: var(--color-error);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		cursor: pointer;
	}
	.t-btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

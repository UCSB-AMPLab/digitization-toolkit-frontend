<script module lang="ts">
	// How long the card waits for the restarted backend after outcome `restarting`.
	export const OFFSITE_RESTART_WAIT_MS = 5 * 60_000;
</script>

<script lang="ts">
	// Settings → Offsite copy → Offsite settings (NEH-341), admin only as the
	// section is. The administrator brings the unit's bucket, key and catalog
	// public key in one of two ways: captua-offsite.txt at the top level of a
	// USB stick mounted directly under the mounts base (MOUNTS_BASE, the
	// backend's _MOUNT_BASE; the drives come from the list the Storage section
	// reads), or the five values typed into a form. The template to fill in is
	// a download from GET /system/offsite/template.
	//
	// The card shows the saved values from GET /system/offsite, which never
	// carries the application key. Every read of it takes the next number
	// (readSeq), and a save takes one too: an answer is applied only when its
	// read is still the latest, so a read sent before a save, or before a
	// later read, never replaces what came after it. Every save, however it
	// ends (`unchanged`, `restart_needed`, any refusal, a network failure or a
	// timeout, or the restart wait running out), ends with a fresh read
	// (readSettings), except outcome `restarting`, whose restart wait reads;
	// an unmount starts none. Each save is one POST that can take
	// minutes (the bucket is listed, the schedulers stopped and the
	// provisioning script run); while it runs the card says so and every
	// action is disabled. A refusal is shown from its code, never from the
	// backend's English (refusalText); a field code names the field by its
	// label, a line code the line of the file. After an import the card says
	// what became of the file on the stick.
	//
	// The replace checkbox appears when the key id typed differs from the
	// unit's, and after a `replace_required` or `saved_credential_unusable`
	// refusal of either action (the second can come with the same key id,
	// whose stored application key is the one to replace).
	//
	// When GET answers `restartRequired` (a provisioning run may have changed
	// the settings the backend read, and the unit has not restarted since), or
	// a save answers `restart_needed`, the card says to restart the unit in
	// place of the three actions, and no save is sent, until a GET answers
	// `restartRequired` false.
	//
	// After outcome `restarting` the backend restarts: as the Fisqua link
	// card does, the card keeps saying so and reads GET every `pollMs`
	// (pollPairing) until an answer comes from a process whose settings are
	// current (`restartRequired` false), then shows its values. The wait is
	// bounded at `restartWaitMs` (OFFSITE_RESTART_WAIT_MS, five minutes): with
	// no such answer by then the polling stops and the card says to restart
	// the unit, in place of the actions, as when GET answers `restartRequired`.
	//
	// The application key lives in the form's field only: it is sent in the
	// POST body and nowhere else, never logged or stored, and the field is
	// emptied after every answer, saved or refused. When the card is
	// unmounted, the key is cleared at once and a save still running is
	// aborted (its AbortController is passed to the request).
	//
	// Version: 0.4.0

	import { onMount } from 'svelte';
	import { m } from '$lib/i18n';
	import type { Messages } from '$lib/i18n';
	import {
		ApiError,
		systemApi,
		type OffsiteSaveResult,
		type OffsiteSettings,
		type StorageDevice
	} from '$lib/api';
	import { PAIRING_POLL_MS, pollPairing } from '$lib/fisqua-pairing';

	let {
		pollMs = PAIRING_POLL_MS,
		restartWaitMs = OFFSITE_RESTART_WAIT_MS
	}: { pollMs?: number; restartWaitMs?: number } = $props();

	const MOUNTS_BASE = '/var/lib/dtk/mounts';

	// The file's keys, which a field refusal names, and the label of each.
	const FIELD_LABELS: Record<string, keyof Messages> = {
		BUCKET_NAME: 'offsite_set_bucket',
		APPLICATION_KEY_ID: 'offsite_set_key_id',
		APPLICATION_KEY: 'offsite_set_app_key',
		TENANT: 'offsite_set_tenant',
		CATALOGUE_PUBLIC_KEY: 'offsite_set_public_key'
	};

	const FIELD_CODES = {
		duplicate_key: 'offsite_err_duplicate',
		missing_key: 'offsite_err_missing',
		empty_value: 'offsite_err_empty',
		bad_value: 'offsite_err_bad_value'
	} as const;

	const LINE_CODES = {
		bad_line: 'offsite_err_bad_line',
		unknown_key: 'offsite_err_unknown_key'
	} as const;

	const CODE_TEXT: Record<string, keyof Messages> = {
		busy_capturing: 'offsite_err_busy',
		offsite_job_running: 'offsite_err_busy',
		offsite_save_running: 'offsite_err_busy',
		uploads_still_running: 'offsite_err_busy',
		offsite_jobs_still_running: 'offsite_err_busy',
		pairing_running: 'offsite_err_pairing',
		restart_required: 'offsite_err_restart_first',
		apply_unverified: 'offsite_err_unverified',
		settings_overridden: 'offsite_err_overridden',
		fisqua_linked: 'offsite_err_fisqua',
		no_memory_directory: 'offsite_err_unit_not_ready',
		rclone_missing: 'offsite_err_unit_not_ready',
		script_missing: 'offsite_err_unit_not_ready',
		script_too_old: 'offsite_err_unit_not_ready',
		offsite_held: 'offsite_err_held',
		other_tenant: 'offsite_err_other_tenant',
		replace_required: 'offsite_err_replace',
		listing_failed: 'offsite_set_err_listing',
		saved_credential_unusable: 'offsite_err_saved_key_unusable',
		apply_failed: 'offsite_err_not_saved',
		not_a_drive: 'offsite_err_not_a_drive',
		file_missing: 'offsite_err_file_missing',
		file_not_regular: 'offsite_err_file_not_settings',
		file_not_text: 'offsite_err_file_not_settings',
		file_too_large: 'offsite_err_file_not_settings',
		file_unreadable: 'offsite_err_file_unreadable',
		file_not_deletable: 'offsite_err_file_not_deletable'
	};

	type Detail = { code?: unknown; key?: unknown; line?: unknown; stickFile?: unknown };

	function detailOf(err: unknown): Detail {
		if (!(err instanceof ApiError)) return {};
		const d = err.detail;
		return typeof d === 'object' && d !== null ? (d as Detail) : {};
	}

	function refusalText(d: Detail, t: Messages): string {
		const code = typeof d.code === 'string' ? d.code : '';
		if (code in LINE_CODES) {
			const line = d.line;
			return typeof line === 'number' && Number.isInteger(line)
				? t[LINE_CODES[code as keyof typeof LINE_CODES]](line)
				: t.offsite_err_other;
		}
		if (code in FIELD_CODES) {
			const label = typeof d.key === 'string' ? FIELD_LABELS[d.key] : undefined;
			return label
				? t[FIELD_CODES[code as keyof typeof FIELD_CODES]](t[label] as string)
				: t.offsite_err_other;
		}
		const key = CODE_TEXT[code];
		return key ? (t[key] as string) : t.offsite_err_other;
	}

	// A drive mounted directly under the mounts base: the only place the backend reads a stick.
	function isStick(d: StorageDevice): d is StorageDevice & { mountpoint: string } {
		const mp = d.mountpoint;
		if (!mp || !mp.startsWith(MOUNTS_BASE + '/')) return false;
		const name = mp.slice(MOUNTS_BASE.length + 1);
		return name.length > 0 && !name.includes('/');
	}

	let current = $state<OffsiteSettings | null>(null);
	let readFailed = $state(false);
	let drives = $state<(StorageDevice & { mountpoint: string })[]>([]);
	let drive = $state('');

	let formOpen = $state(false);
	let bucketName = $state('');
	let applicationKeyId = $state('');
	let applicationKey = $state('');
	let tenant = $state('');
	let cataloguePublicKey = $state('');

	let replace = $state(false);
	// A `replace_required` or `saved_credential_unusable` refusal came back: the checkbox stays until a save succeeds.
	let replaceAsked = $state(false);

	let saving = $state(false);
	let outcome = $state<OffsiteSaveResult['outcome'] | null>(null);
	let stickFile = $state<'deleted' | 'not_deleted' | 'kept' | null>(null);
	let refusal = $state<Detail | null>(null);
	// From outcome `restarting` until GET answers from the restarted backend.
	let restarting = $state(false);
	// The wait ended at its bound with no answer from the restarted backend,
	// or a save answered `restart_needed`: the unit must restart first.
	let restartFirst = $state(false);

	let alive = true;
	let stopWait: (() => void) | null = null;
	let waitTimer: ReturnType<typeof setTimeout> | null = null;
	// The save in flight, aborted on unmount.
	let pending: AbortController | null = null;
	// The number of the latest read of GET /system/offsite; a save raises it too.
	let readSeq = 0;
	let keyInput = $state<HTMLInputElement | undefined>(undefined);

	let showReplace = $derived(
		replaceAsked ||
			(formOpen &&
				!!current?.applicationKeyId &&
				applicationKeyId.trim() !== '' &&
				applicationKeyId.trim() !== current.applicationKeyId)
	);
	let busy = $derived(saving || restarting);
	// GET says the unit must restart first, or the wait after `restarting` ran out.
	let mustRestart = $derived((!!current?.restartRequired || restartFirst) && !restarting);

	onMount(() => {
		readSettings();
		systemApi
			.getStorageDevices()
			.then((list) => {
				if (!alive) return;
				drives = list.filter(isStick);
				drive = drives[0]?.mountpoint ?? '';
			})
			.catch(() => {
				// No list: no drive to offer.
			});
		return () => {
			alive = false;
			applicationKey = '';
			if (keyInput) keyInput.value = '';
			pending?.abort();
			pending = null;
			endWait();
		};
	});

	// A read of GET /system/offsite whose answer applies only while it is the latest read.
	function readSettings() {
		const seq = ++readSeq;
		systemApi
			.getOffsite()
			.then((s) => {
				if (alive && seq === readSeq) {
					current = s;
					readFailed = false;
					if (!s.restartRequired) restartFirst = false;
				}
			})
			.catch(() => {
				if (alive && seq === readSeq) readFailed = true;
			});
	}

	function endWait() {
		stopWait?.();
		stopWait = null;
		if (waitTimer) clearTimeout(waitTimer);
		waitTimer = null;
	}

	function waitForRestart() {
		restarting = true;
		restartFirst = false;
		waitTimer = setTimeout(() => {
			if (!alive || !restarting) return;
			endWait();
			restarting = false;
			outcome = null;
			restartFirst = true;
			readSettings();
		}, restartWaitMs);
		stopWait = pollPairing({
			intervalMs: pollMs,
			read: async (signal) => {
				const seq = ++readSeq;
				const next = await systemApi.getOffsite(signal);
				if (!alive || !restarting || seq !== readSeq || next.restartRequired) return;
				current = next;
				readFailed = false;
				restartFirst = false;
				restarting = false;
				outcome = null;
				endWait();
			}
		});
	}

	async function run(
		call: (signal: AbortSignal) => Promise<OffsiteSaveResult>,
		fromStick: boolean
	) {
		const ctrl = new AbortController();
		pending = ctrl;
		// A read sent before the save no longer applies.
		readSeq += 1;
		saving = true;
		outcome = null;
		stickFile = null;
		refusal = null;
		try {
			const result = await call(ctrl.signal);
			if (!alive) return;
			outcome = result.outcome;
			stickFile = fromStick ? result.stickFile : null;
			replaceAsked = false;
			replace = false;
			if (result.outcome === 'restarting') waitForRestart();
			if (result.outcome === 'restart_needed') restartFirst = true;
		} catch (err) {
			if (!alive) return;
			const d = detailOf(err);
			refusal = d;
			stickFile = fromStick && d.stickFile === 'kept' ? 'kept' : null;
			if (d.code === 'replace_required' || d.code === 'saved_credential_unusable')
				replaceAsked = true;
		} finally {
			if (pending === ctrl) pending = null;
			applicationKey = '';
			saving = false;
			// The save invalidated any read in flight; `restarting` reads in its wait.
			if (alive && !restarting) readSettings();
		}
	}

	function importStick() {
		if (!drive || busy || mustRestart) return;
		const withReplace = showReplace && replace;
		const mountpoint = drive;
		run((signal) => systemApi.importOffsite(mountpoint, withReplace, signal), true);
	}

	function saveForm(e: SubmitEvent) {
		e.preventDefault();
		if (busy || mustRestart) return;
		const body = {
			bucketName,
			applicationKeyId,
			applicationKey,
			tenant,
			cataloguePublicKey,
			replace: showReplace && replace
		};
		run((signal) => systemApi.saveOffsite(body, signal), false);
	}

	let values = $derived(
		current?.configured
			? [
					{ label: $m.offsite_set_bucket, value: current.bucketName },
					{ label: $m.offsite_set_tenant, value: current.tenant },
					{ label: $m.offsite_set_key_id, value: current.applicationKeyId },
					{ label: $m.offsite_set_public_key, value: current.cataloguePublicKey }
				]
			: []
	);

	// After `restart_needed` the line is the one shown in place of the actions (mustRestart).
	let outcomeText = $derived(
		restarting || outcome === 'restarting'
			? $m.offsite_set_saved_restarting
			: outcome === 'unchanged'
				? $m.offsite_set_unchanged
				: null
	);

	let stickText = $derived(
		stickFile === 'deleted'
			? $m.offsite_set_stick_deleted
			: stickFile === 'not_deleted'
				? $m.offsite_set_stick_not_deleted
				: stickFile === 'kept'
					? $m.offsite_set_stick_kept
					: null
	);
</script>

<div class="os-card" data-offsite-settings>
	<h3 class="os-title">{$m.offsite_set_title}</h3>
	<p class="os-muted">{$m.offsite_set_desc}</p>

	{#if current}
		{#if values.length}
			<dl class="os-values">
				{#each values as row (row.label)}
					<div class="os-value">
						<dt class="os-label">{row.label}</dt>
						<dd class="os-mono">{row.value ?? '—'}</dd>
					</div>
				{/each}
			</dl>
		{:else}
			<p class="os-line">{$m.offsite_set_none}</p>
		{/if}
	{:else if readFailed}
		<p class="os-error">{$m.api_request_failed}</p>
	{:else}
		<p class="os-muted">{$m.common_loading_ellipsis}</p>
	{/if}
	<p class="os-muted">{$m.offsite_set_key_note}</p>

	{#if mustRestart}
		<p class="os-line" role="status">{$m.offsite_set_saved_restart_needed}</p>
	{:else}
		<div class="os-block">
			<p class="os-subtitle">{$m.offsite_set_import}</p>
			<p class="os-muted">{$m.offsite_set_import_desc}</p>
			{#if drives.length}
				<div class="os-field">
					<label class="os-label" for="offsite-drive">{$m.offsite_set_choose_drive}</label>
					<select id="offsite-drive" class="os-input" bind:value={drive} disabled={busy}>
						{#each drives as d (d.mountpoint)}
							<option value={d.mountpoint}>{d.label ?? d.name} ({d.size})</option>
						{/each}
					</select>
				</div>
			{:else}
				<p class="os-line">{$m.offsite_set_no_drive}</p>
			{/if}
			<div class="os-actions">
				<button
					type="button"
					class="os-btn-save"
					onclick={importStick}
					disabled={busy || !drives.length}>{$m.offsite_set_import}</button
				>
				<a class="os-btn-ghost" href={systemApi.offsiteTemplateUrl()} download
					>{$m.offsite_set_template}</a
				>
			</div>
		</div>

		<div class="os-block">
			{#if !formOpen}
				<div class="os-actions">
					<button
						type="button"
						class="os-btn-ghost"
						onclick={() => (formOpen = true)}
						disabled={busy}>{$m.offsite_set_enter}</button
					>
				</div>
			{:else}
				<p class="os-subtitle">{$m.offsite_set_enter}</p>
				<form class="os-form" onsubmit={saveForm} autocomplete="off">
					<div class="os-field">
						<label class="os-label" for="offsite-bucket">{$m.offsite_set_bucket}</label>
						<input
							id="offsite-bucket"
							class="os-input"
							type="text"
							autocomplete="off"
							spellcheck="false"
							bind:value={bucketName}
							disabled={busy}
						/>
					</div>
					<div class="os-field">
						<label class="os-label" for="offsite-key-id">{$m.offsite_set_key_id}</label>
						<input
							id="offsite-key-id"
							class="os-input"
							type="text"
							autocomplete="off"
							spellcheck="false"
							bind:value={applicationKeyId}
							disabled={busy}
						/>
					</div>
					<div class="os-field">
						<label class="os-label" for="offsite-app-key">{$m.offsite_set_app_key}</label>
						<input
							id="offsite-app-key"
							class="os-input"
							type="password"
							autocomplete="off"
							spellcheck="false"
							bind:value={applicationKey}
							bind:this={keyInput}
							disabled={busy}
						/>
					</div>
					<div class="os-field">
						<label class="os-label" for="offsite-tenant">{$m.offsite_set_tenant}</label>
						<input
							id="offsite-tenant"
							class="os-input"
							type="text"
							autocomplete="off"
							spellcheck="false"
							bind:value={tenant}
							disabled={busy}
						/>
					</div>
					<div class="os-field">
						<label class="os-label" for="offsite-public-key">{$m.offsite_set_public_key}</label>
						<input
							id="offsite-public-key"
							class="os-input"
							type="text"
							autocomplete="off"
							spellcheck="false"
							bind:value={cataloguePublicKey}
							disabled={busy}
						/>
					</div>
					<div class="os-actions">
						<button type="submit" class="os-btn-save" disabled={busy}>{$m.offsite_set_save}</button>
					</div>
				</form>
			{/if}
		</div>

		{#if showReplace}
			<label class="os-replace">
				<input type="checkbox" bind:checked={replace} disabled={busy} />
				<span>
					<span class="os-line">{$m.offsite_set_replace}</span>
					<span class="os-muted os-replace-desc">{$m.offsite_set_replace_desc}</span>
				</span>
			</label>
		{/if}
	{/if}

	<div aria-live="polite">
		{#if saving}
			<p class="os-line">{$m.offsite_set_saving}</p>
		{/if}
		{#if outcomeText}
			<p class="os-line os-ok">{outcomeText}</p>
		{/if}
		{#if refusal}
			<p class="os-error" role="alert">{refusalText(refusal, $m)}</p>
		{/if}
		{#if stickText}
			<p class="os-line">{stickText}</p>
		{/if}
	</div>
</div>

<style>
	/* The tokens and shapes of FisquaLinkCard and CatalogueBackupCard, on the same page. */
	.os-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 860px;
		margin-bottom: 16px;
	}

	.os-title {
		margin: 0;
		font-size: var(--text-lead);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.os-subtitle {
		margin: 0;
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.os-line {
		margin: 0;
		font-size: var(--text-base);
		color: var(--color-light);
		line-height: 1.45;
	}
	.os-ok {
		font-weight: var(--fw-bold);
	}
	.os-muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.45;
		max-width: 760px;
	}
	.os-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-error);
		line-height: 1.45;
	}

	.os-values {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px 24px;
	}
	.os-value {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.os-value dd {
		margin: 0;
	}
	.os-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.os-mono {
		font-family: monospace;
		font-size: var(--text-sm);
		color: var(--color-light);
		overflow-wrap: anywhere;
	}

	.os-block {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px solid var(--border-color);
	}

	.os-form {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.os-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 520px;
	}
	.os-input {
		min-height: var(--touch-target-min);
		padding: 0 12px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-alt-2);
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: var(--text-base);
	}

	.os-replace {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		cursor: pointer;
	}
	.os-replace input {
		margin-top: 4px;
	}
	.os-replace-desc {
		display: block;
	}

	.os-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		padding-top: 4px;
	}

	.os-btn-save {
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
	.os-btn-save:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}
	.os-btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.os-btn-ghost {
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
		text-decoration: none;
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.os-btn-ghost:hover:not(:disabled) {
		color: var(--color-light);
		border-color: rgba(255, 255, 255, 0.2);
	}
	.os-btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>

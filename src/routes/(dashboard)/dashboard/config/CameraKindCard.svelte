<script lang="ts">
	// Settings > Cameras (NEH-252, NEH-348): which kind of camera Captua uses
	// on this unit (GET /system/camera-kind, read into the shared store of
	// lib/camera-kind.ts) and why, one sentence per source; the cameras
	// connected now of each kind, "not known" for a count that could not be
	// measured; and the notice for cameras of another kind or of two kinds.
	//
	// The administrator also chooses the kind: the three kinds, a kind whose
	// driver the unit lacks disabled with the reason, and "By the cameras that
	// are connected", which clears the stored choice (DELETE). Save is
	// enabled only for a change. A choice that restarts Captua (any kind
	// other than the one in effect; that choice while a stored choice is in
	// effect, app/api/system.py) asks first. On `restarting`
	// PowerControl's restart overlay takes over: it waits for /health and
	// reloads the page. On `restart_needed` the card says the unit has to be
	// restarted and offers PowerControl's restart. While a restart is
	// pending, "Restart now" sends the stored choice again (or the DELETE).
	// A refusal (409) gets the sentence for its code; the backend's English
	// is never shown.
	//
	// Operators and reviewers see the facts and no control. A backend
	// without the route (404) shows nothing.
	//
	// Version: 0.4.0

	import { onMount } from 'svelte';
	import { m } from '$lib/i18n';
	import { cameraKindApi, type CameraKindChange } from '$lib/api';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import { authStore } from '$lib/stores/auth';
	import { opensUnitSettings } from '$lib/unit-mode';
	import {
		CAMERA_KINDS,
		cameraKind,
		choiceRestarts,
		sameKindReport,
		kindName,
		kindRefusal,
		kindRefusalText,
		loadCameraKind,
		readCameraKindNow,
		sourceText,
		type CameraKind
	} from '$lib/camera-kind';
	import PowerControl from '$lib/components/PowerControl.svelte';
	import CameraKindNotice from '$lib/components/CameraKindNotice.svelte';

	type Choice = CameraKind | 'follow';
	const CHOICES: Choice[] = [...CAMERA_KINDS, 'follow'];

	let canChoose = $derived(opensUnitSettings($authStore.user?.role ?? null));
	let report = $derived($cameraKind.status === 'ready' ? $cameraKind.report : null);
	let storedChoice = $derived<Choice | null>(report ? (report.stored ?? 'follow') : null);

	// The person's pick; null shows the stored choice.
	let picked = $state<Choice | null>(null);
	let selected = $derived(picked ?? storedChoice);
	let saving = $state(false);
	// The choice waiting for the confirmation.
	let confirming = $state<Choice | null>(null);
	let refusal = $state<string | null>(null);
	// The read at Save or "Restart now" failed: nothing was sent.
	let readFailed = $state(false);
	let restartNeeded = $state(false);
	let power = $state<ReturnType<typeof PowerControl> | undefined>(undefined);
	let powerError = $state<string | null>(null);

	let canSave = $derived(!saving && selected !== null && selected !== storedChoice);

	onMount(() => {
		loadCameraKind();
	});

	// Save and "Restart now" decide from the kind as it is at that moment:
	// the report is read afresh first. When it differs from the one on
	// screen (another tab, a restart), the card shows the new one and sends
	// nothing; the person presses again against what is now shown. Otherwise
	// the request is confirmed first when it restarts Captua
	// (choiceRestarts), and sent at once when it does not. When that read
	// fails, nothing is sent and the card says Captua could not read the kind
	// (readCameraKindNow never answers with a report read before).
	async function ask(what: 'save' | 'restart-now') {
		if (saving) return;
		refusal = null;
		readFailed = false;
		const shown = report;
		saving = true;
		const fresh = await readCameraKindNow();
		saving = false;
		// Without an answer read now, nothing is sent: the one on screen may be out of date.
		if (!fresh) {
			readFailed = true;
			return;
		}
		if (!sameKindReport(shown, fresh)) return;
		const choice: Choice | null =
			what === 'save' ? selected : fresh.pendingRestart ? (fresh.stored ?? 'follow') : null;
		if (choice === null) return;
		if (choiceRestarts(fresh, choice)) confirming = choice;
		else send(choice);
	}

	async function send(choice: Choice) {
		confirming = null;
		saving = true;
		refusal = null;
		let answer: CameraKindChange;
		try {
			answer = choice === 'follow' ? await cameraKindApi.clear() : await cameraKindApi.set(choice);
		} catch (error) {
			refusal = kindRefusal(error) ?? 'other';
			saving = false;
			return;
		}
		if (answer.restart === 'restarting') {
			// The overlay stays until the page reloads.
			power?.awaitRestart();
			return;
		}
		restartNeeded = answer.restart === 'restart_needed';
		await loadCameraKind({ fresh: true });
		picked = null;
		saving = false;
	}

	const optionName = (choice: Choice) =>
		choice === 'follow' ? $m.camera_kind_follow : kindName(choice, $m);
</script>

<div class="kind" data-kind-state={$cameraKind.status}>
	{#if $cameraKind.status === 'failed'}
		<p class="kind-error" role="alert">{$m.camera_kind_err_load}</p>
	{:else if report}
		<p class="kind-desc">{$m.camera_kind_desc}</p>
		<div class="kind-card">
			<div class="kind-row" data-kind-in-use>
				<span class="kind-label">{$m.camera_kind_in_use}</span>
				<span class="kind-value">{kindName(report.configured, $m)}</span>
				{#if sourceText(report.source, $m)}
					<span class="kind-note">{sourceText(report.source, $m)}</span>
				{/if}
			</div>
			<div class="kind-row" data-kind-connected>
				<span class="kind-label">{$m.camera_kind_connected}</span>
				<ul class="kind-counts">
					{#each CAMERA_KINDS as kind (kind)}
						<li>
							<span>{kindName(kind, $m)}</span>
							<span class="kind-count"
								>{report.connected[kind] ?? $m.camera_kind_count_unknown}</span
							>
						</li>
					{/each}
				</ul>
			</div>
			<CameraKindNotice action={false} />

			{#if report.pendingRestart && !restartNeeded}
				<div class="kind-pending" role="status">
					<span
						>{report.stored
							? $m.camera_kind_pending(kindName(report.stored, $m))
							: $m.camera_kind_pending_follow}</span
					>
					{#if canChoose}
						<button
							type="button"
							class="kind-btn-ghost"
							disabled={saving}
							onclick={() => ask('restart-now')}>{$m.camera_kind_restart_now}</button
						>
					{/if}
				</div>
			{/if}
		</div>

		{#if canChoose}
			<div class="kind-card">
				<fieldset class="kind-options">
					<legend class="kind-legend">{$m.camera_kind_choose_legend}</legend>
					{#each CHOICES as choice (choice)}
						{@const lacks = choice !== 'follow' && !report.available[choice]}
						<label
							class="kind-option"
							class:is-selected={selected === choice}
							class:is-disabled={lacks}
						>
							<input
								type="radio"
								name="camera-kind"
								value={choice}
								checked={selected === choice}
								disabled={saving || lacks}
								onchange={() => (picked = choice)}
							/>
							<span class="kind-option-text">
								<span class="kind-option-name">{optionName(choice)}</span>
								{#if lacks}
									<span class="kind-option-desc">{$m.camera_kind_lacks_driver}</span>
								{:else if choice === 'follow'}
									<span class="kind-option-desc">{$m.camera_kind_follow_desc}</span>
								{/if}
							</span>
						</label>
					{/each}
				</fieldset>

				{#if refusal}
					<p class="kind-error" role="alert">{kindRefusalText(refusal, $m)}</p>
				{/if}
				{#if readFailed}
					<p class="kind-error" role="alert">{$m.camera_kind_err_load}</p>
				{/if}
				{#if restartNeeded}
					<div class="kind-pending" role="status">
						<span>{$m.camera_kind_restart_needed}</span>
						<button type="button" class="kind-btn-ghost" onclick={() => power?.ask('reboot')}
							>{$m.config_reboot_btn}</button
						>
					</div>
					{#if powerError}
						<p class="kind-error" role="alert">{powerError}</p>
					{/if}
				{/if}
				<div class="kind-actions">
					<button
						type="button"
						class="kind-btn-save"
						disabled={!canSave}
						onclick={() => ask('save')}
					>
						{saving ? $m.common_saving : $m.common_save}
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

{#if confirming}
	<div class="modal-backdrop" use:toBody use:dismissible={{ onDismiss: () => (confirming = null) }}>
		<div
			class="modal-card dialog-fit"
			role="dialog"
			aria-modal="true"
			aria-labelledby="camera-kind-confirm-title"
			aria-describedby="camera-kind-confirm-desc"
			use:trapFocus
		>
			<h3 class="confirm-title" id="camera-kind-confirm-title">{$m.camera_kind_confirm_title}</h3>
			<p class="confirm-desc" id="camera-kind-confirm-desc">{$m.camera_kind_confirm_body}</p>
			<div class="modal-actions">
				<button type="button" class="kind-btn-ghost" onclick={() => (confirming = null)}
					>{$m.common_cancel}</button
				>
				<button type="button" class="kind-btn-save" onclick={() => confirming && send(confirming)}
					>{$m.camera_kind_confirm_btn}</button
				>
			</div>
		</div>
	</div>
{/if}

{#if canChoose}
	<PowerControl bind:this={power} onError={(message) => (powerError = message)} />
{/if}

<style>
	.kind {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 860px;
		min-width: 0;
	}
	.kind-desc {
		margin: -6px 0 2px;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.5;
	}
	.kind-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-error);
	}

	.kind-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}

	.kind-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.kind-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.kind-value {
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.kind-note {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.45;
	}
	.kind-counts {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 20px;
		font-size: var(--text-sm);
		color: var(--color-light);
	}
	.kind-counts li {
		display: flex;
		gap: 8px;
	}
	.kind-count {
		font-weight: var(--fw-bold);
	}

	.kind-pending {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		font-size: var(--text-sm);
		color: var(--color-light);
		line-height: 1.45;
	}
	.kind-pending span {
		flex: 1 1 240px;
		min-width: 0;
	}

	.kind-options {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.kind-legend {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding-bottom: 6px;
	}
	.kind-option {
		display: flex;
		gap: 14px;
		align-items: center;
		min-height: var(--touch-target-min);
		padding: 8px 14px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-color);
		background-color: var(--color-surface-alt-2);
		cursor: pointer;
		box-sizing: border-box;
	}
	.kind-option.is-selected {
		border-color: var(--color-selected);
		box-shadow: var(--selected-ring);
	}
	.kind-option.is-disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.kind-option input {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		accent-color: var(--color-selected);
		cursor: inherit;
	}
	.kind-option-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.kind-option-name {
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.kind-option-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.4;
	}

	.kind-actions {
		display: flex;
		justify-content: flex-end;
	}
	.kind-btn-save {
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
	}
	.kind-btn-save:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}
	.kind-btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.kind-btn-ghost {
		min-height: var(--touch-target-min);
		padding: 0 18px;
		background: none;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		cursor: pointer;
		flex-shrink: 0;
	}
	.kind-btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* The confirmation, as PowerControl's. */
	.modal-backdrop {
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
	.modal-card {
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 28px;
		width: 100%;
		max-width: 440px;
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.confirm-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
	}
	.confirm-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.6;
		margin: 0;
	}
	.modal-actions {
		display: flex;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border-color);
	}
	.modal-actions button {
		flex: 1;
	}
</style>

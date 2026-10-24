<script lang="ts">
	// ============================================================================
	// Freeing a volume from the card and restoring it (NEH-248): the admin's
	// button beside the volume's breadcrumb and offsite line, and its dialog.
	//
	// The layout shows it to admins only; the backend refuses all four routes to
	// anyone else (allow_admin in app/api/collections.py). Freeing starts with
	// the dry run (GET /offsite/free), which lists what would be removed and what
	// would stay, and why; a confirmed free (POST, 202) and a confirmed restore
	// (POST /offsite/restore, 202) are polled until their job ends, and the
	// result is reported. Every refusal and failure is mapped in offsite-free.ts.
	//
	// Closing the dialog while a job runs stops the polling only: the job goes on
	// in the backend, and the offsite line shows its result; the layout reloads
	// the records when the line's freed counts change. Destroying the component
	// (the layout keys it by volume) stops the polling too, and every call of
	// onChanged names the volume its job was started for.
	// ============================================================================

	import { tick } from 'svelte';
	import { collectionsApi, type FreePlan, type OffsiteJobResult, type VolumeOffsiteState } from '$lib/api';
	import { m } from '$lib/i18n';
	import {
		offsiteActionErrorText,
		offsiteOffer,
		planSummary,
		resultSummary,
		runOffsiteJob,
		type OffsiteAction
	} from '$lib/offsite-free';

	let {
		collectionId,
		offsite,
		onChanged
	}: {
		collectionId: number;
		offsite: VolumeOffsiteState;
		/** When a job ends or its polling stops, with the volume it was started for: the layout asks the offsite line again. */
		onChanged: (collectionId: number) => void;
	} = $props();

	const POLL_INTERVAL_MS = 2000;

	type Step =
		| { kind: 'menu' }
		| { kind: 'planning' }
		| { kind: 'plan'; plan: FreePlan }
		| { kind: 'confirm-restore'; files: number; bytes: number }
		| { kind: 'running'; action: 'free' | 'restore' }
		| { kind: 'done'; action: 'free' | 'restore'; result: OffsiteJobResult | null }
		| { kind: 'error'; action: OffsiteAction; text: string };

	let step = $state<Step | null>(null);
	let offer = $derived(offsiteOffer(offsite));
	let cardEl = $state<HTMLElement | null>(null);
	let buttonEl = $state<HTMLButtonElement | null>(null);
	let polling: AbortController | null = null;

	$effect(() => () => {
		polling?.abort();
		polling = null;
	});

	let planView = $derived(step?.kind === 'plan' ? planSummary(step.plan, $m) : null);
	let resultView = $derived(step?.kind === 'done' ? resultSummary(step.action, step.result, $m) : null);
	let freedLine = $derived(
		(offsite.freed_files ?? 0) > 0 ? $m.offsite_vol_freed(offsite.freed_files ?? 0, offsite.freed_bytes ?? 0) : null
	);

	async function focusCard() {
		await tick();
		cardEl?.focus();
	}

	function open() {
		step = { kind: 'menu' };
	}

	function close() {
		polling?.abort();
		polling = null;
		const wasOpen = step !== null;
		step = null;
		if (wasOpen) tick().then(() => buttonEl?.focus());
	}

	async function startPlan() {
		step = { kind: 'planning' };
		focusCard();
		try {
			const plan = await collectionsApi.planFree(collectionId);
			if (step?.kind === 'planning') step = { kind: 'plan', plan };
		} catch (error) {
			if (step?.kind === 'planning') step = { kind: 'error', action: 'plan', text: offsiteActionErrorText(error, 'plan', $m) };
		}
		focusCard();
	}

	function askRestore() {
		step = { kind: 'confirm-restore', files: offsite.freed_files ?? 0, bytes: offsite.freed_bytes ?? 0 };
		focusCard();
	}

	async function run(action: 'free' | 'restore') {
		step = { kind: 'running', action };
		focusCard();
		const forId = collectionId;
		const controller = new AbortController();
		polling = controller;
		const outcome = await runOffsiteJob(
			action,
			() => (action === 'free' ? collectionsApi.startFree(forId) : collectionsApi.startRestore(forId)),
			(jobId, signal) => collectionsApi.getOffsiteJob(forId, jobId, signal),
			{ intervalMs: POLL_INTERVAL_MS, signal: controller.signal },
			$m
		);
		if (polling === controller) polling = null;
		// A job may have changed files even when it failed part way.
		onChanged(forId);
		if (outcome.kind === 'aborted' || controller.signal.aborted) return;
		step = outcome.kind === 'done' ? { kind: 'done', action, result: outcome.result } : { kind: 'error', action, text: outcome.text };
		focusCard();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!step) return;
		if (e.key === 'Escape') {
			close();
			return;
		}
		// Keep Tab inside the dialog, as HandoverControls does.
		if (e.key === 'Tab' && cardEl) {
			const items = [...cardEl.querySelectorAll<HTMLElement>('button:not(:disabled)')];
			if (items.length === 0) {
				e.preventDefault();
				cardEl.focus();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement;
			if (e.shiftKey && (active === first || active === cardEl || !cardEl.contains(active))) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (active === last || !cardEl.contains(active))) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	function focusOnOpen(node: HTMLElement) {
		node.focus();
	}

	function errorTitle(action: OffsiteAction): string {
		return action === 'restore' ? $m.offsite_restore_action : $m.offsite_free_action;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if offer.free || offer.restore}
	<button
		class="offsite-manage-btn"
		bind:this={buttonEl}
		onclick={open}
		title={$m.offsite_manage_open}
		aria-label={$m.offsite_manage_open}
		aria-haspopup="dialog"
	>
		<span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
	</button>
{/if}

{#if step}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="offsite-dialog-backdrop"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			class="offsite-dialog-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="offsite-dialog-title"
			tabindex="-1"
			bind:this={cardEl}
			use:focusOnOpen
		>
			{#if step.kind === 'menu'}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title">{$m.offsite_manage_open}</h3>
				<p class="offsite-dialog-body">{$m.offsite_manage_intro}</p>
				{#if freedLine}
					<p class="offsite-dialog-body offsite-dialog-muted">{freedLine}</p>
				{/if}
				<div class="offsite-dialog-choices">
					{#if offer.free}
						<button class="btn btn-primary" onclick={startPlan}>{$m.offsite_free_action}</button>
					{/if}
					{#if offer.restore}
						<button class="btn btn-ghost" onclick={askRestore}>{$m.offsite_restore_action}</button>
					{/if}
				</div>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
				</div>
			{:else if step.kind === 'planning'}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title">{$m.offsite_free_action}</h3>
				<div class="offsite-dialog-wait" role="status">
					<div class="spinner" aria-hidden="true"></div>
					<p class="offsite-dialog-body">{$m.offsite_planning}</p>
				</div>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_cancel}</button>
				</div>
			{:else if step.kind === 'plan' && planView}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title">{$m.offsite_free_confirm_title}</h3>
				<p class="offsite-dialog-body">{planView.body}</p>
				{#if planView.canFree}
					<p class="offsite-dialog-body offsite-dialog-muted">{$m.offsite_plan_restore_later}</p>
				{/if}
				{#if planView.leftTitle}
					<p class="offsite-dialog-body">{planView.leftTitle}</p>
					<ul class="offsite-dialog-list">
						{#each planView.leftLines as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
				{/if}
				{#if planView.canFree}
					<p class="offsite-dialog-body offsite-dialog-muted">{$m.offsite_free_check_note}</p>
				{/if}
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{planView.canFree ? $m.common_cancel : $m.common_close}</button>
					{#if planView.canFree}
						<button class="btn btn-primary" onclick={() => run('free')}>{$m.offsite_free_confirm}</button>
					{/if}
				</div>
			{:else if step.kind === 'confirm-restore'}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title">{$m.offsite_restore_confirm_title}</h3>
				<p class="offsite-dialog-body">{$m.offsite_restore_confirm_body(step.files, step.bytes)}</p>
				<p class="offsite-dialog-body offsite-dialog-muted">{$m.offsite_restore_space_note}</p>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_cancel}</button>
					<button class="btn btn-primary" onclick={() => run('restore')}>{$m.offsite_restore_confirm}</button>
				</div>
			{:else if step.kind === 'running'}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title">
					{step.action === 'free' ? $m.offsite_free_action : $m.offsite_restore_action}
				</h3>
				<div class="offsite-dialog-wait" role="status">
					<div class="spinner" aria-hidden="true"></div>
					<p class="offsite-dialog-body">
						{step.action === 'free' ? $m.offsite_running_free : $m.offsite_running_restore}
					</p>
				</div>
				{#if step.action === 'free'}
					<p class="offsite-dialog-body offsite-dialog-muted">{$m.offsite_free_check_note}</p>
				{/if}
				<p class="offsite-dialog-body offsite-dialog-muted">{$m.offsite_running_close_note}</p>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
				</div>
			{:else if step.kind === 'done' && resultView}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title success">
					<span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
					{resultView.title}
				</h3>
				<p class="offsite-dialog-body" role="status">{resultView.body}</p>
				{#if resultView.leftTitle}
					<p class="offsite-dialog-body">{resultView.leftTitle}</p>
					<ul class="offsite-dialog-list">
						{#each resultView.leftLines as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
				{/if}
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
				</div>
			{:else if step.kind === 'error'}
				<h3 id="offsite-dialog-title" class="offsite-dialog-title error">
					<span class="material-symbols-outlined" aria-hidden="true">error</span>
					{errorTitle(step.action)}
				</h3>
				<p class="offsite-dialog-body" role="alert">{step.text}</p>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

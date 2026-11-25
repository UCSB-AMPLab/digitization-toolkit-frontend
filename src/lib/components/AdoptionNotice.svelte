<script lang="ts">
	// One serialized reader owns report reads, repair preflight, the repair POST,
	// and its confirming read. A press captures the displayed run; a POST never
	// chooses a run from a later report. Answers stay unpublished until a report
	// confirms they belong here. Authorization failures require manual Retry.

	import { onDestroy, untrack } from 'svelte';
	import { systemApi } from '$lib/api';
	import { m } from '$lib/i18n';
	import { authStore } from '$lib/stores/auth';
	import { canManageOffsite } from '$lib/unit-mode';
	import {
		noRepairLines,
		noticeReadOnChange,
		reportRead,
		reportReadError,
		repairOutcomeOf,
		repairOutcomeText,
		repairStillOffered,
		repairOutcomeFitsReport,
		type RepairOutcome,
		type NoticeReadInputs,
		type ReportRead,
		type RunningNow,
		type UnfinishedAdoption
	} from '$lib/adoption';
	import { browserScheduler, HALT, repeatRead, type Scheduler } from '$lib/repeat-read';
	// The Overview's notice frame (NEH-350): its look, and the attribute its block looks for.
	import AttentionNotice from '../../routes/(dashboard)/dashboard/AttentionNotice.svelte';

	let {
		onVolume = false,
		volumeId = null,
		named = false,
		quietRunning = false,
		onRead,
		scheduler = browserScheduler
	}: {
		/** On a volume's page: the smaller notice, and the line for other roles. */
		onVolume?: boolean;
		/** On a volume's page, the volume shown: a notice shows only for a move that names it. */
		volumeId?: number | null;
		/** The volume read says an unfinished move names it (also a journal that names no volume). */
		named?: boolean;
		/** The strip already shows this page's own move as working: no second working row. */
		quietRunning?: boolean;
		/** After each read of the report, with its result: the report, nothing unfinished, or failed. */
		onRead?: (read: ReportRead) => void;
		/** The timers of the repeated read; tests fire them by hand. */
		scheduler?: Scheduler;
	} = $props();

	let role = $derived($authStore.user?.role ?? null);
	let isAdmin = $derived(canManageOffsite(role));

	let unfinished = $state<UnfinishedAdoption | null>(null);
	// What holds the unit's adoption lock now (the report's `running`): a move, a recovery or a repair.
	let running = $state<RunningNow | null>(null);
	type Repair =
		| { phase: 'checking' | 'sending' | 'lost'; for: UnfinishedAdoption }
		| { phase: 'confirming'; for: UnfinishedAdoption; result: RepairOutcome };
	let repairState = $state.raw<Repair | null>(null);
	let outcome = $state.raw<{ result: RepairOutcome; for: UnfinishedAdoption } | null>(null);
	let readError = $state<'failed' | 'refused' | null>(null);

	let alive = true;

	/** The report now, as one of its three results (ReportRead). */
	async function fetchReport(): Promise<ReportRead> {
		try {
			return reportRead(await systemApi.getUnfinishedAdoption());
		} catch (err) {
			return reportReadError(err);
		}
	}

	async function read() {
		if (!isAdmin) return;
		// A press during an existing read is handled by the queued read, not its old snapshot.
		const checking = repairState?.phase === 'checking' ? repairState : null;
		const result = await fetchReport();
		if (!alive || !isAdmin) return;
		readError = result.kind === 'failed' ? (result.refused ? 'refused' : 'failed') : null;
		if (result.kind !== 'failed') {
			const next = result.kind === 'report' ? result.u : null;
			if (outcome && (outcome.result.done || next?.runId !== outcome.for.runId)) outcome = null;
			unfinished = next;
			running = result.running;
			if (repairState?.phase === 'confirming') {
				if (repairOutcomeFitsReport(repairState.result, repairState.for, result))
					outcome = { result: repairState.result, for: repairState.for };
				repairState = null;
			} else if (repairState?.phase === 'lost' && !running && next?.state !== 'recovering') {
				repairState = null;
			}
		}
		onRead?.(result);
		if (checking && repairState === checking) {
			if (result.kind === 'report' && repairStillOffered(checking.for, result))
				return sendRepair(result.u);
			repairState = null;
		}
		if (result.kind === 'failed' && result.refused) return HALT;
	}

	async function sendRepair(before: UnfinishedAdoption) {
		// repairStillOffered has checked the nonempty run id, before any await here.
		repairState = { phase: 'sending', for: before };
		let result: RepairOutcome;
		try {
			result = repairOutcomeOf(await systemApi.repairAdoption(before.runId!));
		} catch (err) {
			console.error('[AdoptionNotice] The repair was refused or failed:', err);
			if (!alive) return;
			const failure = reportReadError(err);
			if (failure.kind === 'failed' && failure.refused) {
				repairState = null;
				readError = 'refused';
				return HALT;
			}
			result = repairOutcomeOf(err);
		}
		if (!alive) return;
		repairState =
			result.kind === 'unknown'
				? { phase: 'lost', for: before }
				: { phase: 'confirming', for: before, result };
		// Queued behind this read/POST; never runs concurrently with it.
		again.now();
	}

	const again = repeatRead({
		read,
		wanted: () =>
			alive &&
			isAdmin &&
			(repairState !== null || running !== null || unfinished?.state === 'recovering'),
		readOnVisible: true,
		scheduler: untrack(() => scheduler)
	});

	onDestroy(() => {
		alive = false;
		again.stop();
	});

	let previousInputs: NoticeReadInputs | null = null;
	$effect(() => {
		const next = { isAdmin, named, quietRunning };
		untrack(() => {
			const request = noticeReadOnChange(previousInputs, next);
			previousInputs = next;
			if (request === 'enter') again.now();
			else if (request === 'refresh') again.refresh();
			if (!next.isAdmin && repairState?.phase === 'checking') repairState = null;
		});
	});

	function repair() {
		if (repairState || readError === 'refused' || !unfinished?.runId || !unfinished.repairAvailable)
			return;
		outcome = null;
		repairState = { phase: 'checking', for: unfinished };
		again.now();
	}

	// On a volume's page, only a move that names the volume shows.
	const namesVolume = (ids: (number | null)[]) =>
		volumeId === null || ids.some((id) => id !== null && id === volumeId);
	let shownUnfinished = $derived(
		unfinished &&
			(!onVolume ||
				namesVolume([unfinished.sourceId, unfinished.targetId]) ||
				(named && unfinished.sourceId === null && unfinished.targetId === null))
			? unfinished
			: null
	);
	// A move running here that is not unfinished: the working row, on its volumes' pages only.
	let runningHere = $derived(
		onVolume &&
			readError !== 'refused' &&
			!quietRunning &&
			!shownUnfinished &&
			running !== null &&
			volumeId !== null &&
			namesVolume([running.sourceId, running.targetId])
	);

	let done = $derived(
		outcome?.result.done && (!onVolume || namesVolume([outcome.for.sourceId, outcome.for.targetId]))
			? outcome
			: null
	);
	let failure = $derived(outcome && !outcome.result.done ? outcome : null);
	let failureText = $derived(failure ? repairOutcomeText(failure.result, failure.for, $m) : null);
	let working = $derived(
		readError !== 'refused' &&
			(repairState !== null || running !== null || unfinished?.state === 'recovering')
	);
	let blockedLines = $derived(
		unfinished && !working && !unfinished.repairAvailable ? noRepairLines(unfinished, $m) : []
	);
</script>

{#snippet doneLine(text: string)}
	<p class="notice-body">{text}</p>
	{#if readError}<button type="button" class="btn btn-ghost" onclick={() => again.now()}
			>{$m.common_retry}</button
		>{/if}
{/snippet}

{#snippet body(u: UnfinishedAdoption)}
	{@const repairOffered = !working && u.repairAvailable && readError !== 'refused'}
	{#if onVolume}
		<!-- On a volume's page the strip is short: the heading with Repair beside it, the
		     missing files, then the rest, read on in the strip's own scroll. -->
		<div class="notice-head">
			<p class="notice-title">{$m.unsettled_heading}</p>
			{#if repairOffered}
				<button type="button" class="btn btn-primary" onclick={repair}>{$m.unsettled_repair}</button
				>
			{/if}
		</div>
		{#each u.missing as name (name)}
			<p class="notice-body">{$m.unsettled_missing(name)}</p>
		{/each}
		{#if u.source !== null && u.target !== null}
			<p class="notice-body">{$m.unsettled_what(u.source, u.target)}</p>
			<p class="notice-body">{$m.unsettled_blocked(u.source, u.target)}</p>
		{/if}
	{:else}
		<p class="notice-title">{$m.unsettled_heading}</p>
		{#if u.source !== null && u.target !== null}
			<p class="notice-body">{$m.unsettled_what(u.source, u.target)}</p>
		{/if}
		{#each u.missing as name (name)}
			<p class="notice-body">{$m.unsettled_missing(name)}</p>
		{/each}
		{#if u.source !== null && u.target !== null}
			<p class="notice-body">{$m.unsettled_blocked(u.source, u.target)}</p>
		{/if}
	{/if}
	{#if working}
		<p class="notice-body notice-working">
			<span class="spinner" aria-hidden="true"></span>
			<span>{$m.unsettled_repairing}</span>
		</p>
	{:else}
		{#if failure}
			<p class="notice-body notice-fail" role="alert">{failureText}</p>
		{/if}
		{#if repairOffered}
			{#if !failure}
				<p class="notice-meta">{$m.unsettled_repair_desc}</p>
			{/if}
			{#if !onVolume}
				<div class="notice-actions">
					<button type="button" class="btn btn-primary" onclick={repair}
						>{$m.unsettled_repair}</button
					>
				</div>
			{/if}
		{:else}
			{#each blockedLines.filter((l) => l !== failureText) as text (text)}
				<p class="notice-body">{text}</p>
			{/each}
		{/if}
	{/if}
	{#if readError}<button type="button" class="btn btn-ghost" onclick={() => again.now()}
			>{$m.common_retry}</button
		>{/if}
{/snippet}

{#if isAdmin && done && !onVolume}
	<!-- On the Overview: one of the "Needs attention" notices (AttentionNotice), in the error tone. -->
	<div class="adoption-frame" data-adoption-notice>
		<AttentionNotice icon="warn">
			{@render doneLine(repairOutcomeText(done.result, done.for, $m))}
		</AttentionNotice>
	</div>
{:else if isAdmin && done}
	<div class="adoption-notice ok small" role="status" data-adoption-notice>
		<span class="material-symbols-outlined notice-icon" aria-hidden="true">check_circle</span>
		<div class="notice-main">
			{@render doneLine(repairOutcomeText(done.result, done.for, $m))}
		</div>
	</div>
{:else if isAdmin && shownUnfinished && !onVolume}
	<div class="adoption-frame" data-adoption-notice>
		<AttentionNotice icon="warn">{@render body(shownUnfinished)}</AttentionNotice>
	</div>
{:else if isAdmin && shownUnfinished}
	<div class="adoption-notice small" role="status" data-adoption-notice>
		<span class="material-symbols-outlined notice-icon" aria-hidden="true">warning</span>
		<div class="notice-main">{@render body(shownUnfinished)}</div>
	</div>
{:else if isAdmin && runningHere}
	<!-- A move of this volume is running and is not unfinished: the strip's working row. -->
	<div class="adoption-running" role="status" data-adoption-notice>
		<span class="spinner" aria-hidden="true"></span>
		<span>{$m.adopt_action} {$m.common_loading_ellipsis}</span>
		{#if readError}<button type="button" class="btn btn-ghost" onclick={() => again.now()}
				>{$m.common_retry}</button
			>{/if}
	</div>
{:else if isAdmin && readError}
	<div class="adoption-running" data-adoption-notice>
		<span>{$m.api_request_failed}</span>
		<button type="button" class="btn btn-ghost" onclick={() => again.now()}
			>{$m.common_retry}</button
		>
	</div>
{:else if !isAdmin && role !== null && onVolume && (named || shownUnfinished)}
	<div class="adoption-notice small" role="status" data-adoption-notice>
		<span class="material-symbols-outlined notice-icon" aria-hidden="true">warning</span>
		<div class="notice-main">
			<p class="notice-body">{$m.unsettled_operator}</p>
		</div>
	</div>
{/if}

<style>
	.adoption-frame {
		display: contents;
	}
	.adoption-running {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--color-light-grey);
	}
	.adoption-running .spinner {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
	}
	/* Red, as the Overview's storage alert. */
	.adoption-notice {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 18px;
		background-color: rgba(214, 103, 74, 0.08);
		border: 1px solid rgba(214, 103, 74, 0.3);
		border-radius: var(--radius-md);
		color: var(--color-error);
		font-size: var(--text-sm);
		line-height: 1.5;
		margin-bottom: 24px;
	}
	.adoption-notice.ok {
		background-color: rgba(111, 191, 115, 0.08);
		border-color: rgba(111, 191, 115, 0.3);
		color: var(--color-success);
	}
	.adoption-notice.small {
		padding: 8px 12px;
		gap: 8px;
		margin: 0;
		font-size: var(--text-xs);
		line-height: 1.4;
	}
	.notice-icon {
		flex-shrink: 0;
		font-size: 18px;
	}
	.notice-main {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.notice-main p {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.notice-title {
		font-weight: var(--fw-bold);
	}
	.notice-body {
		color: var(--color-light);
	}
	.notice-meta {
		color: var(--color-light-grey);
	}
	.notice-fail {
		color: var(--color-error);
	}
	.notice-working {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.notice-working .spinner {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
	}
	.notice-actions {
		display: flex;
		margin-top: 4px;
	}
	.notice-actions .btn {
		min-height: var(--touch-target-min);
	}
	/* On a volume's page: the heading, and Repair beside it while the width allows. */
	.notice-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.notice-head .notice-title {
		flex: 1 1 200px;
		min-width: 0;
	}
	.notice-head .btn {
		flex-shrink: 0;
		min-height: var(--touch-target-min);
	}
</style>

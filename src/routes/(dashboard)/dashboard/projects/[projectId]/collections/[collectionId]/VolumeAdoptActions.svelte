<script lang="ts" module>
	// Where the session keeps the id of a move whose outcome is not known yet (see the header).
	const storageKey = (sourceId: number) => `captua-adoption-request:${sourceId}`;

	/** Whether the session keeps such an id for this volume: the layout mounts the component to settle it. */
	export function hasStoredRequest(sourceId: number): boolean {
		try {
			return sessionStorage.getItem(storageKey(sourceId)) !== null;
		} catch {
			return false;
		}
	}
</script>

<script lang="ts">
	// ============================================================================
	// Moving a hand-made volume's captures into a volume from Fisqua (NEH-419):
	// the administrator's button beside the volume's other actions, and its
	// dialog: choose the volume from Fisqua, read the plan, move, and the
	// result with the offer to delete the emptied volume.
	//
	// The layout shows it to administrators only; the backend refuses both
	// routes to anyone else (allow_admin in app/api/collections.py). The button
	// is offered on a volume with no Fisqua reference code, not kept on the
	// unit, not closed by an earlier move, and with at least one record
	// (adoptActionOffered in adoption.ts); the count is read only when the
	// volume's fields allow the action. The volumes offered come from
	// GET /collections/ (listAll), whose `record_count` is counted for every
	// volume listed (adoptCandidates). The plan (GET .../adopt-into/{target})
	// is the authority: a volume it refuses is shown as refused.
	//
	// Entering the plan step runs the dry run; each one, and every close, takes
	// a new number, so an answer to a dry run cancelled earlier never replaces
	// a newer one. Every answer is applied only to the volume it was asked
	// for, and only while the component is mounted; the callbacks to the
	// layout name that volume. Nothing closes the dialog while the POST runs.
	//
	// Each move carries one id, made when the administrator confirms
	// (newClientCaptureId) and sent with the POST; the unit keeps a record of
	// it (app/core/adoption_requests.py). Until its outcome is known the id
	// is kept in the component and in sessionStorage under the source volume,
	// so a reload or a navigation away and back resumes it. An answer the page
	// cannot read (a network error, the time limit, a bodyless 502 or 504, a
	// 2xx that is not the result) is an unknown outcome: the page asks
	// GET /system/adoption/requests/{id} and acts on its state alone
	// (requestStateOf), asking again every 5 s while it is running or busy,
	// and while the lookup fails (repeat-read.ts). While the id is unresolved
	// the action is not offered and the strip shows the working line, the
	// dialog closed or not; a lookup that fails offers Retry and Close in the
	// dialog, never a second move.
	//
	// A move the unit left half done (a lookup's `interrupted`, or a failure
	// with `restored: false`, from the POST or a lookup) keeps its id like any
	// unresolved one, and is told from one read of GET /system/adoption,
	// through the same reader (halfMovedAdvice): a move recovery could not
	// settle is said as such, and the Overview says what to do; one a recovery
	// or a move is settling now stays working and is asked again; one no
	// recovery has tried, or a report that cannot be read, is settled by a
	// restart, and the dialog says so. A recorded failure the report no longer
	// shows was settled since (a repair, a restart), and its row never changes:
	// the source volume's `captures_adopted_at`, written in the move's own
	// commit, says whether the captures moved; while that read fails the
	// dialog stays working with Retry.
	//
	// The delete offer opens the volumes list's delete dialog
	// (VolumeDeleteModal) for the emptied volume, with the focus trapped in it
	// and starting on its Cancel; once the volume is deleted the page goes to
	// the volumes list. When the dialog closes and its button is gone, focus
	// goes to `focusAfter` (the layout's back button).
	// ============================================================================
	//
	// Version: 0.3.0

	import { onDestroy, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		collectionsApi,
		recordsApi,
		systemApi,
		type AdoptPlan,
		type AdoptResult,
		type Collection
	} from '$lib/api';
	import { newClientCaptureId } from '$lib/capture-check';
	import { m } from '$lib/i18n';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import {
		adoptActionOffered,
		adoptCandidates,
		adoptFailureOf,
		isAdoptResult,
		newNames,
		halfMovedAdvice,
		readStoredRequest,
		refusalLines,
		reportRead,
		reportReadError,
		requestStateOf,
		type ReportRead,
		type AppliedSummary,
		type RequestState
	} from '$lib/adoption';
	import { browserScheduler, HALT, repeatRead, type Scheduler } from '$lib/repeat-read';
	import VolumeDeleteModal from '../../VolumeDeleteModal.svelte';

	let {
		collectionId,
		collectionName,
		volume,
		onAdopted,
		onOffered,
		onUnfinished,
		onPending,
		focusAfter,
		scheduler = browserScheduler
	}: {
		collectionId: number;
		collectionName: string;
		/** The volume's fields that decide whether the action is offered; `kept_on_unit` from the offsite line. */
		volume: {
			external_id?: string | null;
			kept_on_unit?: boolean;
			captures_adopted_at?: string | null;
			testing?: boolean;
		};
		/** After the move, with the source and the target's title: the layout marks the volume closed and reloads its records. */
		onAdopted: (sourceId: number, targetName: string) => void;
		/** Whether the button is offered, once known, for the volume named. */
		onOffered?: (sourceId: number, offered: boolean) => void;
		/** A move left half done on the volume named: the layout shows the notice. */
		onUnfinished?: (sourceId: number) => void;
		/** Whether a move of the volume named waits for its outcome (the strip shows it as working). */
		onPending?: (sourceId: number, pending: boolean) => void;
		/** Where focus goes when the dialog closes and its button is gone. */
		focusAfter?: () => void;
		/** The timers of the repeated read; tests fire them by hand. */
		scheduler?: Scheduler;
	} = $props();

	type Target = { id: number; name: string };
	type Step =
		| { kind: 'choose'; candidates: Collection[] | null }
		| { kind: 'planning'; target: Target }
		| { kind: 'plan'; target: Target; plan: AdoptPlan }
		| { kind: 'refused'; target: Target; codes: string[] }
		| { kind: 'running'; target: Target; plan: AdoptPlan }
		// The POST's answer was lost: the unit is being asked; `retry` once the lookup failed.
		| { kind: 'checking'; target: Target; plan: AdoptPlan | null; retry: boolean }
		// `summary` null: the move landed, and the unit's record has no counts.
		| { kind: 'done'; target: Target; summary: AppliedSummary | null }
		// `blocked`: left half done, and recovery could not settle it (halfMovedAdvice).
		| { kind: 'failed'; restored: boolean | null; blocked?: boolean };

	let step = $state<Step | null>(null);
	let chosen = $state<number | null>(null);
	let recordCount = $state<number | null>(null);
	let countFailed = $state(false);
	// A committed move cannot offer another move, even before layout props update.
	let unavailable = $state(false);
	let buttonEl = $state<HTMLButtonElement | null>(null);
	// The emptied volume, while its delete dialog is open.
	type DeleteSession = { volume: Collection; deleted: boolean; checking: Promise<void> | null };
	let deleting = $state.raw<DeleteSession | null>(null);
	// The move whose outcome is not known yet: its id and target, from the confirm until a
	// POST answer or a lookup settles it. The action is not offered meanwhile.
	type Pending = {
		forId: number;
		requestId: string;
		target: Target;
	};
	// Raw: the object is compared by identity with the one a continuation started with.
	let pending = $state.raw<Pending | null>(null);
	// The lookup was refused (401, 403): nothing is asked until Retry; the id stays kept.
	let refusedLookup = $state(false);
	// The plan the dialog's working state shows while the move's outcome is asked for.
	let shownPlan: AdoptPlan | null = null;
	let destroyed = false;

	function keep(p: Pending | null, sourceId: number) {
		try {
			if (p)
				sessionStorage.setItem(
					storageKey(sourceId),
					JSON.stringify({
						requestId: p.requestId,
						targetId: p.target.id,
						targetName: p.target.name
					})
				);
			else sessionStorage.removeItem(storageKey(sourceId));
		} catch {
			// No session storage (a private window): the id lives in the component only.
		}
	}

	// A kept entry is used only when well formed (readStoredRequest); anything else is removed.
	function stored(sourceId: number): Pending | null {
		let raw: string | null = null;
		try {
			raw = sessionStorage.getItem(storageKey(sourceId));
		} catch {
			return null;
		}
		const entry = readStoredRequest(raw);
		if (!entry) {
			if (raw !== null) keep(null, sourceId);
			return null;
		}
		return {
			forId: sourceId,
			requestId: entry.requestId,
			target: { id: entry.targetId, name: entry.targetName }
		};
	}

	function settled(forId: number) {
		pending = null;
		refusedLookup = false;
		keep(null, forId);
	}

	/** Whether an answer asked for `forId` may still be applied. */
	const still = (forId: number) => !destroyed && forId === collectionId;

	// The fields alone rule the action out without asking for the count.
	let fieldsAllow = $derived(adoptActionOffered(volume, 1));
	let offered = $derived(
		adoptActionOffered(volume, recordCount) && pending === null && !unavailable
	);

	// While the outcome is not known, ask again: the dialog open or closed.
	const again = repeatRead({
		read: () => pending && lookup(pending),
		wanted: () => !destroyed && pending !== null && pending.forId === collectionId,
		// Fixed for the component's life: tests pass their own at mount.
		scheduler: untrack(() => scheduler)
	});
	onDestroy(() => {
		destroyed = true;
		again.stop();
		countAgain.stop();
	});

	$effect(() => {
		const waiting = pending !== null && pending.forId === collectionId;
		const forId = collectionId;
		untrack(() => onPending?.(forId, waiting));
	});

	// A volume change invalidates the view, but keeps the previous volume's
	// unresolved request in storage so returning to it resumes the same id.
	let initializedFor: number | null = null;
	$effect(() => {
		const forId = collectionId;
		untrack(() => {
			// Parent prop refreshes can invalidate this effect without a navigation.
			// Keep this volume's dialog and its deferred focus generation intact.
			if (initializedFor === forId) return;
			initializedFor = forId;
			planGeneration += 1;
			step = null;
			chosen = null;
			deleting = null;
			recordCount = null;
			countFailed = false;
			unavailable = false;
			refusedLookup = false;
			pending = stored(forId);
			if (pending) again.now();
		});
	});

	// The count has its own serialized reader. Retry cannot overlap a count
	// already in flight; a failed count must not hide the action permanently.
	const countAgain = repeatRead({
		read: async () => {
			const forId = collectionId;
			if (!fieldsAllow || destroyed) return;
			recordCount = null;
			countFailed = false;
			try {
				const n = await recordsApi.count({ collection_id: forId });
				if (still(forId) && fieldsAllow) recordCount = n;
			} catch (err) {
				console.error('[VolumeAdopt] Could not count the records:', err);
				if (still(forId) && fieldsAllow) countFailed = true;
			}
		},
		wanted: () => false,
		scheduler: untrack(() => scheduler)
	});

	$effect(() => {
		collectionId;
		if (fieldsAllow) untrack(() => countAgain.now());
	});
	$effect(() => {
		const forId = collectionId;
		const available = offered;
		untrack(() => onOffered?.(forId, available));
	});

	// The dry run whose answer the dialog is waiting for (see the header).
	let planGeneration = 0;

	async function open() {
		if (!offered || step || deleting) return;
		chosen = null;
		step = { kind: 'choose', candidates: null };
		const forId = collectionId;
		const generation = ++planGeneration;
		const current = () => still(forId) && generation === planGeneration && step?.kind === 'choose';
		try {
			const all = await collectionsApi.listAll();
			if (!current()) return;
			step = { kind: 'choose', candidates: adoptCandidates(all, forId) };
		} catch (err) {
			console.error('[VolumeAdopt] Could not list the volumes:', err);
			if (!current()) return;
			step = { kind: 'failed', restored: null };
		}
	}

	const mayClose = (s: Step | null) =>
		s !== null && s.kind !== 'running' && !(s.kind === 'checking' && !s.retry);

	function close() {
		if (!mayClose(step)) return;
		const generation = ++planGeneration;
		step = null;
		tick().then(() => {
			if (destroyed || generation !== planGeneration || step || deleting) return;
			// Not scrolled into view: the strip under the bar stays at its top, where the
			// notice of a move left half done starts.
			if (buttonEl?.isConnected) buttonEl.focus({ preventScroll: true });
			else focusAfter?.();
		});
	}

	async function startPlan() {
		if (step?.kind !== 'choose' || !step.candidates) return;
		const found = step.candidates.find((c) => c.id === chosen);
		if (!found) return;
		const target = { id: found.id, name: found.name };
		step = { kind: 'planning', target };
		const forId = collectionId;
		const generation = ++planGeneration;
		const current = () =>
			still(forId) && generation === planGeneration && step?.kind === 'planning';
		try {
			const plan = await collectionsApi.planAdoptInto(forId, target.id);
			if (!current()) return;
			step = plan.may_adopt
				? { kind: 'plan', target, plan }
				: { kind: 'refused', target, codes: plan.refusals };
		} catch (err) {
			console.error('[VolumeAdopt] The dry run failed:', err);
			if (!current()) return;
			step = { kind: 'failed', restored: null };
		}
	}

	async function run() {
		if (step?.kind !== 'plan' || pending !== null) return;
		const { target, plan } = step;
		const forId = collectionId;
		const mine: Pending = { forId, requestId: newClientCaptureId(), target };
		pending = mine;
		keep(mine, forId);
		step = { kind: 'running', target, plan };
		try {
			const result = await collectionsApi.adoptInto(forId, target.id, mine.requestId);
			if (!still(forId) || pending !== mine) return;
			// A 2xx that is not the result says nothing of what happened: ask the unit.
			if (!isAdoptResult(result)) {
				ask(plan);
				return;
			}
			unavailable = true;
			settled(forId);
			step = { kind: 'done', target, summary: summaryOf(result) };
			onAdopted(forId, target.name);
		} catch (err) {
			// The backend's English goes to the console only.
			console.error('[VolumeAdopt] The move failed:', err);
			if (!still(forId) || pending !== mine) return;
			const failure = adoptFailureOf(err);
			if (failure.kind === 'refused') {
				settled(forId);
				step = { kind: 'refused', target, codes: failure.codes };
			} else if (failure.kind === 'failed' && failure.restored) {
				settled(forId);
				step = { kind: 'failed', restored: true };
			} else {
				// Left half done, or an answer the page cannot read: the id is kept and the unit is asked.
				ask(plan);
			}
		}
	}

	function summaryOf(result: AdoptResult): AppliedSummary {
		return {
			records: result.records,
			images: result.images,
			colourCardSets: result.colour_card_sets,
			pending: result.target_lines_pending || result.recovery_pending
		};
	}

	// Whether the dialog shows this move's working state, so its outcome goes there.
	const showing = () => step?.kind === 'running' || step?.kind === 'checking';

	/** Ask the unit what the pending move did: through the reader, so no two lookups overlap. */
	function ask(plan: AdoptPlan | null) {
		shownPlan = plan;
		const p = pending;
		if (p && showing())
			step = { kind: 'checking', target: p.target, plan: shownPlan, retry: false };
		again.now();
	}

	/**
	 * What became of the move `p` sent, asked of the unit by its id
	 * (requestStateOf); the reader's read. The outcome goes to the dialog
	 * while it shows the move, and to the layout's callbacks in any case. A
	 * lookup refused 401 or 403 stops the reader (HALT) and keeps the id; 422
	 * (a malformed id) drops it.
	 */
	async function lookup(p: Pending) {
		const current = () => still(p.forId) && pending === p;
		refusedLookup = false;
		let state: RequestState;
		try {
			state = requestStateOf(await systemApi.getAdoptionRequest(p.requestId));
		} catch (err) {
			state = requestStateOf(err);
		}
		if (!current()) return;
		const open = showing();
		switch (state.kind) {
			case 'working':
				if (open) step = { kind: 'checking', target: p.target, plan: shownPlan, retry: false };
				return;
			case 'lookup_failed':
				console.error('[VolumeAdopt] Could not ask the unit what the move did');
				if (open) step = { kind: 'checking', target: p.target, plan: shownPlan, retry: true };
				return;
			case 'session':
			case 'forbidden':
				// Not this role's to ask now: stop, keep the id, offer Retry.
				refusedLookup = true;
				if (open) step = { kind: 'checking', target: p.target, plan: shownPlan, retry: true };
				return HALT;
			case 'applied':
				unavailable = true;
				settled(p.forId);
				if (open) step = { kind: 'done', target: p.target, summary: state.summary };
				onAdopted(p.forId, p.target.name);
				return;
			case 'refused':
				settled(p.forId);
				if (open) step = { kind: 'refused', target: p.target, codes: state.codes };
				return;
			case 'failed':
			case 'interrupted': {
				if (state.kind === 'failed' && state.restored) {
					settled(p.forId);
					if (open) step = { kind: 'failed', restored: true };
					return;
				}
				const advice = await adviceNow();
				if (!current()) return;
				// Running now, or (for `interrupted`, whose row the unit settles) settled since: asked again.
				if (advice === 'working' || (advice === 'settled' && state.kind === 'interrupted')) {
					if (showing())
						step = { kind: 'checking', target: p.target, plan: shownPlan, retry: false };
					return;
				}
				if (advice === 'settled') return settledWhichWay(p, current);
				settled(p.forId);
				if (showing()) step = { kind: 'failed', restored: false, blocked: advice === 'blocked' };
				onUnfinished?.(p.forId);
				return;
			}
			default:
				// reverted; an id the unit never saw (closed); or one it calls malformed (invalid): nothing
				// moved under it. The id is dropped and the action is offered again.
				settled(p.forId);
				if (open) step = { kind: 'failed', restored: true };
		}
	}

	/** What the dialog says of a move left half done, from one read of the report. */
	async function adviceNow() {
		let read: ReportRead;
		try {
			read = reportRead(await systemApi.getUnfinishedAdoption());
		} catch (err) {
			read = reportReadError(err);
		}
		return halfMovedAdvice(read);
	}

	/**
	 * A recorded failure the report no longer shows: settled since. The source
	 * volume says which way (see the header); the reader's read, so serialized.
	 */
	async function settledWhichWay(p: Pending, current: () => boolean) {
		let moved: boolean;
		try {
			moved = !!(await collectionsApi.get(p.forId)).captures_adopted_at;
		} catch (err) {
			console.error('[VolumeAdopt] Could not read the volume after the move was settled:', err);
			if (current() && showing())
				step = { kind: 'checking', target: p.target, plan: shownPlan, retry: true };
			return;
		}
		if (!current()) return;
		const open = showing();
		settled(p.forId);
		if (moved) {
			unavailable = true;
			if (open) step = { kind: 'done', target: p.target, summary: null };
			onAdopted(p.forId, p.target.name);
		} else if (open) step = { kind: 'failed', restored: true };
	}

	function retry() {
		if (pending) ask(step && 'plan' in step ? step.plan : shownPlan);
	}

	function offerDelete() {
		if (step?.kind !== 'done' || deleting) return;
		planGeneration += 1;
		step = null;
		deleting = {
			volume: {
				id: collectionId,
				name: collectionName,
				created_at: '',
				stem_reserved: true,
				captures_adopted_at: new Date().toISOString()
			},
			deleted: false,
			checking: null
		};
	}

	// Each callback captures this particular dialog, not just a volume id:
	// closing and reopening it cannot let an old continuation close the new one.
	function afterDeleteChange(dialog: DeleteSession): Promise<void> {
		if (dialog.checking) return dialog.checking;
		const current = () => deleting === dialog && still(dialog.volume.id);
		if (!current()) return Promise.resolve();
		dialog.checking = (async () => {
			try {
				await collectionsApi.get(dialog.volume.id);
				if (current()) dialog.deleted = false;
			} catch (err) {
				if (current()) dialog.deleted = (err as { status?: unknown })?.status === 404;
			} finally {
				dialog.checking = null;
			}
		})();
		return dialog.checking;
	}

	function closeDelete(dialog: DeleteSession) {
		if (deleting !== dialog || !still(dialog.volume.id)) return;
		deleting = null;
		const generation = ++planGeneration;
		if (dialog.deleted) void goto('/dashboard/volumes');
		else
			tick().then(() => {
				if (!destroyed && generation === planGeneration && !step && !deleting) focusAfter?.();
			});
	}

	// The card's backdrop goes to <body> before trapFocus focuses the first
	// control: moving an element that holds the focus drops it to <body>, and
	// a card's action runs before its backdrop's.
	function trapInBody(card: HTMLElement) {
		const moved = toBody(card.parentElement!);
		const trap = trapFocus(card);
		return {
			destroy() {
				trap.destroy();
				moved.destroy();
			}
		};
	}

	// While the dialog is open the focus stays in it. A step change removes
	// the control that had the focus, which drops it to <body>; once the new
	// step is rendered, the focus goes to its primary action if enabled, else
	// to Cancel or Close, else (a step with no control yet) to the card. The
	// card is not scrolled: a long step is read from its title down.
	let cardEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!step || !cardEl || cardEl.contains(document.activeElement)) return;
		const actions = cardEl.querySelector('.offsite-dialog-actions');
		const target =
			actions?.querySelector<HTMLButtonElement>('.btn-primary:not(:disabled)') ??
			actions?.querySelector<HTMLButtonElement>('.btn-ghost') ??
			cardEl;
		target.focus({ preventScroll: true });
	});

	// The delete dialog starts on its Cancel (the control that changes nothing).
	function startOnCancel(node: HTMLElement) {
		const cancel = [...node.querySelectorAll<HTMLButtonElement>('.modal-actions button')].find(
			(b) => b.textContent?.trim() === $m.common_cancel
		);
		cancel?.focus();
	}

	let names = $derived({
		source: collectionName,
		target: step && 'target' in step ? step.target.name : ''
	});
	let planNames = $derived(step?.kind === 'plan' ? newNames(step.plan) : null);
	let refused = $derived(step?.kind === 'refused' ? refusalLines(step.codes, names, $m) : []);

	function planSummary(plan: AdoptPlan, target: string): string {
		const sets = plan.colour_card_set_ids.length;
		return sets > 0
			? $m.adopt_plan_summary(plan.records, plan.renames_count, sets, collectionName, target)
			: $m.adopt_plan_summary_no_sets(plan.records, plan.renames_count, collectionName, target);
	}

	function doneSummary(summary: AppliedSummary, target: string): string {
		return summary.colourCardSets > 0
			? $m.adopt_done_summary(
					summary.records,
					summary.images,
					summary.colourCardSets,
					collectionName,
					target
				)
			: $m.adopt_done_summary_no_sets(summary.records, summary.images, collectionName, target);
	}
</script>

{#if pending !== null && pending.forId === collectionId}
	<!-- A move whose outcome is not known yet: the working line, in place of the action. -->
	<div class="adopt-row adopt-row-working" role="status">
		{#if !refusedLookup}<span class="spinner" aria-hidden="true"></span>{/if}
		<span class="adopt-row-desc">{$m.adopt_action} {$m.common_loading_ellipsis}</span>
		{#if refusedLookup}
			<button type="button" class="btn btn-ghost" onclick={retry}>{$m.common_retry}</button>
		{/if}
	</div>
{:else if fieldsAllow && countFailed && !unavailable}
	<div class="adopt-row">
		<span class="adopt-row-desc">{$m.api_request_failed}</span>
		<button type="button" class="btn btn-ghost" onclick={() => countAgain.now()}
			>{$m.common_retry}</button
		>
	</div>
{:else if offered}
	<!-- In the strip under the bar: the explanation, and the button beside it. -->
	<div class="adopt-row">
		<p class="adopt-row-desc">{$m.adopt_action_desc}</p>
		<button
			type="button"
			class="btn btn-ghost adopt-btn"
			bind:this={buttonEl}
			onclick={open}
			aria-haspopup="dialog"
		>
			{$m.adopt_action}
		</button>
	</div>
{/if}

{#if step}
	<div
		class="offsite-dialog-backdrop"
		use:dismissible={{
			onDismiss: close,
			escape: mayClose(step),
			backdrop: mayClose(step)
		}}
	>
		<div
			class="offsite-dialog-card adopt-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="adopt-dialog-title"
			tabindex="-1"
			use:trapInBody
			bind:this={cardEl}
		>
			{#if step.kind === 'choose'}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title">{$m.adopt_target_heading}</h3>
				{#if step.candidates === null}
					<div class="offsite-dialog-wait" role="status">
						<div class="spinner" aria-hidden="true"></div>
						<p class="offsite-dialog-body">{$m.common_loading_ellipsis}</p>
					</div>
				{:else if step.candidates.length === 0}
					<p class="offsite-dialog-body">{$m.adopt_target_empty}</p>
				{:else}
					<p class="offsite-dialog-body offsite-dialog-muted">{$m.adopt_target_desc}</p>
					<div class="adopt-targets" role="radiogroup" aria-labelledby="adopt-dialog-title">
						{#each step.candidates as c (c.id)}
							<label class="adopt-target">
								<input type="radio" name="adopt-target" value={c.id} bind:group={chosen} />
								<span class="adopt-target-text">
									<span class="adopt-target-name">{c.name}</span>
									{#if c.filename_stem}
										<span class="adopt-target-stem">{c.filename_stem}</span>
									{/if}
								</span>
							</label>
						{/each}
					</div>
				{/if}
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_cancel}</button>
					{#if step.candidates && step.candidates.length > 0}
						<button class="btn btn-primary" onclick={startPlan} disabled={chosen === null}
							>{$m.focus_continue}</button
						>
					{/if}
				</div>
			{:else if step.kind === 'planning'}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title">{$m.adopt_plan_heading}</h3>
				<div class="offsite-dialog-wait" role="status">
					<div class="spinner" aria-hidden="true"></div>
					<p class="offsite-dialog-body">{$m.common_loading_ellipsis}</p>
				</div>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_cancel}</button>
				</div>
			{:else if step.kind === 'plan' && planNames}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title">{$m.adopt_plan_heading}</h3>
				<p class="offsite-dialog-body">{planSummary(step.plan, step.target.name)}</p>
				{#if step.plan.project_changes}
					<p class="offsite-dialog-body">
						{$m.adopt_plan_project(collectionName, step.target.name)}
					</p>
				{/if}
				{#if planNames.names.length > 0}
					<p class="offsite-dialog-body adopt-strong">{$m.adopt_plan_new_names}</p>
					<ul class="offsite-dialog-list adopt-names">
						{#each planNames.names as name (name)}
							<li>{name}</li>
						{/each}
						{#if planNames.more > 0}
							<li>{$m.fisqua_more(planNames.more)}</li>
						{/if}
					</ul>
				{/if}
				<p class="offsite-dialog-body offsite-dialog-muted">{$m.adopt_plan_next}</p>
				<p class="offsite-dialog-body offsite-dialog-muted">{$m.adopt_plan_old_copies}</p>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_cancel}</button>
					<button class="btn btn-primary" onclick={run}>{$m.adopt_plan_confirm}</button>
				</div>
			{:else if step.kind === 'refused'}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title error">
					<span class="material-symbols-outlined" aria-hidden="true">error</span>
					{$m.adopt_refused_title}
				</h3>
				<p class="offsite-dialog-body" role="alert">{$m.adopt_refused_unchanged}</p>
				{#if refused.length > 0}
					<ul class="adopt-refusals">
						{#each refused as r (r.text)}
							<li>
								{r.text}
								{#if r.advice}<span class="adopt-advice">{r.advice}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_cancel}</button>
					<button class="btn btn-primary" disabled>{$m.adopt_plan_confirm}</button>
				</div>
			{:else if step.kind === 'running' || step.kind === 'checking'}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title">{$m.adopt_action}</h3>
				<div class="offsite-dialog-wait" role="status">
					{#if !refusedLookup}<div class="spinner" aria-hidden="true"></div>{/if}
					<p class="offsite-dialog-body">
						{step.plan ? planSummary(step.plan, step.target.name) : $m.common_loading_ellipsis}
					</p>
				</div>
				{#if step.kind === 'checking' && step.retry}
					<div class="offsite-dialog-actions">
						<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
						<button class="btn btn-primary" onclick={retry}>{$m.common_retry}</button>
					</div>
				{/if}
			{:else if step.kind === 'done'}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title success">
					<span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
					{$m.adopt_done_heading}
				</h3>
				{#if step.summary}
					<p class="offsite-dialog-body" role="status">
						{doneSummary(step.summary, step.target.name)}
					</p>
				{/if}
				<p class="offsite-dialog-body offsite-dialog-muted">
					{step.summary?.pending ? $m.adopt_done_pending : $m.adopt_done_uploading}
				</p>
				<p class="offsite-dialog-body offsite-dialog-muted">
					{$m.adopt_done_delete_desc(collectionName, step.target.name)}
				</p>
				<div class="offsite-dialog-choices">
					<button class="btn btn-danger" onclick={offerDelete}
						>{$m.adopt_done_delete(collectionName)}</button
					>
				</div>
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
				</div>
			{:else if step.kind === 'failed'}
				<h3 id="adopt-dialog-title" class="offsite-dialog-title error">
					<span class="material-symbols-outlined" aria-hidden="true">error</span>
					{$m.adopt_action}
				</h3>
				{#if step.restored === null}
					<p class="offsite-dialog-body" role="alert">{$m.api_request_failed}</p>
				{:else if step.blocked}
					<p class="offsite-dialog-body" role="alert">{$m.adopt_err_unfinished}</p>
					<p class="offsite-dialog-body">{$m.adopt_err_unfinished_do}</p>
				{:else}
					<p class="offsite-dialog-body" role="alert">
						{step.restored ? $m.adopt_failed_restored : $m.adopt_failed_pending}
					</p>
					<p class="offsite-dialog-body">
						{step.restored ? $m.adopt_failed_restored_do : $m.adopt_failed_pending_do}
					</p>
				{/if}
				<div class="offsite-dialog-actions">
					<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if deleting}
	{@const dialog = deleting}
	<div use:toBody use:trapFocus use:startOnCancel>
		<VolumeDeleteModal
			volume={dialog.volume}
			moveTargets={[]}
			onChanged={() => afterDeleteChange(dialog)}
			onClose={() => closeDelete(dialog)}
		/>
	</div>
{/if}

<style>
	.adopt-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px 16px;
	}
	.adopt-row-working {
		justify-content: flex-start;
	}
	.adopt-row-working .spinner {
		flex-shrink: 0;
		width: 16px;
		height: 16px;
	}
	.adopt-row-desc {
		flex: 1 1 320px;
		min-width: 0;
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--color-light-grey);
	}
	.adopt-btn {
		flex: 0 1 auto;
		max-width: 100%;
		white-space: normal;
		text-align: center;
	}
	.adopt-targets {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.adopt-target {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: var(--touch-target-min);
		padding: 8px 12px;
		border: var(--border-width) solid var(--border-color);
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.adopt-target:has(input:checked) {
		border-color: var(--color-primary);
	}
	.adopt-target input {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		accent-color: var(--color-primary);
	}
	.adopt-target-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.adopt-target-name {
		color: var(--color-light);
		font-size: var(--text-base);
	}
	.adopt-target-stem {
		color: var(--color-light-grey);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.adopt-strong {
		font-weight: var(--fw-bold);
	}
	.adopt-names li {
		overflow-wrap: anywhere;
	}
	.adopt-refusals {
		margin: 0;
		padding: 0 0 0 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--color-light);
	}
	.adopt-advice {
		color: var(--color-light-grey);
	}
	.adopt-card > * {
		flex-shrink: 0;
	}
</style>

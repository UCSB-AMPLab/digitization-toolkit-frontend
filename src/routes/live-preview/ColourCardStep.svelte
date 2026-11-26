<script lang="ts">
	// The colour card step (NEH-340): over the whole capture screen, as "Which
	// camera is this?" is, when the volume is asked for colour card shots
	// (GET /collections/{id}/colour-card says needed). A colour card shot is a
	// photograph of the colour reference card, one per camera, under the light
	// and settings of the pages. The capture screen decides when it opens and
	// takes no page capture while it is open; nothing dismisses it.
	//
	// - On opening it opens a set for the screen's mode (POST .../sets: the
	//   volume's open set if it has one, with its shots), which records the
	//   cameras' settings. The cameras are shown in the screen's order, the
	//   left pane's first; a single-camera screen has camera 0.
	// - One camera at a time: "Take shot" is enabled on the first camera
	//   without a shot; a camera with a shot shows it (its preview route)
	//   with "Take again", which replaces it. A RAW shot with no preview says
	//   that it was saved and cannot be shown here.
	// - "Continue" completes the set (POST .../complete), enabled only once
	//   every camera of the set has its shot. "Skip" records a skipped request
	//   (POST .../skip), after one confirmation that says the volume will be
	//   marked as lacking its shots. "Leave the capture screen" goes where the
	//   capture screen's back button goes; the step shows again on return.
	// - Opening a set, a shot and a skip take the capture screen's one gate
	//   (`captureGate`, kind `test`), so none starts while a capture or a test
	//   capture is in flight, and none of those starts meanwhile.
	// - Refusals ($lib/colour-card): a busy camera, a camera not connected and
	//   a camera that did not take the shot say so, and that camera can try
	//   again; a set finished or skipped on another screen, a set the backend
	//   says still lacks a shot, and any request that timed out read the
	//   volume's state again, with the cameras. While that answer says shots
	//   are needed the step goes on with the answer's reason and its open set,
	//   or a fresh set when none is open. Shots carry no client id, so a shot
	//   that timed out is known only from that read. A volume deleted
	//   meanwhile leaves only "Leave". A set that could not be opened offers
	//   Retry.
	// - Whether the step stays is not the step's to decide. Every answer it
	//   reads and every outcome it reaches (set completed, request skipped,
	//   refused as not enabled) goes to the capture screen's check
	//   (`onEvidence`), stamped by the check's clock (`stamp`): a read when it
	//   starts, an outcome when it is known. The screen shows the step from the
	//   check's verdict and the step's own requests in flight.
	// - Every answer acts only while its operation is current
	//   ($lib/page-life): not after the step has gone, which the capture
	//   screen does when the volume changes.
	//
	// Version: 0.3.0

	import { untrack } from 'svelte';
	import { colourCardApi } from '$lib/api';
	import { m } from '$lib/i18n';
	import { userRole } from '$lib/stores/auth';
	import { canFreeVolumes } from '$lib/unit-mode';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import { pageLife } from '$lib/page-life';
	import { createCaptureGate, type CaptureGate } from '$lib/capture-check';
	import {
		cameraOrder,
		colourCardRefusal,
		setComplete,
		type ColourCardReason,
		type ColourCardState,
		type ColourCardSet
	} from '$lib/colour-card';

	let {
		collectionId,
		captureMode,
		leftIndex = 0,
		reason,
		cameraName,
		projectName = '',
		collectionName = '',
		captureGate,
		stamp,
		onEvidence,
		need,
		onLeave,
		onBusy,
		onWorking
	}: {
		collectionId: number;
		// The capture screen's mode: the cameras that take a shot.
		captureMode: 'single' | 'dual';
		// The camera of the left pane, shown first.
		leftIndex?: number;
		reason: ColourCardReason | null;
		// A camera's name inside a sentence, as the capture screen names it.
		cameraName: (cam: number) => string;
		projectName?: string;
		collectionName?: string;
		captureGate?: CaptureGate;
		// The capture screen's check owns whether shots are needed: the step
		// stamps each request when it starts (a recovery read) or each outcome
		// when it is known (completed, skipped, refused as not enabled), and
		// hands it over; it keeps no verdict of its own.
		stamp: () => number;
		// Whether the check applied the item; the step acts on an answer only
		// when it did, and only while `need` says shots are needed.
		onEvidence: (item: {
			at: number;
			state?: ColourCardState;
			need?: boolean;
			outcome?: boolean;
		}) => boolean;
		need: () => boolean;
		onLeave?: () => void;
		// A shot is in flight: the capture screen asks the cameras for no
		// preview frame meanwhile.
		onBusy?: (busy: boolean) => void;
		// Any request of the step's is in flight (a set opened, read again,
		// completed or skipped, or a shot): the capture screen keeps the step
		// up until it has answered.
		onWorking?: (busy: boolean) => void;
	} = $props();

	const gate: CaptureGate = untrack(() => captureGate) ?? createCaptureGate();
	const life = pageLife();

	let set = $state<ColourCardSet | null>(null);
	// The request in flight on the set (open, read again, complete, skip).
	let working = $state(false);
	// The camera whose shot is in flight.
	let shooting = $state<number | null>(null);
	let error = $state<string | null>(null);
	// The volume is no longer on the unit: only "Leave" is offered.
	let gone = $state(false);
	let confirmingSkip = $state(false);
	// Shots whose image the browser could not show, by capture id.
	let unshown = $state<Record<string, true>>({});

	// The reason on screen: the capture screen's, then each read's.
	let shownReason = $state<ColourCardReason | null>(untrack(() => reason));
	let busy = $derived(working || shooting !== null);
	let order = $derived(set ? cameraOrder(set, leftIndex) : []);
	let nextCamera = $derived(order.find((c) => !set?.shots.some((s) => s.camera_index === c)));
	let complete = $derived(set !== null && setComplete(set));

	// Only while mounted; the capture screen clears both when the step goes.
	$effect(() => {
		onBusy?.(shooting !== null);
	});
	$effect(() => {
		onWorking?.(busy);
	});

	function body() {
		return captureMode === 'single'
			? { capture_mode: 'single' as const, camera_index: 0 }
			: { capture_mode: 'dual' as const };
	}

	function capitalised(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function shotOf(cam: number) {
		return set?.shots.find((s) => s.camera_index === cam) ?? null;
	}

	// What a refusal or a failure shows, and what the step does next.
	function refused(err: unknown, cam: number | null = null) {
		const kind = colourCardRefusal(err);
		// The backend's English goes to the console only.
		console.error('[ColourCard] Request refused or failed:', err);
		const name = cam === null ? '' : cameraName(cam);
		switch (kind) {
			case 'not_enabled':
				onEvidence({ at: stamp(), need: false });
				return;
			case 'volume_gone':
				gone = true;
				error = $m.cc_err_volume_gone;
				return;
			case 'adopted_away':
				gone = true;
				error = $m.adopt_closed_refusal;
				return;
			case 'set_gone':
				error = $m.cc_err_set_gone;
				void readAgain();
				return;
			case 'shots_missing':
				error = $m.cc_err_shots_missing;
				void readAgain();
				return;
			case 'timeout':
				error = $m.cc_err_timeout;
				void readAgain();
				return;
			case 'camera_busy':
				error = $m.cc_err_camera_busy;
				return;
			case 'not_connected':
				error = $m.cc_err_not_connected(name);
				return;
			case 'capture_failed':
				error = $m.cc_err_capture_failed(name);
				return;
			case 'stem':
				error = $m.lv_needs_stem;
				return;
			case 'storage':
				error = canFreeVolumes($userRole)
					? $m.lv_err_storage_reserve_free
					: $m.lv_err_storage_reserve;
				return;
			case 'restarting':
				error = $m.camera_kind_refused_backend_restarting;
				return;
			default:
				error = $m.cc_err_failed;
		}
	}

	async function openSet() {
		const release = gate.acquire('test');
		if (!release) {
			error = $m.cc_err_busy;
			return;
		}
		const op = life.begin('set');
		working = true;
		try {
			const opened = await colourCardApi.openSet(collectionId, body(), op.signal);
			if (!op.current()) return;
			set = opened;
			error = null;
		} catch (err) {
			if (!op.current()) return;
			refused(err);
		} finally {
			release();
			if (op.current()) working = false;
		}
	}

	// The volume's state as the unit holds it, without touching a camera.
	async function readAgain() {
		const op = life.begin('set');
		const at = stamp();
		working = true;
		try {
			const state = await colourCardApi.state(collectionId, { readCameras: true }, op.signal);
			if (!op.current()) return;
			// The check decides whether the step stays; the step goes on with a
			// set only from an answer the check applied, while it says needed.
			if (!onEvidence({ at, state }) || !need()) return;
			shownReason = state.reason;
			const open = [...state.sets].reverse().find((s) => s.outcome === null);
			if (open) {
				set = open;
				return;
			}
			set = null;
			working = false;
			await openSet();
		} catch (err) {
			if (!op.current()) return;
			// A failed read leaves the step as it was, with a line saying so.
			console.error('[ColourCard] Could not read the volume again:', err);
			const kind = colourCardRefusal(err);
			if (kind === 'volume_gone') {
				gone = true;
				error = $m.cc_err_volume_gone;
			} else if (kind === 'not_enabled') onEvidence({ at: stamp(), need: false });
			else error = $m.cc_err_unread;
		} finally {
			if (op.current()) working = false;
		}
	}

	async function take(cam: number) {
		if (!set || busy || gone) return;
		const release = gate.acquire('test');
		if (!release) {
			error = $m.cc_err_busy;
			return;
		}
		const op = life.begin('shot');
		const setId = set.id;
		shooting = cam;
		error = null;
		try {
			const shot = await colourCardApi.takeShot(collectionId, setId, cam, op.signal);
			if (!op.current() || set?.id !== setId) return;
			set = {
				...set,
				shots: [...set.shots.filter((s) => s.camera_index !== cam), shot]
			};
		} catch (err) {
			if (!op.current()) return;
			refused(err, cam);
		} finally {
			release();
			if (op.current()) shooting = null;
		}
	}

	async function finish() {
		if (!set || !complete || busy || gone) return;
		const op = life.begin('set');
		working = true;
		error = null;
		try {
			await colourCardApi.complete(collectionId, set.id, op.signal);
			if (!op.current()) return;
			// An outcome: the check asks the unit again once it has it.
			onEvidence({ at: stamp(), need: false, outcome: true });
		} catch (err) {
			if (!op.current()) return;
			refused(err);
		} finally {
			if (op.current()) working = false;
		}
	}

	async function skip() {
		if (busy || gone) return;
		const release = gate.acquire('test');
		if (!release) {
			confirmingSkip = false;
			error = $m.cc_err_busy;
			return;
		}
		const op = life.begin('set');
		working = true;
		error = null;
		try {
			await colourCardApi.skip(collectionId, body(), op.signal);
			if (!op.current()) return;
			confirmingSkip = false;
			onEvidence({ at: stamp(), need: false, outcome: true });
		} catch (err) {
			if (!op.current()) return;
			confirmingSkip = false;
			refused(err);
		} finally {
			release();
			if (op.current()) working = false;
		}
	}

	$effect(() => {
		untrack(() => void openSet());
	});
</script>

<div
	class="cc-view"
	data-colour-card
	role="dialog"
	aria-modal="true"
	aria-labelledby="cc-heading"
	tabindex="-1"
	use:toBody
	use:trapFocus
	use:dismissible={{ onDismiss: () => {}, escape: false, backdrop: false }}
>
	<div class="topbar">
		<div class="topbar-title">
			<span class="cc-name">{$m.cc_title}</span>
			{#if projectName || collectionName}
				<nav class="breadcrumb" aria-label={$m.tb_breadcrumb_nav}>
					{#if projectName}<span class="bc-item">{projectName}</span>{/if}
					{#if projectName && collectionName}<span class="bc-item bc-sep" aria-hidden="true">/</span
						>{/if}
					{#if collectionName}<span class="bc-item bc-collection">{collectionName}</span>{/if}
				</nav>
			{/if}
		</div>
	</div>

	<div class="sf">
		<div class="sf-body">
			<div class="cc-head">
				<h2 class="cc-q" id="cc-heading">{$m.cc_heading}</h2>
				{#if !gone}
					<p class="sf-small">
						{#if shownReason === 'start'}{$m.cc_reason_start}{:else if shownReason === 'begun_without'}{$m.cc_reason_begun_without}{:else if shownReason === 'settings_changed'}{$m.cc_reason_settings_changed}{/if}
						{$m.cc_how}
					</p>
				{/if}
			</div>
			{#if error}
				<div class="action-notice is-error" role="alert">
					<span class="material-symbols-outlined" aria-hidden="true">error</span>
					<span class="action-notice-text">{error}</span>
				</div>
			{/if}
			{#if set && !gone}
				<div class="cc-cards">
					{#each order as cam (cam)}
						{@const shot = shotOf(cam)}
						<div class="cc-card" data-cc-camera={cam} class:is-next={cam === nextCamera}>
							<span class="cc-cam">{capitalised(cameraName(cam))}</span>
							<div class="cc-frame">
								{#if shooting === cam}
									<p class="empty-msg" role="status">
										<span class="img-viewer-spinner" aria-hidden="true"></span>{$m.cc_taking}
									</p>
								{:else if shot && shot.preview && !unshown[shot.capture_id]}
									<img
										class="cc-img"
										src={colourCardApi.shotImageUrl(collectionId, shot)}
										alt={$m.cc_shot_alt(cameraName(cam))}
										draggable="false"
										onerror={() => (unshown = { ...unshown, [shot.capture_id]: true })}
									/>
								{:else if shot}
									<p class="empty-msg">{shot.preview ? $m.cc_shot_unshown : $m.cc_shot_raw}</p>
								{:else}
									<p class="empty-msg">{$m.cc_no_shot}</p>
								{/if}
							</div>
							<button
								class="btn {shot ? 'btn-secondary' : 'btn-primary'} cc-take"
								data-cc-take
								disabled={busy || (!shot && cam !== nextCamera)}
								onclick={() => take(cam)}>{shot ? $m.cc_take_again : $m.cc_take}</button
							>
						</div>
					{/each}
				</div>
			{:else if !gone && working}
				<p class="sf-small" role="status">
					<span class="img-viewer-spinner" aria-hidden="true"></span>{$m.cc_opening}
				</p>
			{/if}
		</div>

		<div class="sf-foot">
			<span class="cc-spacer"></span>
			{#if onLeave}
				<button class="btn btn-ghost" onclick={onLeave} disabled={shooting !== null}
					>{$m.camwhich_leave}</button
				>
			{/if}
			{#if !gone}
				{#if set === null && !working}
					<button class="btn btn-secondary" onclick={() => void openSet()}>{$m.common_retry}</button
					>
				{/if}
				<button class="btn btn-secondary" onclick={() => (confirmingSkip = true)} disabled={busy}
					>{$m.cc_skip}</button
				>
				<button class="btn btn-primary" onclick={finish} disabled={!complete || busy}
					>{$m.cc_continue}</button
				>
			{/if}
		</div>
	</div>
</div>

{#if confirmingSkip}
	<div
		class="cc-backdrop"
		use:toBody
		use:dismissible={{ onDismiss: () => !working && (confirmingSkip = false) }}
	>
		<div
			class="cc-confirm dialog-fit"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="cc-skip-title"
			aria-describedby="cc-skip-body"
			use:trapFocus
		>
			<h3 class="cc-confirm-title" id="cc-skip-title">{$m.cc_skip_title}</h3>
			<p class="cc-confirm-body" id="cc-skip-body">{$m.cc_skip_body}</p>
			<div class="cc-confirm-actions">
				<button class="btn btn-ghost" disabled={working} onclick={() => (confirmingSkip = false)}
					>{$m.common_cancel}</button
				>
				<button class="btn btn-primary" disabled={working} onclick={skip}
					>{$m.cc_skip_confirm}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Over the whole capture screen and anything open on it, as "Which camera
	   is this?" (WhichCamera.svelte), whose layout this follows. */
	.cc-view {
		position: fixed;
		/* Below the banner for a unit that is not answering, while it shows. */
		inset: var(--banner-h, 0px) 0 0 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background-color: var(--color-bg);
		overflow: hidden;
	}
	.topbar {
		height: 72px;
		width: 100%;
		background-color: var(--color-surface-alt);
		border-bottom: 2px solid var(--color-primary);
		display: flex;
		align-items: center;
		padding: 0 32px;
		flex-shrink: 0;
		box-sizing: border-box;
	}
	.topbar-title {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cc-name {
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		line-height: 1.2;
		white-space: nowrap;
	}
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		min-width: 0;
	}
	.bc-item {
		color: var(--color-light-grey);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bc-sep {
		flex-shrink: 0;
	}
	.bc-collection {
		color: var(--color-light);
		font-weight: var(--fw-bold);
	}
	@media (max-width: 900px) {
		.topbar {
			padding: 0 16px;
		}
	}

	.sf {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.sf-body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 16px;
		overflow: hidden;
	}
	.sf-foot {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		background-color: var(--color-surface);
		border-top: 1px solid var(--border-color);
	}
	.cc-spacer {
		flex: 1;
	}
	.sf-foot .btn {
		font-size: 13px;
		padding: 8px 12px;
		flex-shrink: 0;
		white-space: nowrap;
		min-height: var(--touch-target-min);
	}
	.sf-small {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.4;
	}
	.sf-small .img-viewer-spinner {
		display: inline-block;
		vertical-align: middle;
		margin-right: 8px;
	}
	.cc-head {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.cc-q {
		margin: 0;
		font-size: var(--text-h4);
		font-weight: var(--fw-bold);
		line-height: 1.25;
		color: var(--color-light);
	}
	.sf-body > .action-notice {
		margin: 0;
		padding: 8px 12px;
		line-height: 1.45;
		flex-shrink: 0;
	}
	.action-notice .material-symbols-outlined {
		font-size: 18px;
		color: var(--color-error);
		flex-shrink: 0;
	}

	/* One card per camera: its name, its shot, its button. */
	.cc-cards {
		flex: 1;
		min-height: 0;
		display: flex;
		justify-content: center;
		gap: 16px;
	}
	.cc-card {
		flex: 1 1 0;
		max-width: 420px;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border: 2px solid var(--border-color);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		box-sizing: border-box;
	}
	.cc-card.is-next {
		border-color: var(--color-selected);
	}
	.cc-cam {
		flex-shrink: 0;
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cc-frame {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border-radius: 3px;
		background: #0a0a0a;
	}
	.cc-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
	.empty-msg {
		margin: 0;
		padding: 8px;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--color-light-grey);
		text-align: center;
	}
	.cc-take {
		flex-shrink: 0;
		min-height: var(--touch-target-min);
		white-space: nowrap;
	}

	/* The skip confirmation, over the step. */
	.cc-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1010;
		padding: 24px;
	}
	.cc-confirm {
		display: flex;
		flex-direction: column;
		gap: 12px;
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 20px 24px;
		width: 100%;
		max-width: 480px;
		box-shadow: var(--shadow-lg);
	}
	.cc-confirm-title {
		margin: 0;
		font-size: var(--text-h4);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.cc-confirm-body {
		margin: 0;
		font-size: var(--text-base);
		line-height: 1.45;
		color: var(--color-light);
	}
	.cc-confirm-actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 10px;
	}
	.cc-confirm-actions .btn {
		min-height: var(--touch-target-min);
	}
</style>

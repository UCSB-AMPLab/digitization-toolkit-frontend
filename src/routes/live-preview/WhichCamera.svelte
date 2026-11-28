<script lang="ts">
	// "Which camera is this?" (NEH-343), the camera check's step that tells
	// Captua which page each camera photographs. A camera's role is the page
	// it photographs; the unit stores it per camera body (NEH-342).
	//
	// The capture screen opens it by itself when GET /cameras/setup says
	// set-up is needed; then nothing dismisses it (no Cancel, Escape and the
	// backdrop do nothing) and the capture screen takes no capture. The
	// operator is not held here, though: "Leave the capture screen"
	// (`onLeave`) goes where the capture screen's back button goes, in every
	// variant, and the step shows again on coming back. It is also opened by
	// hand from the camera check's camera details, when it can be cancelled
	// and has no "Leave". The capture screen owns `setup`; this screen reads
	// the device list itself on opening and after a refused save, and calls
	// `onReread` then so the capture screen asks for the set-up again. "Check
	// again" reconnects the cameras (POST /cameras/rescan, as "Reconnect
	// cameras" does), then asks for the set-up. Every listing it reads, either
	// way, goes to the capture screen too (`onDevices`).
	//
	// What it says follows the most specific reason (src/lib/camera-roles.ts),
	// never the backend's English:
	// - a camera Captua cannot identify, or fewer than two cameras: what is
	//   wrong and what to do, with "Check again"; nothing to confirm. On a
	//   CHDK unit an administrator is offered "Assign an ID to the camera"
	//   (NEH-363), which writes a page parity, and with it an ID, onto the
	//   card of the body identityToAssign names (POST /cameras/side/{n}, one
	//   body a press), then reads the set-up again. An administrator with no
	//   body Captua can give an ID to here is told why and to reconnect; a
	//   refused write is told apart by status (409, another body holds that
	//   ID or page; anything else, the write failed). Everyone else is told
	//   to ask the administrator. On a gphoto2 unit the screen says the cameras
	//   are identified by their serial, for everyone;
	// - two cameras on the same page, a role not confirmed, another pair: the
	//   question, a current frame from each camera (GET /cameras/preview/{n},
	//   once per camera, "Refresh" for new ones), each turned by its camera's
	//   saved orientation, with "Turn". The operator presses the image of the
	//   odd/recto page: that camera, the left camera, takes role `right`, and
	//   the other, the right camera, role `left`; "Confirm" saves both in one
	//   request (PUT /cameras/roles). Nothing is chosen beforehand: a guess of
	//   the backend's (role_guess) shows only as a faint note;
	// - a known camera on another USB socket: the same question and the same
	//   press, with the two frames labelled by their current roles and no
	//   image pressed until the operator presses one. Pressing the image
	//   already labelled odd/recto saves the same roles again; pressing the
	//   other exchanges them.
	// No socket name or USB path is shown. A save refused because a camera
	// went away reads everything again and asks to choose again.
	//
	// Version: 0.4.0

	import { onDestroy, onMount } from 'svelte';
	import {
		camerasApi,
		type CameraDevice,
		type CameraRolesResponse,
		type CameraSetup
	} from '$lib/api';
	import { m } from '$lib/i18n';
	import { identityToAssign, whichScreen } from '$lib/camera-roles';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import { PairPanZoom } from '$lib/pair-pan-zoom.svelte';
	import PageCameraLabel from '$lib/components/PageCameraLabel.svelte';
	import CameraKindNotice from '$lib/components/CameraKindNotice.svelte';
	import { cameraKind, loadCameraKind } from '$lib/camera-kind';
	import { userRole } from '$lib/stores/auth';

	let {
		setup,
		cancellable = false,
		projectName = '',
		collectionName = '',
		rotateDeg = {},
		onRotateDegChange,
		savingOrientation = {},
		onSaved,
		onCancel,
		onReread,
		onLeave,
		onDevices
	}: {
		// The capture screen's last answer from GET /cameras/setup; null when
		// it has none.
		setup: CameraSetup | null;
		// Opened by hand, while set-up is not needed: Cancel and Escape close it.
		cancellable?: boolean;
		projectName?: string;
		collectionName?: string;
		// Clockwise degrees by camera index, and the capture screen's writer.
		rotateDeg?: Record<number, number>;
		onRotateDegChange?: (cam: number, deg: number) => void;
		// A camera whose orientation save is in flight.
		savingOrientation?: Record<number, boolean>;
		// The roles were saved: the devices and the set-up after the save.
		onSaved: (answer: CameraRolesResponse) => void;
		onCancel?: () => void;
		// Ask the backend for the set-up again.
		onReread?: () => Promise<void> | void;
		// Leave the capture screen, while set-up is needed.
		onLeave?: () => void;
		// Each listing this screen reads: on opening, after a refused save, and
		// from "Check again".
		onDevices?: (devices: CameraDevice[]) => void;
	} = $props();

	let destroyed = false;

	// ---------------------------------------------------------------------------
	// Devices
	// ---------------------------------------------------------------------------
	// Null until the first answer.
	let devices = $state<CameraDevice[] | null>(null);
	let devicesFailed = $state(false);
	let reading = $state(false);
	let deviceSeq = 0;

	let screen = $derived(devices === null ? null : whichScreen(setup, devices));
	let asking = $derived(screen?.kind === 'ask');
	// Both the ask screen and the USB-socket screen take a press and a Confirm.
	let picking = $derived(screen?.kind === 'ask' || screen?.kind === 'port');
	// The two cameras on screen: by index while asking; on another USB socket,
	// the even/verso page (role left) first, so it stands on the left.
	let cameras = $derived.by((): CameraDevice[] => {
		if (!screen || !devices) return [];
		if (screen.kind === 'port') return [screen.left, screen.right];
		if (screen.kind !== 'ask') return [];
		return [...devices].sort((a, b) => a.index - b.index).slice(0, 2);
	});

	// Every listing this screen reads (on opening, after a refused save, from
	// "Check again") goes through here, and the capture screen gets each one
	// that is still the newest (`onDevices`), so its devices and rotations
	// never lag behind the ones shown here.
	function listed(seq: number, list: CameraDevice[]) {
		if (destroyed || seq !== deviceSeq) return;
		devices = list;
		devicesFailed = false;
		onDevices?.(list);
	}

	async function readDevices(): Promise<void> {
		const seq = ++deviceSeq;
		try {
			listed(seq, await camerasApi.listDevices());
		} catch (err) {
			if (destroyed || seq !== deviceSeq) return;
			console.error('[WhichCamera] Could not read the devices:', err);
			devicesFailed = true;
		}
	}

	// The devices and the set-up again, then new frames when there are
	// cameras to show.
	async function readAgain() {
		if (reading) return;
		reading = true;
		try {
			await Promise.all([readDevices(), Promise.resolve(onReread?.())]);
		} finally {
			if (!destroyed) reading = false;
		}
		if (destroyed) return;
		if (oddPick && !cameras.some((d) => d.hardware_id === oddPick)) oddPick = null;
		void fetchFrames();
	}

	// "Check again": reconnect the cameras, then the set-up. A rescan that
	// fails says so; the set-up is asked for all the same.
	let rescanning = $state(false);
	let rescanFailed = $state(false);

	async function checkAgain() {
		if (rescanning || reading) return;
		rescanning = true;
		rescanFailed = false;
		const seq = ++deviceSeq;
		try {
			const list = await camerasApi.rescan();
			// The cameras connected may now be of another kind (NEH-252).
			loadCameraKind({ fresh: true });
			if (destroyed) return;
			listed(seq, list);
		} catch (err) {
			if (destroyed) return;
			console.error('[WhichCamera] Could not reconnect the cameras:', err);
			rescanFailed = true;
		}
		try {
			await onReread?.();
		} finally {
			if (!destroyed) rescanning = false;
		}
		if (destroyed) return;
		if (oddPick && !cameras.some((d) => d.hardware_id === oddPick)) oddPick = null;
		void fetchFrames();
	}

	// ---------------------------------------------------------------------------
	// Frames, by camera index
	// ---------------------------------------------------------------------------
	type Frame = { status: 'busy' | 'ok' | 'error'; url?: string };
	let frames = $state<Record<number, Frame>>({});
	let framesBusy = $derived(cameras.some((d) => frames[d.index]?.status === 'busy'));
	let frameSeq: Record<number, number> = {};

	function setFrame(cam: number, frame: Frame) {
		const old = frames[cam]?.url;
		if (old && old !== frame.url) URL.revokeObjectURL(old);
		frames = { ...frames, [cam]: frame };
	}

	// One request per camera; the frame on screen stays until the next arrives.
	async function fetchFrames() {
		const cams = cameras.map((d) => d.index);
		await Promise.all(
			cams.map(async (cam) => {
				const seq = (frameSeq[cam] = (frameSeq[cam] ?? 0) + 1);
				frames = { ...frames, [cam]: { ...(frames[cam] ?? {}), status: 'busy' } };
				try {
					const blob = await camerasApi.previewFrame(cam);
					if (destroyed || seq !== frameSeq[cam]) return;
					setFrame(cam, { status: 'ok', url: URL.createObjectURL(blob) });
				} catch (err) {
					if (destroyed || seq !== frameSeq[cam]) return;
					console.error('[WhichCamera] No frame from camera', cam, err);
					setFrame(cam, { status: 'error' });
				}
			})
		);
	}

	function refresh() {
		if (framesBusy || saving) return;
		void fetchFrames();
	}

	// ---------------------------------------------------------------------------
	// Orientation, by pane
	// ---------------------------------------------------------------------------
	function rotationOf(cam: number): number {
		return rotateDeg[cam] ?? 0;
	}

	const panes = new PairPanZoom(
		() => false,
		(i) => (cameras[i] ? rotationOf(cameras[i].index) : 0)
	);

	function turnDisabled(cam: number): boolean {
		return saving || savingOrientation[cam] === true;
	}

	function turn(cam: number) {
		if (turnDisabled(cam)) return;
		onRotateDegChange?.(cam, (rotationOf(cam) + 90) % 360);
	}

	// ---------------------------------------------------------------------------
	// The answer
	// ---------------------------------------------------------------------------
	// The body pressed as the odd/recto page (role `right`); the other camera
	// takes the even/verso page (role `left`).
	let oddPick = $state<string | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	// The role a card is labelled with: the press when there is one; before
	// it, the current role on the USB-socket screen, none on the ask screen.
	function roleOf(device: CameraDevice): 'left' | 'right' | null {
		if (oddPick !== null) return device.hardware_id === oddPick ? 'right' : 'left';
		if (screen?.kind === 'port') return device.role === 'left' ? 'left' : 'right';
		return null;
	}

	function choose(device: CameraDevice) {
		if (saving) return;
		oddPick = device.hardware_id;
		saveError = null;
	}

	function errorCode(err: unknown): string | null {
		const detail = (err as { detail?: unknown })?.detail;
		if (detail && typeof detail === 'object' && 'code' in detail)
			return String((detail as { code: unknown }).code);
		return null;
	}

	async function save(left: CameraDevice, right: CameraDevice) {
		if (saving) return;
		saving = true;
		saveError = null;
		try {
			const answer = await camerasApi.setRoles(left.hardware_id, right.hardware_id);
			if (destroyed) return;
			if (Array.isArray(answer?.devices) && answer.devices.length > 0) devices = answer.devices;
			oddPick = null;
			onSaved(answer);
		} catch (err) {
			if (destroyed) return;
			// The backend's English goes to the console only.
			console.error('[WhichCamera] The roles were not saved:', err);
			const status = (err as { status?: number })?.status;
			const code = errorCode(err);
			if (status === 409 && code === 'camera_not_connected') {
				saveError = $m.camwhich_err_not_connected;
				oddPick = null;
				await readAgain();
			} else if (status === 409 && code === 'camera_identity_unusable') {
				saveError = $m.camwhich_err_identity;
				oddPick = null;
				await readAgain();
			} else if (status === 503) {
				saveError = $m.camwhich_err_unavailable;
			} else {
				saveError = $m.camwhich_err_failed;
			}
		} finally {
			if (!destroyed) saving = false;
		}
	}

	function confirm() {
		if (!picking || oddPick === null) return;
		const right = cameras.find((d) => d.hardware_id === oddPick);
		const left = cameras.find((d) => d.hardware_id !== oddPick);
		if (left && right) void save(left, right);
	}

	function cancel() {
		if (!cancellable || saving) return;
		onCancel?.();
	}

	// ---------------------------------------------------------------------------
	// An ID for a camera Captua cannot identify (NEH-363)
	// ---------------------------------------------------------------------------
	// The kind in effect, once read; nothing changes before it is.
	let kindInEffect = $derived(
		$cameraKind.status === 'ready' ? $cameraKind.report.configured : null
	);
	let identityByAdmin = $derived(
		screen?.kind === 'identity' && kindInEffect === 'chdk' && $userRole === 'admin'
	);
	let toAssign = $derived(devices === null ? null : identityToAssign(setup, devices));
	let assigning = $state(false);
	// Why the last write was refused: another body holds that ID or parity
	// (409), or anything else, a body gone (404) included.
	let assignFailed = $state<'conflict' | 'failed' | null>(null);

	async function assignIdentity() {
		if (assigning || reading || rescanning || !toAssign) return;
		const { index, side } = toAssign;
		assigning = true;
		assignFailed = null;
		const seq = ++deviceSeq;
		try {
			listed(seq, await camerasApi.assignSide(index, side));
			await onReread?.();
		} catch (err) {
			if (destroyed) return;
			// The backend's English goes to the console only.
			console.error('[WhichCamera] The ID was not written:', err);
			assignFailed = (err as { status?: number })?.status === 409 ? 'conflict' : 'failed';
			assigning = false;
			await readAgain();
			return;
		} finally {
			if (!destroyed) assigning = false;
		}
		if (!destroyed) void fetchFrames();
	}

	let lead = $derived.by(() => {
		if (screen?.kind === 'port') return $m.camwhich_lead_port;
		if (screen?.kind !== 'ask') return '';
		if (screen.reason === 'conflict') return $m.camwhich_lead_conflict;
		if (screen.reason === 'unconfirmed') return $m.camwhich_lead_unconfirmed;
		if (screen.reason === 'pair_changed') return $m.camwhich_lead_pair_changed;
		return '';
	});

	let anyGuess = $derived(
		asking && cameras.some((d) => d.role_guess === 'left' || d.role_guess === 'right')
	);

	onMount(() => {
		void (async () => {
			await readDevices();
			if (!destroyed) void fetchFrames();
		})();
	});

	onDestroy(() => {
		destroyed = true;
		for (const frame of Object.values(frames)) if (frame.url) URL.revokeObjectURL(frame.url);
	});
</script>

{#snippet rescanState()}
	{#if rescanning}
		<p class="sf-small" role="status">
			<span class="img-viewer-spinner" aria-hidden="true"></span>{$m.camwhich_rescanning}
		</p>
	{:else if rescanFailed}
		<div class="action-notice is-error" role="alert">
			<span class="material-symbols-outlined" aria-hidden="true">error</span>
			<span class="action-notice-text">{$m.camwhich_rescan_failed}</span>
		</div>
	{/if}
{/snippet}

{#snippet picture(device: CameraDevice, i: number)}
	{@const frame = frames[device.index]}
	<div class="id-frame" bind:clientWidth={panes.frameW[i]} bind:clientHeight={panes.frameH[i]}>
		{#if frame?.url}
			<img
				class="id-img"
				src={frame.url}
				alt=""
				draggable="false"
				bind:naturalWidth={panes.naturalW[i]}
				bind:naturalHeight={panes.naturalH[i]}
				style={panes.imageStyle(i)}
			/>
		{/if}
		{#if frame?.status === 'busy' && !frame.url}
			<p class="empty-msg" role="status">
				<span class="img-viewer-spinner" aria-hidden="true"></span>{$m.camwhich_frame_busy}
			</p>
		{:else if frame?.status === 'error'}
			<p class="empty-msg is-error" role="alert">
				<span class="material-symbols-outlined" aria-hidden="true">error</span
				>{$m.camwhich_frame_failed}
			</p>
		{/if}
	</div>
{/snippet}

<div
	class="id-view"
	data-which-camera
	role="dialog"
	aria-modal="true"
	aria-labelledby="id-title"
	tabindex="-1"
	use:toBody
	use:trapFocus
	use:dismissible={{ onDismiss: cancel, escape: cancellable && !saving, backdrop: false }}
>
	<div class="topbar">
		<div class="topbar-left">
			<div class="topbar-title">
				<span class="ck-name">{$m.camcheck_title}</span>
				{#if projectName || collectionName}
					<nav class="breadcrumb" aria-label={$m.tb_breadcrumb_nav}>
						{#if projectName}<span class="bc-item">{projectName}</span>{/if}
						{#if projectName && collectionName}<span class="bc-item bc-sep" aria-hidden="true"
								>/</span
							>{/if}
						{#if collectionName}<span class="bc-item bc-collection">{collectionName}</span>{/if}
					</nav>
				{/if}
			</div>
		</div>
	</div>

	<div class="sf">
		<div class="sf-body">
			<!-- Cameras of another kind than the unit is set for (NEH-252): this
			     step covers the capture screen, whose own notice is under it. -->
			<CameraKindNotice />
			{#if devicesFailed && devices === null}
				<div class="id-head">
					<div class="action-notice is-error" role="alert">
						<span class="material-symbols-outlined" aria-hidden="true">error</span>
						<span class="action-notice-text">{$m.camcheck_devices_failed}</span>
					</div>
				</div>
				{@render rescanState()}
			{:else if screen === null}
				<p class="sf-small" role="status">
					<span class="img-viewer-spinner" aria-hidden="true"></span>{$m.camwhich_loading}
				</p>
			{:else if screen.kind === 'identity'}
				<div class="id-head">
					<h2 class="id-q" id="id-title">{$m.camwhich_identity_title}</h2>
					<p class="sf-small">
						{kindInEffect === 'gphoto2'
							? $m.camwhich_identity_body_serial
							: identityByAdmin
								? toAssign
									? $m.camwhich_identity_body_admin
									: $m.camwhich_identity_body_admin_none
								: $m.camwhich_identity_body}
					</p>
				</div>
				{#if assigning}
					<p class="sf-small" role="status">
						<span class="img-viewer-spinner" aria-hidden="true"
						></span>{$m.camwhich_identity_assigning}
					</p>
				{:else if assignFailed}
					<div class="action-notice is-error" role="alert">
						<span class="material-symbols-outlined" aria-hidden="true">error</span>
						<span class="action-notice-text"
							>{assignFailed === 'conflict'
								? $m.camwhich_identity_err_conflict
								: $m.camwhich_identity_err_failed}</span
						>
					</div>
				{/if}
				{@render rescanState()}
			{:else if screen.kind === 'one_camera'}
				<div class="id-head">
					<h2 class="id-q" id="id-title">{$m.camwhich_one_title}</h2>
					<p class="sf-small">{$m.camwhich_one_body}</p>
				</div>
				{@render rescanState()}
			{:else}
				<div class="id-head">
					<h2 class="id-q" id="id-title">{$m.camwhich_ask_title}</h2>
					<p class="sf-small">{lead}{lead ? ' ' : ''}{$m.camwhich_how}</p>
				</div>
				{#if saveError}
					<div class="action-notice is-error" role="alert">
						<span class="material-symbols-outlined" aria-hidden="true">error</span>
						<span class="action-notice-text">{saveError}</span>
					</div>
				{/if}
				<div class="id-cards">
					{#each cameras as device, i (device.hardware_id)}
						{@const role = roleOf(device)}
						{@const pressed = oddPick === device.hardware_id}
						{@const n = device.index + 1}
						<div class="id-card" data-card={device.index}>
							<div class="id-stage">
								<button
									class="id-pick"
									class:selected={pressed}
									data-pick
									aria-label={$m.camwhich_pick_aria(n)}
									aria-describedby={role ? `id-label-${device.index}` : undefined}
									aria-pressed={pressed}
									disabled={saving}
									onclick={() => choose(device)}
								>
									{@render picture(device, i)}
									{#if role}
										<PageCameraLabel
											{role}
											width={panes.frameW[i]}
											id="id-label-{device.index}"
											class="feed-label is-role"
										/>
									{:else}
										<span class="feed-label" id="id-label-{device.index}"
											>{$m.camwhich_camera(n)}</span
										>
									{/if}
								</button>
								<button
									class="float-btn id-turn"
									data-turn
									aria-label={$m.camwhich_turn_aria(n)}
									title={$m.camcheck_turn_title}
									disabled={turnDisabled(device.index)}
									onclick={() => turn(device.index)}
								>
									<!-- The camera check's "turn" icon. -->
									<svg
										width="22"
										height="22"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M4 12a8 8 0 1 0 2.3-5.6" />
										<path d="M4 4v4h4" />
									</svg>
								</button>
							</div>
							<span class="id-cap"
								><b>{$m.camwhich_camera(n)}</b>{#if device.model}<span>· {device.model}</span
									>{/if}</span
							>
							{#if anyGuess}
								<span class="id-guess"
									>{device.role_guess === 'left' || device.role_guess === 'right'
										? $m.camwhich_guess(device.role_guess)
										: ''}</span
								>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="sf-foot">
			<span class="sf-small id-note">{cancellable ? '' : $m.camwhich_needed}</span>
			{#if !cancellable && onLeave}
				<button class="btn btn-ghost" onclick={onLeave} disabled={saving}
					>{$m.camwhich_leave}</button
				>
			{/if}
			{#if cancellable}
				<button class="btn btn-ghost" onclick={cancel} disabled={saving}>{$m.common_cancel}</button>
			{/if}
			{#if screen && (screen.kind === 'ask' || screen.kind === 'port')}
				<button class="btn btn-secondary" onclick={refresh} disabled={framesBusy || saving}>
					<span class="material-symbols-outlined" aria-hidden="true">refresh</span>
					<span>{$m.camwhich_refresh}</span>
				</button>
			{:else if devices !== null || devicesFailed}
				<button
					class="btn btn-secondary"
					onclick={checkAgain}
					disabled={rescanning || reading || assigning}
				>
					<span class="material-symbols-outlined" aria-hidden="true">refresh</span>
					<span>{$m.camwhich_check_again}</span>
				</button>
			{/if}
			{#if identityByAdmin && toAssign}
				<button
					class="btn btn-primary"
					onclick={assignIdentity}
					disabled={assigning || reading || rescanning}>{$m.camwhich_identity_assign}</button
				>
			{/if}
			{#if picking}
				<button class="btn btn-primary" onclick={confirm} disabled={oddPick === null || saving}
					>{$m.camwhich_confirm}</button
				>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Over the whole capture screen and anything open on it: the camera check
     (150), its dialogs (200, 210), the Refocus dialog, the dropdowns (999). */
	.id-view {
		position: fixed;
		/* Below the banner for a unit that is not answering, while it shows. */
		inset: var(--banner-h, 0px) 0 0 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background-color: var(--color-bg);
		overflow: hidden;
	}

	/* ── Top bar: the camera check's, with no chips and no way back ── */
	.topbar {
		height: 72px;
		width: 100%;
		background-color: var(--color-surface-alt);
		border-bottom: 2px solid var(--color-primary);
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 32px;
		flex-shrink: 0;
	}
	.topbar-left {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
		flex: 1;
	}
	.ck-name {
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

	/* ── Body: the question over the two images ── */
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
	.id-note {
		flex: 1;
		min-width: 0;
	}
	.sf-foot .btn {
		font-size: 13px;
		padding: 8px 12px;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.id-head {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.id-head .action-notice,
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
	.id-q {
		margin: 0;
		font-size: var(--text-h4);
		font-weight: var(--fw-bold);
		line-height: 1.25;
		color: var(--color-light);
	}

	/* The mock-up's two cards: the image, its role or name, its camera */
	/* The stage's size is stated outright, from the size of .id-cards. Its
     contents are positioned absolutely, so a width taken from an aspect ratio
     did not widen the card: the card was as wide as its caption, the stage
     overflowed it, and the second picture covered half of the first. The
     height leaves 48px for the caption and the guess below the picture, and
     is limited so that two stages and the gap fit the width. */
	.id-cards {
		flex: 1;
		min-height: 0;
		display: flex;
		justify-content: center;
		gap: 24px;
		container-type: size;
	}
	.id-card {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: none;
	}
	.id-stage {
		position: relative;
		flex: none;
		--stage-h: min(calc(100cqh - 48px), calc((100cqw - 24px) * 3 / 4));
		height: var(--stage-h);
		width: calc(var(--stage-h) * 2 / 3);
	}
	.id-pick {
		position: absolute;
		inset: 0;
		width: 100%;
		padding: 3px;
		background: #2c2920;
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-family: var(--font-family);
	}
	.id-pick:disabled {
		cursor: not-allowed;
	}
	.id-pick.selected {
		border-color: var(--color-selected);
		box-shadow: var(--selected-ring);
	}
	.id-frame {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: 3px;
		background: #0a0a0a;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* A frame may carry the camera's own EXIF orientation tag; only the saved
     orientation turns it here, as in the camera check. */
	.id-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
		image-orientation: none;
	}
	.empty-msg {
		position: relative;
		margin: 0;
		padding: 8px;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--color-light-grey);
		text-align: center;
	}
	.empty-msg .img-viewer-spinner {
		display: block;
		margin: 0 auto 6px;
	}
	.empty-msg .material-symbols-outlined {
		display: block;
		margin: 0 auto 6px;
		font-size: 28px;
		color: var(--color-error);
	}
	.empty-msg.is-error {
		color: var(--color-light);
	}

	/* LiveViewport.svelte's .feed-label; the role, once known, in light.
     Global because the role's label is PageCameraLabel's element. */
	.id-pick :global(.feed-label) {
		position: absolute;
		top: 8px;
		left: 8px;
		background: rgba(19, 17, 16, 0.75);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 12px;
		font-weight: 700;
		color: var(--color-light);
		pointer-events: none;
		z-index: 5;
		white-space: nowrap;
	}
	.id-pick :global(.feed-label.is-role) {
		background: var(--color-light);
		color: var(--color-bg);
		border-color: var(--color-light);
	}

	/* The camera check's turn button, in the bottom left corner of the image */
	.float-btn {
		width: var(--touch-target-min);
		height: var(--touch-target-min);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.id-turn {
		position: absolute;
		left: 8px;
		bottom: 8px;
		z-index: 6;
		background-color: rgba(26, 24, 21, 0.9);
		border: 1px solid rgba(90, 140, 98, 0.3);
		color: var(--color-light);
	}
	.id-turn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.id-cap {
		flex-shrink: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		white-space: nowrap;
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.id-cap b {
		color: var(--color-light);
		font-weight: var(--fw-bold);
	}
	.id-guess {
		flex-shrink: 0;
		min-height: 1.4em;
		font-size: 12px;
		line-height: 1.4;
		color: var(--color-light-grey);
		opacity: 0.75;
		font-style: italic;
		white-space: nowrap;
	}
</style>

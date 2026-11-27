<script lang="ts">
	// The capture page's central area: the live preview of one or two cameras,
	// the framing guides and grid, the capture button and capture key, and the
	// grid settings modal.
	//
	// The backend has no MJPEG stream, so the live preview is polled: every
	// PREVIEW_INTERVAL_MS this component fetches GET /cameras/preview/{index},
	// a single JPEG frame. The frame's resolution is the backend's default for
	// that endpoint, since no `resolution` parameter is sent from here.
	//
	// A unit whose capabilities report `continuous_preview: false` (DSLR and
	// compact bodies, NEH-334) is not polled: each pane shows one frame
	// fetched on entry, then the last capture's image for its camera, and
	// "Refresh preview" fetches one new frame from each camera on request.
	// A label on each pane says which of the two it shows.
	//
	// In single-camera mode one pane shows camera 0, the camera that is
	// previewed and captured; the swap state orders the two cameras of a pair
	// only, and has no effect until dual mode again.
	//
	// A capture still in flight after 10 s gets a line saying the unit is still
	// working on it. A capture request that ends in a timeout (nginx's 504 or
	// the request layer's TimeoutError) is not reported as failed: the capture
	// may have been stored (src/lib/capture-check.ts). Each capture request
	// carries a fresh client_capture_id (NEH-401). The viewport says the
	// capture may have been saved and checks: the button and the capture key
	// stay locked, and the viewport asks the backend for that id every 5 s,
	// until the capture is stored (then everything happens as after a
	// successful capture, and the line says it was saved), or the backend no
	// longer knows the id (then the error banner says no capture was saved),
	// or the check cannot learn the outcome (then the banner says so); in
	// both of the last two the controls are free. Unmounting, or another
	// volume, stops the check. The page's `captureGate` is the one gate for
	// starting any capture on the screen: this viewport takes it for its
	// request and its check, and takes no capture while anything else holds it
	// (`captureBusy`). A request belongs to the volume it began in: once the
	// volume has changed, or the viewport is gone, its answer shows nothing and
	// starts no check, the still-working timer is cancelled, and the last
	// capture shown in last-pair mode goes.
	//
	// "Retake the last opening" (NEH-388) sits to the left of the capture
	// button, past "Refocus" when there is one: the page passes `retakeLast` while it has a
	// record this screen captured or retook last that the backend would retake.
	// Pressing it shows the confirmation in its place; Confirm calls
	// `retakeLast`, which retakes through the image window's path and its
	// gate. The capture key and the pedal never press it or confirm it, and
	// take no capture while the confirmation shows. Its width is what the
	// board leaves beside the buttons around the capture button.
	//
	// In the page's set-up view (`setupView`, no volume chosen, NEH-351) the
	// previews and their controls work, and there is no capture button; the
	// capture key takes no capture (`captureReady` is false without a volume).
	//
	// Version: 0.4.0

	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import { m } from '$lib/i18n';
	import { browser } from '$app/environment';
	import {
		camerasApi,
		recordsApi,
		hasContinuousPreview,
		sessionRequestInit,
		getApiBase,
		isPreviewFrameFailedResponse,
		type CameraDevice
	} from '$lib/api';
	import { cameraStatus } from '$lib/stores/cameras';
	import { wbSamplingStore } from '$lib/stores/wbSampling';
	import { histogramStore, computeHistogram } from '$lib/stores/histogram';
	import {
		viewportAspect as computeViewportAspect,
		fitBox,
		frameAspect,
		panelGrowFactor
	} from '$lib/viewport-aspect';
	import {
		ownsEvent,
		readChords,
		shouldTrigger,
		type CaptureChord,
		type OwnsEventContext
	} from '$lib/capture-key';
	import { watchCaptureChords } from '$lib/capture-key-unit';
	import {
		createNoFrameRun,
		LAST_PAIR_NO_FRAME_ANSWERS,
		NO_FRAME_SECONDS,
		type NoFrameRun
	} from '$lib/no-frame-run';
	import { defaultRecordTitle } from '$lib/record-title';
	import { isConflict } from '$lib/volume-stem';
	import {
		CaptureFailed,
		CaptureNotSaved,
		CaptureOutcomeUnknown,
		captureErrorText
	} from '$lib/capture-errors';
	import {
		checkCaptureRequest,
		createCaptureGate,
		createReconciler,
		isCaptureAbandoned,
		isCaptureInProgress,
		isCaptureTimeout,
		mayReport,
		newClientCaptureId,
		whenSlow,
		type CaptureGate,
		type Reconciler
	} from '$lib/capture-check';
	import type { CaptureNotice } from '$lib/stores/cameras';
	import { userRole } from '$lib/stores/auth';
	import { dismissible, openDialogsOutside } from '$lib/dialog';
	import { powerControlOpen } from '$lib/stores/power';
	import PageCameraLabel from '$lib/components/PageCameraLabel.svelte';

	let {
		cameraMode,
		shutterSpeed,
		iso,
		aperture,
		projectId,
		projectName,
		collectionId,
		onCaptureDone,
		devices = [],
		rotateDeg = {},
		onRotateDegChange,
		otherModalOpen = false,
		needsStem = false,
		stemFormHref = '',
		stemNote = '',
		onStemRefused,
		onCaptureRefused,
		swapped = $bindable(false),
		pageCaptures = 0,
		pageCapturing = false,
		onRefocus,
		capturing = $bindable(false),
		captureBlocked = false,
		swapLocked = false,
		captureCheck,
		captureGate,
		captureReconciler,
		captureBusy = false,
		setupView = false,
		retakeLast,
		retakeLastId = null
	}: {
		cameraMode: 'single' | 'double';
		shutterSpeed: string;
		iso: string;
		aperture: string;
		projectId: number;
		projectName: string;
		collectionId: number;
		onCaptureDone: () => void;
		devices?: CameraDevice[];
		rotateDeg?: Record<number, number>;
		onRotateDegChange?: (cam: number, deg: number) => void;
		// NEH-228: true while the page's own image-inspection modal is open
		// (Book view's "inspectedRecord"). That modal is rendered by +page.svelte,
		// not by this component, so its openness arrives as a prop instead of
		// local state — the capture key must not fire while it's up.
		otherModalOpen?: boolean;
		// True while the volume has no stem (filename_stem): the backend refuses
		// every capture into it (409), so the button is disabled and a banner
		// links to the volume's form at stemFormHref.
		needsStem?: boolean;
		stemFormHref?: string;
		// Shown in the banner in place of the link, for someone who cannot give
		// the stem (an operator in Fisqua mode, NEH-311).
		stemNote?: string;
		// Called on a 409 from a capture. Reads the volume again and resolves
		// true when it has no stem, in which case the page sets needsStem and the
		// banner replaces the generic capture error.
		onStemRefused?: () => Promise<boolean>;
		// Called with the error of a refused capture that is not the no-stem
		// 409, before the error is reported: the page reads again the state a
		// camera set-up or colour card refusal names (NEH-427, NEH-425).
		onCaptureRefused?: (error: unknown) => void;
		// Whether camera 1 takes the left page of a pair. Bindable, so that the
		// page's own dual captures (a placeholder's, NEH-317) send the same
		// left_camera_index as this viewport's. No effect in single-camera mode.
		swapped?: boolean;
		// Counts the captures the page makes outside this viewport (retakes and
		// placeholders, NEH-334). Each increase clears the last capture shown in
		// last-pair mode, which such a capture may have superseded.
		pageCaptures?: number;
		// True while the page's own capture request (a retake, a placeholder)
		// is in flight. The cameras are busy with it, so no preview frame is
		// asked for meanwhile, as during this viewport's own capture.
		pageCapturing?: boolean;
		// NEH-339: opens the page's focus check. Passed only on a unit whose
		// capabilities report DSLR settings; without it there is no button.
		onRefocus?: () => void;
		// True while this viewport's own capture is in flight. Bindable, so the
		// page's automatic focus check waits for it (NEH-339).
		capturing?: boolean;
		// NEH-343: the unit needs to be told which camera is which. The capture
		// button is disabled and the capture key takes no capture until it has.
		captureBlocked?: boolean;
		// NEH-343: the saved camera roles decide left and right (the page sets
		// `swapped` from them), so the swap control is not shown.
		swapLocked?: boolean;
		// NEH-381: where the page learns of a capture the backend stored
		// (`confirmed`), from the request's answer or from the check after a
		// timeout. `imageIds` are in camera order.
		// `reread` reads the volume's records again, when a check ends as
		// unknown and when the background asks find the capture.
		captureCheck?: {
			confirmed: (
				recordId: number | null | undefined,
				imageIds: readonly number[] | null | undefined
			) => void;
			reread?: () => Promise<unknown>;
		};
		// The page's one gate for starting a capture; without it the viewport
		// has a gate of its own.
		captureGate?: CaptureGate;
		// The page's background asks for captures whose outcome is unknown
		// (NEH-401); without it the viewport has its own.
		captureReconciler?: Reconciler;
		// True while the gate is held, by this viewport or by the page: the
		// button and the capture key take no capture.
		captureBusy?: boolean;
		// The page has no volume (NEH-351): no capture button.
		setupView?: boolean;
		// NEH-388: retakes the record captured or retaken last here; absent
		// while there is none the backend would retake. `retakeLastId` names it.
		retakeLast?: () => Promise<void>;
		retakeLastId?: number | null;
	} = $props();

	// The rotate buttons are shown only with onRotateDegChange: the testing
	// account (NEH-391) saves no orientation, and gets none.
	function stepRotation(camIdx: number, delta: number) {
		const current = (rotateDeg ?? {})[camIdx] ?? 0;
		const next = (((current + delta) % 360) + 360) % 360;
		onRotateDegChange?.(camIdx, next);
	}

	let zoom = $state(1); // CSS zoom of the viewport (1 = 100%)
	let guideV = $state(50); // Vertical guide (% from the left)
	let guideH = $state(50); // Horizontal guide (% from the top)
	let dragging = $state<'v' | 'h' | null>(null);

	// swapped = true puts camera 1 on the left and camera 0 on the right.
	// The state is the `swapped` prop, bound by the page. It orders a pair
	// only: in single-camera mode the pane, the preview and the capture all
	// use camera 0, so every reader of leftIdx gets 0 there, and `swapped` is
	// kept unchanged for the return to dual mode.
	let leftIdx = $derived(cameraMode === 'double' && swapped ? 1 : 0);
	let rightIdx = $derived(cameraMode === 'double' && swapped ? 0 : 1);

	let gridRows = 3;
	let gridCols = 3;
	let showGrid = $state(false);
	let showGuides = $state(true);
	let showGridModal = $state(false);
	// The grid dialog's backdrop: any open dialog outside it is not this
	// component's (NEH-339).
	let gridBackdrop = $state<HTMLElement | null>(null);

	// ---------------------------------------------------------------------------
	// CAPTURE KEY (NEH-228)
	// A USB digitization pedal behaves as a keyboard that sends a single key,
	// different for each device. The unit stores the key, assigned in
	// Settings > Capture key (NEH-336, src/lib/capture-key-unit.ts). With none
	// stored, the space bar (an ordinary keyboard) and b (the project's foot
	// pedal) both trigger a capture; once a key is stored, only that key does.
	// ---------------------------------------------------------------------------
	// The unit's key (Settings > Capture key), or both defaults: the cached copy
	// first, then the unit's, read again at mount (src/lib/capture-key-unit.ts).
	let chords = $state<readonly CaptureChord[]>(readChords());
	$effect(() => watchCaptureChords((c) => (chords = c)));

	// Held-key latch: set when a key press starts a capture and released on the
	// matching keyup. If the keyup never arrives (the window lost focus in the
	// middle of the press), blur and visibilitychange release it as well —
	// otherwise a pedal released out of focus would block capture until the
	// page is reloaded.
	let chordHeld = $state(false);
	// The release is compared against the physical `code` of the key that set
	// the latch, never against the chord's key: releasing the modifier before the
	// key changes what that key reports (Shift+2 sets the latch with key "@"
	// and releases with key "2"), and `code` does not change with modifiers.
	// null when the latch is not set, or when the device reported no usable
	// `code` on the press.
	//
	// A release that does arrive always clears the latch: it clears when the
	// two `code`s (the press's and the release's) match, and also when either
	// of them lacks a usable `code` — a release without an identifiable `code`
	// is still a release. This is deliberately a weak guard, the third of
	// three: the capture-in-progress flag and the repeat flag already prevent
	// a second real capture; this latch only keeps an operating-system key
	// repeat from slipping an extra capture in between the keydown and its
	// keyup. A latch stuck for lack of a `code` is worse than one released too
	// early.
	let heldCode = $state<string | null>(null);

	// Any modal takes the keyboard away from capture. The grid settings
	// modal is local; the image-inspection modal lives in the
	// page (+page.svelte) and arrives as a prop; the power confirmation,
	// opened from the top bar's avatar menu, is reported through a store.
	let modalOpen = $derived(showGridModal || otherModalOpen || $powerControlOpen);

	// The floating controls are one column while it fits under the panel's
	// top offset; on a shorter viewport (the unit's 800x480 leaves this one
	// about 268px) they fold into a grid filled column by column. The height is
	// that of `.mat-board`, the panel's positioned parent, which sits inside
	// `.viewport-outer`'s padding; it is kept current by Svelte's
	// `bind:clientHeight` (a ResizeObserver). 0 means not yet measured.
	let boardW = $state(0);
	let boardH = $state(0);
	const PANEL_TOP = 75; // keep in step with `.floating-controls { top }`
	const PANEL_FRAME = 14; // 2 x 6px padding + 2 x 1px border
	const BTN = 44; // --touch-target-min
	const BTN_GAP = 4;
	let controlsOpen = $state(true);
	let panelButtons = $derived(!controlsOpen ? 1 : cameraMode === 'double' ? 7 : 6);
	let panelDividers = $derived(!controlsOpen ? 0 : cameraMode === 'double' ? 3 : 2);
	let panelOneColumnH = $derived(
		panelButtons * BTN + panelDividers + (panelButtons + panelDividers - 1) * BTN_GAP + PANEL_FRAME
	);
	let panelAvailH = $derived(boardH - PANEL_TOP);
	let panelOneColumn = $derived(boardH === 0 || panelOneColumnH <= panelAvailH);
	let panelRows = $derived(
		Math.max(1, Math.floor((panelAvailH - PANEL_FRAME + BTN_GAP) / (BTN + BTN_GAP)))
	);

	// Collapsible controls panel, open by default; collapsing it gives the feed
	// back the space the panel covers. The collapse button is always visible:
	// the Pi's touchscreen has no hover that could reveal it.

	let isCapturing = $state(false);
	$effect.pre(() => {
		capturing = isCapturing;
	});
	// A capture of this viewport's or of the page's is in flight: the cameras
	// are busy, so "Refresh preview" waits.
	let camerasBusy = $derived(isCapturing || pageCapturing);
	let captureFlash = $state(false);

	// Ready only once projectId and collectionId have resolved, so no capture
	// starts from an empty or malformed URL.
	const captureReady = $derived(projectId > 0 && collectionId > 0);
	// Ready, with a stem, and nothing blocking capture (NEH-343): the only
	// state that enables the capture button and the capture key.
	const canCapture = $derived(captureReady && !needsStem && !captureBlocked && !captureBusy);

	// NEH-388: the confirmation of "Retake the last opening" is showing. It
	// goes when the record it names changes or the button goes.
	let retakeConfirming = $state(false);
	let retakeConfirmFor: number | null = null;
	$effect(() => {
		const id = retakeLast ? retakeLastId : null;
		if (id !== retakeConfirmFor) {
			retakeConfirmFor = id;
			retakeConfirming = false;
		}
	});
	let retakeCancelBtn = $state<HTMLButtonElement | undefined>();
	let retakeLastBtn = $state<HTMLButtonElement | undefined>();
	let captureBtn = $state<HTMLButtonElement | undefined>();
	// Room beside the capture button (60px), its 16px gap, "Refocus" (44px
	// and its 16px gap) when there is one, and 12px to the board's edge.
	let retakeWidth = $derived(
		Math.max(0, Math.min(280, boardW / 2 - 30 - 16 - (onRefocus ? 60 : 0) - 12))
	);

	async function askRetakeLast() {
		if (!retakeLast || isCapturing || !canCapture) return;
		retakeConfirming = true;
		await tick();
		retakeCancelBtn?.focus();
	}

	async function cancelRetakeLast() {
		retakeConfirming = false;
		await tick();
		retakeLastBtn?.focus();
	}

	// Confirm takes its own button away; once the retake has settled, sent,
	// refused or failed, focus goes to the button if it still shows, else to
	// the capture button.
	async function confirmRetakeLast() {
		retakeConfirming = false;
		if (!retakeLast || isCapturing || !canCapture) return;
		await retakeLast();
		await tick();
		if (destroyed) return;
		if (retakeLastBtn?.isConnected) retakeLastBtn.focus();
		else captureBtn?.focus();
	}

	// Its rect turns pointer positions into guide percentages.
	let viewportEl = $state<HTMLElement | null>(null);

	// Preview refresh interval in milliseconds. Raise it if the Pi struggles
	// (e.g. 3000 = 3 s); lower it for a smoother preview if the hardware allows
	// (e.g. 1000 = 1 s).
	const PREVIEW_INTERVAL_MS = 2000;

	// A connected camera that sent no frame answers 503 preview_frame_failed
	// (NEH-349): its pane keeps the last frame and polling goes on. Once such
	// answers have lasted NO_FRAME_SECONDS (src/lib/no-frame-run.ts, the same
	// on the overview) the pane shows "connected, no image" (not the
	// missing-camera notice, since the camera is connected). Last-pair mode
	// asks only when the operator does (on entry, after a capture, "Refresh
	// preview"), so it has no pace to measure seconds by: it shows the same
	// notice after LAST_PAIR_NO_FRAME_ANSWERS such answers in a row.

	// Object URLs of the latest preview frame from each camera, keyed by camera
	// index. Which index shows on the left depends on `swapped`.
	let previewUrls = $state<Record<number, string>>({});

	// How the panes are fed (NEH-334): 'pending' until the capabilities
	// answer, then 'continuous' (polled, as before) or 'last-pair' (one frame
	// on entry, the last capture after each capture, a frame on request). A
	// missing field, a failed request or no answer within
	// CAPABILITIES_TIMEOUT_MS means 'continuous'.
	let previewMode = $state<'pending' | 'continuous' | 'last-pair'>('pending');
	let lastPair = $derived(previewMode === 'last-pair');
	// False when the backend reports `live_preview: false` (it cannot return a
	// frame): last-pair mode then fetches nothing and has no refresh button.
	let framesAvailable = $state(true);
	const CAPABILITIES_TIMEOUT_MS = 5000;
	let capabilitiesTimer: ReturnType<typeof setTimeout> | null = null;

	// In last-pair mode: object URLs of the most recent capture's thumbnails,
	// and what each camera's pane shows (nothing when absent), both keyed by
	// camera index. captureUrls only ever holds images of the most recent
	// capture, so a pane labelled "Last capture" never shows an older one.
	let captureUrls = $state<Record<number, string>>({});
	let paneKind = $state<Record<number, 'capture' | 'preview'>>({});
	// Last-pair fetches in flight; the refresh button waits for them.
	let framesInFlight = $state(0);
	// A last-pair fetch failed (other than a 404); cleared by the next good
	// frame or capture. Nothing retries, so the reconnect banner would mislead.
	let previewFailed = $state(false);
	// Each operation that sets panes takes a ticket and writes it against the
	// cameras it covers; on completion it sets a pane only if that pane's
	// ticket is still its own, so a slow answer never covers a newer one.
	let ticketSeq = 0;
	const paneTicket: Record<number, number> = {};
	// The ticket of the capture whose image each pane shows, and the tickets
	// of captures whose thumbnails are still loading.
	const captureTicketOf: Record<number, number> = {};
	const pendingCaptures = new Set<number>();
	// Set when the timeout chose the continuous preview before the
	// capabilities answered; a later answer may still switch to last-pair.
	let modeByTimeout = false;
	// The most recent successful capture's image ids on this visit, kept in
	// every mode (pending included) so that entering last-pair mode later can
	// show it; null before any capture and after a capture by the page, which
	// may have superseded it.
	let lastCaptureIds: number[] | null = null;
	let destroyed = false;

	function showsCapture(cam: number): boolean {
		return lastPair && paneKind[cam] === 'capture' && !!captureUrls[cam];
	}

	function shownUrl(cam: number): string | undefined {
		if (!lastPair) return previewUrls[cam];
		if (paneKind[cam] === 'capture') return captureUrls[cam];
		if (paneKind[cam] === 'preview') return previewUrls[cam];
		return undefined;
	}

	// A stored capture's thumbnail is already upright (the backend writes the
	// rotation into the file), so only a live frame is rotated on screen.
	function paneRotation(cam: number): number {
		return showsCapture(cam) ? 0 : (rotateDeg[cam] ?? 0);
	}

	// References to the live preview <img> elements for pixel sampling.
	let imgEl0: HTMLImageElement | null = $state(null);
	let imgEl1: HTMLImageElement | null = $state(null);

	// Measured size of each `.camera-feed` panel (px), so the rotated image is
	// not clipped by the panel's overflow: hidden — see `feedRotateStyle` below.
	let feedW0 = $state(0);
	let feedH0 = $state(0);
	let feedW1 = $state(0);
	let feedH1 = $state(0);

	// NEH-222: natural size (px) of the frame shown in each panel (0 = left,
	// 1 = right). The viewport takes its shape from these frames rather than
	// from a fixed 4:3 — see `viewportAspect` and `fitBox` below.
	let naturalW0 = $state(0);
	let naturalH0 = $state(0);
	let naturalW1 = $state(0);
	let naturalH1 = $state(0);

	// Measured size of the board (`.mat-board`): the viewport is sized in
	// pixels within it (a definite width: 100% defeats aspect-ratio
	// when height is the limit, so the viewport gets explicit dimensions
	// instead of relying on CSS to derive them). boardW and boardH are
	// declared above, with the floating controls, which also read boardH.

	// Viewport shape: the frame's in single mode; in double mode, the sum of
	// the two panels' widths at a common height.
	let viewportAspect = $derived(
		computeViewportAspect(
			[
				naturalW0 && naturalH0
					? { w: naturalW0, h: naturalH0, rotation: paneRotation(leftIdx) }
					: null,
				cameraMode === 'double' && naturalW1 && naturalH1
					? { w: naturalW1, h: naturalH1, rotation: paneRotation(rightIdx) }
					: null
			],
			cameraMode
		)
	);

	// Pixel box that gives the viewport that shape within the measured board.
	let viewportBox = $derived(fitBox(viewportAspect, boardW, boardH));

	// Each panel's flex-grow factor in double mode is its own frame's
	// shape, so no panel is clipped even when only one is rotated. A panel
	// with no frame yet (no signal, or waiting for the first frame) borrows the
	// other panel's shape instead of an even 1:1 — it falls back to 1 only when
	// neither has one.
	let leftFrameAspect = $derived(
		frameAspect({ w: naturalW0, h: naturalH0, rotation: paneRotation(leftIdx) })
	);
	let rightFrameAspect = $derived(
		frameAspect({ w: naturalW1, h: naturalH1, rotation: paneRotation(rightIdx) })
	);
	let leftFeedAspect = $derived(panelGrowFactor(leftFrameAspect, rightFrameAspect));
	let rightFeedAspect = $derived(panelGrowFactor(rightFrameAspect, leftFrameAspect));

	// A plain `transform: rotate()` on a box the size of the panel is clipped
	// at 90°/270°: the panel is a rectangle (landscape) and the rotated image
	// becomes portrait (or the reverse), so the rotated rectangle no longer
	// fits the original one and overflow: hidden cuts off its corners.
	//
	// Before rotating, the image gets the panel's size with width and height
	// swapped, absolutely centered. Rotated 90°/270°, that swapped box fits
	// the panel exactly. 180° keeps the orientation, so it needs no adjustment.
	function feedRotateStyle(rotation: number, containerW: number, containerH: number): string {
		if (rotation === 90 || rotation === 270) {
			if (!containerW || !containerH) return `transform: rotate(${rotation}deg);`;
			return `position: absolute; top: 50%; left: 50%; width: ${containerH}px; height: ${containerW}px; transform: translate(-50%, -50%) rotate(${rotation}deg);`;
		}
		if (rotation === 180) return `transform: rotate(180deg);`;
		return '';
	}

	// ---------------------------------------------------------------------------
	// WB SAMPLING — click-to-neutralize
	// Reads a 3×3 pixel block from the blob-URL preview image via an offscreen
	// canvas (same-origin: no CORS issue with blob URLs).
	// ---------------------------------------------------------------------------
	function samplePixel(
		imgEl: HTMLImageElement,
		event: MouseEvent
	): [number, number, number] | null {
		if (!imgEl || !imgEl.naturalWidth) return null;
		const rect = imgEl.getBoundingClientRect();
		const cx = Math.round(((event.clientX - rect.left) / rect.width) * imgEl.naturalWidth);
		const cy = Math.round(((event.clientY - rect.top) / rect.height) * imgEl.naturalHeight);
		const canvas = document.createElement('canvas');
		canvas.width = imgEl.naturalWidth;
		canvas.height = imgEl.naturalHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(imgEl, 0, 0);
		// Average a 3×3 block for robustness against noise
		const x0 = Math.max(0, cx - 1);
		const y0 = Math.max(0, cy - 1);
		const w = Math.min(3, imgEl.naturalWidth - x0);
		const h = Math.min(3, imgEl.naturalHeight - y0);
		const data = ctx.getImageData(x0, y0, w, h).data;
		let r = 0,
			g = 0,
			b = 0;
		const count = w * h;
		for (let i = 0; i < count; i++) {
			r += data[i * 4];
			g += data[i * 4 + 1];
			b += data[i * 4 + 2];
		}
		return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
	}

	function handleWbSampleClick(cameraIndex: number, event: MouseEvent) {
		const sampling = $wbSamplingStore;
		if (!sampling.active || sampling.cameraIndex !== cameraIndex) return;
		const imgEl = cameraIndex === 0 ? imgEl0 : imgEl1;
		if (!imgEl) return;
		const pixel = samplePixel(imgEl, event);
		if (pixel) {
			sampling.onSample?.(pixel[0], pixel[1], pixel[2]);
		}
		// Deactivate regardless so we don't get stuck
		wbSamplingStore.set({ active: false, cameraIndex: 0, onSample: null });
	}

	// null while polling is paused.
	let previewInterval: ReturnType<typeof setInterval> | null = null;

	// true while the tab is visible — polling pauses when the user switches
	// tabs, to save resources on the Raspberry Pi.
	let previewActive = $state(true);

	// One fetch in flight per camera, so requests never overlap: a second
	// caller while one is in flight shares its answer.
	type PreviewResult = 'ok' | 'missing' | 'no-frame' | 'error' | 'skipped';
	const previewInFlight: Record<number, Promise<PreviewResult> | undefined> = {};

	// Per camera, the 503 preview_frame_failed answers since that camera's
	// last other answer (the limit depends on the preview mode).
	const noFrameRun: Record<number, NoFrameRun> = {};
	const noFrameRunOf = (cam: number) => (noFrameRun[cam] ??= createNoFrameRun());

	// Per camera, the preview errors since that camera's last other answer.
	// The reconnect banner shows while any camera's run has reached the limit.
	const ERROR_RUN_LIMIT = 3;
	let previewErrorRun = $state<Record<number, number>>({});
	let previewConnectError = $derived(
		Object.values(previewErrorRun).some((n) => n >= ERROR_RUN_LIMIT)
	);

	// A single missing camera (404 on its last preview fetch, NEH-229).
	// Separate from previewConnectError: 404 is deliberately left out of the
	// error counter because the backend returns it when the camera is not
	// connected or its frame could not be captured, not when the backend is
	// down — but per camera it still drives an overlay on that camera's feed.
	// This overlay follows continuous polling, outside cameraRefresh. A 404
	// from before reconnect can briefly restore it after reconnect succeeds;
	// the next successful frame clears it. Unlike the dashboard, a 404 here
	// does not stop polling.
	let cameraMissing = $state<Record<number, boolean>>({});

	// A camera that is connected (its last preview answer was the 503
	// preview_frame_failed, NEH-349) but has sent no image for a whole run of
	// answers. Never true together with cameraMissing for the same camera.
	let cameraNoImage = $state<Record<number, boolean>>({});

	// What one preview request for a camera answered: a frame, a 404, the 503
	// preview_frame_failed, or any other failure.
	type CameraAnswer = 'ok' | 'missing' | 'no-frame' | 'error';

	// Every answer for a camera puts that camera in exactly one state, and
	// entering a state clears the marks of the others: the missing overlay,
	// the no-image notice and the reconnect banner's error count. This is the
	// only code that writes them, apart from the resets of stopping the
	// polling, switching the mode and starting the polling again. A 'no-frame'
	// answer is the backend confirming the connection, so it ends the error
	// run as a frame does. Each camera has its own error run: an answer ends
	// that camera's run only. A no-image notice, once shown, stays through further
	// 'no-frame' answers.
	function recordAnswer(cam: number, answer: CameraAnswer) {
		const run = noFrameRunOf(cam);
		let limitReached = false;
		if (answer === 'no-frame') {
			limitReached = run.noFrame(
				lastPair ? { answers: LAST_PAIR_NO_FRAME_ANSWERS } : { seconds: NO_FRAME_SECONDS }
			);
		} else {
			run.frame();
		}
		const missing = answer === 'missing';
		const noImage = answer === 'no-frame' && (limitReached || !!cameraNoImage[cam]);
		if (!!cameraMissing[cam] !== missing) cameraMissing = { ...cameraMissing, [cam]: missing };
		if (!!cameraNoImage[cam] !== noImage) cameraNoImage = { ...cameraNoImage, [cam]: noImage };
		const errors = answer === 'error' ? (previewErrorRun[cam] ?? 0) + 1 : 0;
		if ((previewErrorRun[cam] ?? 0) !== errors)
			previewErrorRun = { ...previewErrorRun, [cam]: errors };
	}

	// Calls GET /cameras/preview/{cameraIndex} (the endpoint is in the
	// backend's cameras.py). A 404 does not count toward the reconnect banner.
	// The previous object URL is revoked so frames do not leak memory.
	// Resolves 'ok' when a new frame arrived, 'missing' on a 404, 'no-frame' on
	// the 503 preview_frame_failed, 'error' on any other failure and 'skipped'
	// while the tab is hidden.
	function fetchPreview(cameraIndex: number): Promise<PreviewResult> {
		const inFlight = previewInFlight[cameraIndex];
		if (inFlight) return inFlight;
		if (!previewActive) return Promise.resolve('skipped');
		const request = requestPreview(cameraIndex).finally(() => {
			previewInFlight[cameraIndex] = undefined;
		});
		previewInFlight[cameraIndex] = request;
		return request;
	}

	async function requestPreview(cameraIndex: number): Promise<PreviewResult> {
		try {
			const response = await fetch(
				`${getApiBase()}/cameras/preview/${cameraIndex}`,
				sessionRequestInit()
			);

			if (response.ok) {
				const blob = await response.blob();
				const newUrl = URL.createObjectURL(blob);

				if (previewUrls[cameraIndex]) {
					URL.revokeObjectURL(previewUrls[cameraIndex]);
				}

				previewUrls = { ...previewUrls, [cameraIndex]: newUrl };
				// In last-pair mode fetchFrames records the answer, and only for a
				// pane its operation still holds.
				if (!lastPair) recordAnswer(cameraIndex, 'ok');
				return 'ok';
			} else if (response.status === 404) {
				// 404: the camera is not connected or its frame could not be
				// captured. It does not count as an error, but it shows in the
				// per-camera overlay (NEH-229).
				if (!lastPair) recordAnswer(cameraIndex, 'missing');
				return 'missing';
			} else if (await isPreviewFrameFailedResponse(response)) {
				// Connected, no frame this time: not an error, and the backend has
				// just said the camera is there. The pane keeps its frame until the
				// run reaches its limit.
				if (!lastPair) recordAnswer(cameraIndex, 'no-frame');
				return 'no-frame';
			} else {
				// Other errors (500, etc.) count toward the banner.
				if (!lastPair) recordAnswer(cameraIndex, 'error');
				return 'error';
			}
		} catch {
			// A network error counts toward the reconnect banner.
			if (!lastPair) recordAnswer(cameraIndex, 'error');
			return 'error';
		}
	}

	function activeCameras(): number[] {
		return cameraMode === 'double' ? [0, 1] : [0];
	}

	function takeTicket(cams: number[]): number {
		const ticket = ++ticketSeq;
		for (const cam of cams) paneTicket[cam] = ticket;
		return ticket;
	}

	function holdsTicket(cam: number, ticket: number): boolean {
		return !destroyed && paneTicket[cam] === ticket;
	}

	// Last-pair mode: fetches one frame for each of the given cameras and
	// shows the ones that arrived as a preview, on the panes no newer
	// operation has taken over. A 404 marks the camera missing; any other
	// failure, the 503 preview_frame_failed included, shows the refresh
	// message; nothing asks again by itself.
	async function fetchFrames(cams: number[]) {
		if (!framesAvailable || cams.length === 0) return;
		const ticket = takeTicket(cams);
		framesInFlight += 1;
		try {
			const results = await Promise.all(cams.map((cam) => fetchPreview(cam)));
			if (destroyed) return;
			// A result for a pane this operation no longer holds (a capture or a
			// newer fetch took it meanwhile) changes nothing for that pane: not
			// what it shows, not its missing-camera overlay, not the failure
			// notice. A stale failure would otherwise sit over a good capture,
			// with nothing polling to clear it.
			const held = results
				.map((result, i) => ({ cam: cams[i], result }))
				.filter(({ cam }) => holdsTicket(cam, ticket));
			if (held.length === 0) return;
			if (held.some(({ result }) => result === 'error' || result === 'no-frame'))
				previewFailed = true;
			else if (held.some(({ result }) => result === 'ok')) previewFailed = false;
			const nextKind = { ...paneKind };
			for (const { cam, result } of held) {
				if (result === 'skipped') continue;
				if (result === 'ok') nextKind[cam] = 'preview';
				recordAnswer(cam, result);
			}
			paneKind = nextKind;
		} finally {
			framesInFlight -= 1;
		}
	}

	// "Refresh preview": one frame from each active camera. Never while a
	// capture or another last-pair fetch is in flight.
	function refreshPreview() {
		if (!lastPair || framesInFlight > 0 || camerasBusy) return;
		fetchFrames(activeCameras());
	}

	// Last-pair mode, on entry, when the camera mode changes, when the tab
	// becomes visible and after a capture: a frame for each active camera
	// whose pane has nothing to show, unless a capture whose thumbnails are
	// still loading owns the pane and will fill it.
	function fillEmptyPanes() {
		fetchFrames(
			activeCameras().filter((cam) => !shownUrl(cam) && !pendingCaptures.has(paneTicket[cam]))
		);
	}

	// Drops the capture images of the given cameras; their panes show nothing
	// until a frame arrives.
	function dropCaptures(cams: number[]) {
		const nextUrls = { ...captureUrls };
		const nextKind = { ...paneKind };
		for (const cam of cams) {
			if (nextUrls[cam]) URL.revokeObjectURL(nextUrls[cam]);
			delete nextUrls[cam];
			if (nextKind[cam] === 'capture') delete nextKind[cam];
		}
		captureUrls = nextUrls;
		paneKind = nextKind;
	}

	// Fetches a stored image's thumbnail as an object URL, as the preview
	// frames are, so the pane's <img> and the histogram read it the same way.
	// null when it cannot be had (a RAW master without a preview has none).
	async function fetchThumbnail(imageId: number): Promise<string | null> {
		try {
			const response = await fetch(recordsApi.getImageThumbnailUrl(imageId), sessionRequestInit());
			if (!response.ok) return null;
			return URL.createObjectURL(await response.blob());
		} catch {
			return null;
		}
	}

	// Last-pair mode, after a successful capture: each pane shows the
	// capture's image from its own camera. The backend lists image_ids in
	// camera order (camera 0, then camera 1), whichever page each took, so
	// the pane of the camera on the left shows the left page. A camera the
	// capture did not use loses its older capture image; a camera whose
	// thumbnail cannot be had loses it too and gets a fresh frame instead, so
	// "Last capture" only ever labels this capture's images.
	async function showCapturedPair(imageIds: number[] | undefined) {
		const ids = imageIds ?? [];
		const ticket = takeTicket([0, 1]);
		previewFailed = false;
		// Counted as a fetch in flight, so "Refresh preview" waits for the
		// thumbnails instead of racing them.
		pendingCaptures.add(ticket);
		framesInFlight += 1;
		let urls: (string | null)[];
		try {
			urls = await Promise.all(ids.map((id) => fetchThumbnail(id)));
		} finally {
			pendingCaptures.delete(ticket);
			framesInFlight -= 1;
		}
		if (destroyed) {
			urls.forEach((url) => {
				if (url) URL.revokeObjectURL(url);
			});
			return;
		}
		const nextUrls = { ...captureUrls };
		const nextKind = { ...paneKind };
		for (const cam of [0, 1]) {
			const url = urls[cam] ?? null;
			if (!holdsTicket(cam, ticket)) {
				// A newer operation owns the pane, so this image is discarded.
				if (url) URL.revokeObjectURL(url);
				// Invariant: a pane labelled "Last capture" shows an image of the
				// most recent capture, also when last-pair mode is entered after it
				// (enterLastPair shows lastCaptureIds through this same path). If the pane still shows a capture older than
				// this one, that capture is superseded: it goes, and the pane is
				// filled below like any empty one. A newer capture's image stays.
				if (nextKind[cam] === 'capture' && (captureTicketOf[cam] ?? 0) < ticket) {
					if (nextUrls[cam]) URL.revokeObjectURL(nextUrls[cam]);
					delete nextUrls[cam];
					delete nextKind[cam];
				}
				continue;
			}
			if (nextUrls[cam]) URL.revokeObjectURL(nextUrls[cam]);
			delete nextUrls[cam];
			if (url) {
				nextUrls[cam] = url;
				nextKind[cam] = 'capture';
				captureTicketOf[cam] = ticket;
				recordAnswer(cam, 'ok');
			} else if (cam < ids.length || nextKind[cam] === 'capture') {
				// In this capture without a thumbnail, or showing an older capture.
				delete nextKind[cam];
			}
		}
		captureUrls = nextUrls;
		paneKind = nextKind;
		// The cameras whose thumbnail failed are empty now, so this covers them.
		fillEmptyPanes();
	}

	// The page captured outside this viewport (NEH-334): what the panes show
	// may have been superseded, so the capture images go and each active
	// camera gets a fresh frame.
	function pageCaptured() {
		lastCaptureIds = null;
		if (!lastPair) return;
		takeTicket([0, 1]);
		dropCaptures([0, 1]);
		fetchFrames(activeCameras());
	}

	let seenPageCaptures = untrack(() => pageCaptures);
	$effect(() => {
		const count = pageCaptures;
		if (count === seenPageCaptures) return;
		seenPageCaptures = count;
		untrack(pageCaptured);
	});

	function settlePreviewMode(continuous: boolean, frames: boolean) {
		if (destroyed || previewMode !== 'pending') return;
		if (capabilitiesTimer) {
			clearTimeout(capabilitiesTimer);
			capabilitiesTimer = null;
		}
		framesAvailable = frames;
		previewMode = continuous && frames ? 'continuous' : 'last-pair';
		if (previewMode === 'last-pair') enterLastPair();
	}

	// Entering last-pair mode, at the first settle or on a late answer: a
	// capture made before then shows as the last capture, through the same
	// path as a capture's own result. Its pending ticket keeps the `$effect`'s
	// fill off the panes it covers; the rest are filled with fetched frames.
	function enterLastPair() {
		if (lastCaptureIds && lastCaptureIds.length > 0) showCapturedPair(lastCaptureIds);
	}

	// The capabilities answered after the timeout had chosen the continuous
	// preview. The answer is authoritative: if it rules out polling, the
	// polling stops, the frames already on screen are labelled as previews,
	// and the `$effect` below fills the empty panes. Otherwise nothing changes.
	function lateAnswer(continuous: boolean, frames: boolean) {
		if (destroyed || !modeByTimeout || previewMode !== 'continuous') return;
		modeByTimeout = false;
		if (continuous && frames) return;
		if (previewInterval) {
			clearInterval(previewInterval);
			previewInterval = null;
		}
		framesAvailable = frames;
		// Polls that were failing would lose their notice with the reconnect
		// banner, which last-pair mode does not show: they carry over as the
		// last-pair failure message, cleared as usual by the next good frame or
		// capture. The counter starts again, so it affects nothing later.
		if (Object.values(previewErrorRun).some((n) => n > 0)) previewFailed = true;
		previewErrorRun = {};
		const kinds: Record<number, 'capture' | 'preview'> = {};
		for (const cam of [0, 1]) if (previewUrls[cam]) kinds[cam] = 'preview';
		paneKind = kinds;
		previewMode = 'last-pair';
		enterLastPair();
	}

	// The first of the capabilities answer and CAPABILITIES_TIMEOUT_MS
	// decides the mode; an answer after the timeout goes to lateAnswer.
	async function loadPreviewMode() {
		capabilitiesTimer = setTimeout(() => {
			capabilitiesTimer = null;
			if (destroyed || previewMode !== 'pending') return;
			modeByTimeout = true;
			settlePreviewMode(true, true);
		}, CAPABILITIES_TIMEOUT_MS);
		let continuous = true;
		let frames = true;
		try {
			const caps = await camerasApi.getCapabilities();
			continuous = hasContinuousPreview(caps);
			frames = caps?.live_preview !== false;
		} catch {
			// No capabilities: the continuous preview, as before.
		}
		if (modeByTimeout) lateAnswer(continuous, frames);
		else settlePreviewMode(continuous, frames);
	}

	// Called by the `$effect` below (on mount and whenever cameraMode changes)
	// and when the tab becomes visible again. Clears the previous interval
	// before creating a new one.
	function startPreviewPolling() {
		if (previewInterval) {
			clearInterval(previewInterval);
			previewInterval = null;
		}

		// Every camera's run of no-frame answers and of errors starts again.
		// A camera the new mode does not poll would otherwise keep its error
		// run, and with it the reconnect banner, with no answer left to end it.
		for (const cam of Object.keys(noFrameRun)) noFrameRun[Number(cam)].reset();
		cameraNoImage = {};
		previewErrorRun = {};

		// Fetch at once rather than waiting for the first interval.
		fetchPreview(0);
		if (cameraMode === 'double') fetchPreview(1);

		previewInterval = setInterval(() => {
			fetchPreview(0);
			if (cameraMode === 'double') fetchPreview(1);
		}, PREVIEW_INTERVAL_MS);
	}

	// Polling pauses while the tab is hidden, to save resources on the
	// Raspberry Pi.
	function handleVisibilityChange() {
		previewActive = !document.hidden;
		if (previewActive) {
			// Only the continuous preview resumes; last-pair mode never polls,
			// but fills a pane left empty while the tab was hidden.
			if (previewMode === 'continuous') startPreviewPolling();
			else if (previewMode === 'last-pair') fillEmptyPanes();
		} else {
			if (previewInterval) {
				clearInterval(previewInterval);
				previewInterval = null;
			}
			// NEH-228: also releases the held-key latch — one of the two recovery
			// paths for a keyup that never arrives.
			clearChordLatch();
		}
	}

	onMount(() => {
		// Only the visibility listener and the capabilities request start here.
		// startPreviewPolling() is called from the `$effect` below once the
		// capabilities have answered; calling it here as well would start two
		// polling cycles.
		if (browser) {
			document.addEventListener('visibilitychange', handleVisibilityChange);
		}
		loadPreviewMode();
	});

	// Once the capabilities have answered, and whenever the camera mode
	// changes: the continuous preview (re)starts polling (e.g. from single to
	// double, so camera 1 is fetched as well); last-pair mode fetches a frame
	// only for a pane that has nothing to show.
	$effect(() => {
		const _mode = cameraMode; // read to subscribe the effect to cameraMode
		if (previewMode === 'continuous') {
			startPreviewPolling();
		} else if (previewMode === 'last-pair') {
			untrack(fillEmptyPanes);
		}
	});

	onDestroy(() => {
		destroyed = true;
		checkController?.abort();
		cancelSlow?.();
		stopOwnAsks();
		if (ownsNotice) cameraStatus.reportNotice(null);
		if (previewInterval) clearInterval(previewInterval);
		if (capabilitiesTimer) clearTimeout(capabilitiesTimer);

		[...Object.values(previewUrls), ...Object.values(captureUrls)].forEach((url) => {
			try {
				URL.revokeObjectURL(url);
			} catch {}
		});

		if (browser) {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	// Zoom is a CSS transform on the feeds wrapper — a visual adjustment of the
	// viewport that does not affect the camera. Camera zoom (ScalerCrop) is the
	// Zoom slider in CameraControls.
	function zoomIn() {
		zoom = Math.min(zoom + 0.2, 3);
	}
	function zoomOut() {
		zoom = Math.max(zoom - 0.2, 0.5);
	}
	function resetZoom() {
		zoom = 1;
	}

	// ---------------------------------------------------------------------------
	// DRAGGABLE GUIDES
	// ---------------------------------------------------------------------------
	// Pointer events, not mouse events: the device is operated by finger, and a
	// finger drag fires no mousedown/mousemove, so mouse handlers cannot move
	// the guides on the hardware they are made for (NEH-156). Pointer events
	// cover finger, stylus and mouse with the same code.
	//
	// The guide captures the pointer when grabbed, so the drag continues even
	// when the finger leaves the 24px strip — which is normal while dragging.
	// That is why the move and release handlers live on the guide itself, not
	// on the viewport.
	function startDrag(guide: 'v' | 'h', e: PointerEvent) {
		dragging = guide;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleGuideMove(e: PointerEvent) {
		if (!dragging || !viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		if (dragging === 'v') {
			guideV = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
		} else {
			guideH = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
		}
	}

	function stopDrag() {
		dragging = null;
	}

	const gate: CaptureGate = untrack(() => captureGate) ?? createCaptureGate();
	const reconciler: Reconciler = untrack(() => captureReconciler) ?? createReconciler();
	// This viewport's background asks: stopped on unmount and when the volume changes.
	const ownAsks = new Set<() => void>();
	function stopOwnAsks() {
		for (const stop of ownAsks) stop();
		ownAsks.clear();
	}

	// The check of a capture that ended in a timeout, and the still-working
	// timer of the request in flight: both stop on unmount and when the volume
	// changes.
	let checkController: AbortController | null = null;
	let cancelSlow: (() => void) | null = null;

	let seenCollectionId = untrack(() => collectionId);
	$effect(() => {
		const id = collectionId;
		if (id === seenCollectionId) return;
		seenCollectionId = id;
		untrack(() => {
			checkController?.abort();
			cancelSlow?.();
			stopOwnAsks();
			if (ownsNotice) notice(null);
			// The last capture shown belongs to the old volume.
			pageCaptured();
		});
	});

	// Whether the notice in the shared camera status is this viewport's, so
	// that leaving clears it and nothing else's.
	let ownsNotice = false;
	function notice(value: CaptureNotice | null) {
		ownsNotice = value !== null;
		cameraStatus.reportNotice(value);
	}

	// What is true once the backend has stored a capture, however the screen
	// learnt it (the request's answer, the check after a timeout, the
	// background asks): the page told of the record and its images
	// (`confirmed`, which makes it the last record), the flash, the banner
	// cleared (`clearBanner`), the page's read of the records, and in
	// last-pair mode the capture's images. The viewport has nothing more to
	// do after a capture: it opens, closes and navigates nothing. `imageIds`
	// are in camera order (camera 0, then 1). `may` is the capture's
	// mayReport (src/lib/capture-check.ts) (NEH-388).
	function captureStored(
		recordId: number | null | undefined,
		imageIds: number[],
		clearBanner: () => void
	) {
		captureCheck?.confirmed(recordId, imageIds);
		// The flash fires only once the backend has confirmed the capture: it
		// is the only success signal the operator sees, and if it always fired,
		// a failed capture would look identical to a good one and the page
		// would be lost unnoticed until review or export (NEH-72).
		captureFlash = true;
		setTimeout(() => {
			captureFlash = false;
		}, 150);

		clearBanner();
		onCaptureDone();
		// Not awaited: the thumbnails must not hold up the next capture.
		lastCaptureIds = imageIds;
		if (lastPair) showCapturedPair(imageIds);
	}

	// A capture whose request ended in a timeout, or in a 409
	// capture_in_progress: the controls stay locked (isCapturing) while the
	// backend is asked for `id`. A stored answer is the request's own answer,
	// image ids in camera order. An unknown outcome reads the records again
	// before the controls are free, and, while asking again can still learn
	// it, the reconciler goes on asking in the background: a capture found
	// then removes this attempt's message wherever it still shows, and goes
	// through captureStored, as a success does, while mayReport allows it;
	// after a newer capture it only reads the records again.
	async function checkTimedOut(
		id: string,
		dual: boolean,
		may: () => boolean,
		current: () => boolean
	) {
		const controller = new AbortController();
		checkController = controller;
		notice('maybe_saved');
		const outcome = await checkCaptureRequest({
			id,
			lookup: (key) => camerasApi.captureRequest(key),
			signal: controller.signal
		});
		if (checkController === controller) checkController = null;
		if (outcome.kind === 'stopped') return;
		if (!may()) return;
		if (outcome.kind === 'not-saved') {
			notice(null);
			cameraStatus.reportFailure(captureErrorText(new CaptureNotSaved(), $m, $userRole));
			return;
		}
		if (outcome.kind === 'unknown') {
			notice(null);
			await captureCheck?.reread?.();
			if (!may()) return;
			const error = new CaptureOutcomeUnknown('new', !dual);
			cameraStatus.reportFailure(captureErrorText(error, $m, $userRole), error);
			error.whenFound(() => cameraStatus.clearFailure(error));
			if (outcome.retry) {
				const stop = reconciler.start({
					id,
					lookup: (key) => camerasApi.captureRequest(key),
					onStored: (answer) => {
						ownAsks.delete(stop);
						if (!current()) return;
						// This attempt's message goes wherever it still shows.
						error.markFound();
						// A newer capture has started since: it owns the last
						// record, the panes and the banner; only the records
						// are read again.
						if (!may()) {
							void captureCheck?.reread?.();
							return;
						}
						captureStored(answer.record_id, answer.image_ids ?? [], () => {});
						// The notice takes the banner's place: not over a failure
						// written since.
						if (!$cameraStatus.captureError) notice('found');
					}
				});
				ownAsks.add(stop);
			}
			return;
		}
		const { record_id, image_ids } = outcome.answer;
		captureStored(record_id, image_ids ?? [], () => {
			if (may()) cameraStatus.reportSuccess();
		});
		notice('found');
	}

	async function handleCapture() {
		if (isCapturing || !canCapture) return;
		const release = gate.acquire();
		if (!release) return;
		const ticket = gate.serial();
		isCapturing = true;
		const volume = collectionId;
		// Still on the volume the request began in, with the viewport mounted.
		const current = () => !destroyed && collectionId === volume;
		// Asked after the last await before every write to the banner.
		const may = () => mayReport(gate, ticket, current);
		// One id per attempt: the request and the check after a timeout name it.
		const clientCaptureId = newClientCaptureId();
		const dual = cameraMode === 'double';
		const left = leftIdx;
		notice(null);
		const stopSlow = whenSlow(() => {
			if (may()) notice('still_working');
		});
		cancelSlow = stopSlow;

		try {
			const payload = {
				client_capture_id: clientCaptureId,
				project_name: projectName,
				collection_id: collectionId || undefined,
				record_title: defaultRecordTitle()
			};

			let result;
			try {
				if (dual) {
					result = await camerasApi.captureDual({
						...payload,
						left_camera_index: left,
						rotate_deg_cam0: rotateDeg[0] ?? 0,
						rotate_deg_cam1: rotateDeg[1] ?? 0
					});
				} else {
					result = await camerasApi.capture({
						...payload,
						camera_index: 0,
						rotate_deg: rotateDeg[0] ?? 0
					});
				}
			} finally {
				stopSlow();
				if (cancelSlow === stopSlow) cancelSlow = null;
				if (may()) notice(null);
			}
			// The answer belongs to the volume the request began in.
			if (!current()) return;

			if (!result.success) {
				// The backend's `error` is English; captureErrorText turns it into
				// the catalogue's message below.
				throw new CaptureFailed(result.error);
			}

			captureStored(result.record_id, result.image_ids ?? [], () => {
				if (may()) cameraStatus.reportSuccess();
			});
		} catch (error) {
			console.error('[LiveViewport] Capture error:', error);
			if (!current()) return;
			if (isCaptureTimeout(error) || isCaptureInProgress(error)) {
				await checkTimedOut(clientCaptureId, dual, may, current);
				return;
			}
			// The id was closed before this request reached the backend: nothing
			// was saved for this attempt; the next press takes a new id.
			if (isCaptureAbandoned(error)) {
				if (may()) cameraStatus.reportFailure(captureErrorText(error, $m, $userRole));
				return;
			}
			if (isConflict(error) && onStemRefused && (await onStemRefused())) {
				// The needs-stem banner says why, in the catalogue's words; the
				// backend's English text is not shown.
				return;
			}
			onCaptureRefused?.(error);
			// Every backend error is English; the operator sees the catalogue's
			// message for it, and the console has the original. The stem re-read
			// above may have outlived the volume or the viewport.
			if (may()) cameraStatus.reportFailure(captureErrorText(error, $m, $userRole, !dual));
		} finally {
			isCapturing = false;
			release();
		}
	}

	// ---------------------------------------------------------------------------
	// CAPTURE KEY — keyboard handling (NEH-228)
	//
	// ownsEvent and shouldTrigger answer different questions and are called
	// separately: ownsEvent decides whether the event belongs to
	// capture (and therefore whether preventDefault is called), regardless of
	// whether this particular press should start a capture. Conflating them
	// lets a held pedal's repeats through to whatever has focus — the first
	// press is cancelled, but every repeat after it activates the focused
	// button instead of the camera.
	// ---------------------------------------------------------------------------

	function ownsEventContext(): OwnsEventContext {
		return {
			chords,
			modalOpen,
			activeElement: browser ? document.activeElement : null
		};
	}

	function clearChordLatch() {
		chordHeld = false;
		heldCode = null;
	}

	// A dialog that is not this component's (the focus check, the page's
	// viewer, the power confirmation) has the keyboard: no capture (NEH-339).
	function foreignDialogOpen(): boolean {
		return openDialogsOutside([gridBackdrop]) > 0;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (foreignDialogOpen()) return;
		const ctx = ownsEventContext();
		if (!ownsEvent(event, ctx)) return;
		// Whenever the event belongs to capture, not only when it actually
		// starts one: otherwise every repeat after the first goes through to the
		// focused button.
		event.preventDefault();
		if (
			shouldTrigger(event, {
				...ctx,
				keyHeld: chordHeld,
				capturing: isCapturing,
				ready: canCapture && !retakeConfirming
			})
		) {
			chordHeld = true;
			// The physical `code` is stored, not the chord's key: it is the only thing
			// that still identifies this key when the release arrives with the
			// modifiers already up. If the event carries no usable `code`,
			// heldCode stays null and the next keyup of any key releases the latch.
			heldCode = event.code || null;
			handleCapture();
		}
	}

	function handleWindowKeyup(event: KeyboardEvent) {
		// Compared against the physical `code` that set the latch, not the
		// chord's key; the latch also clears when either side lacks a usable
		// `code`. See the comments on `chordHeld` and `heldCode` above.
		if (!heldCode || !event.code || event.code === heldCode) {
			clearChordLatch();
		}
	}

	function closeGridModal() {
		showGridModal = false;
	}

	// What a pane's picture and its "No signal" call the camera. Once the
	// roles are confirmed (`swapLocked`) the left pane is the even/verso page,
	// photographed by the right camera, and the right pane the odd/recto page,
	// by the left camera. Before that the camera step blocks capture, so a
	// pane names only its camera's number; in single-camera mode no side.
	function paneAlt(pane: 'left' | 'right', idx: number): string {
		if (cameraMode !== 'double') return $m.cam_fallback_name;
		if (!swapLocked) return `${$m.cam_fallback_name} ${idx + 1}`;
		return pane === 'left' ? $m.lv_camera_left_alt : $m.lv_camera_right_alt;
	}

	function paneNoSignal(pane: 'left' | 'right'): string {
		if (cameraMode !== 'double' || !swapLocked) return $m.lv_no_signal;
		return pane === 'left' ? $m.lv_no_signal_left : $m.lv_no_signal_right;
	}

	// The visible label on a pane's picture. Once the roles are confirmed in
	// double mode it names the camera and the page, as the picture's alt does,
	// in words or in the badge form by the pane's width (PageCameraLabel);
	// before that, the camera's number. In single mode it is the camera's own
	// label or model. The camera's label or model is the element's title.
	function cameraName(idx: number): string | undefined {
		const dev = devices.find((d) => d.index === idx);
		return dev?.label || dev?.model || undefined;
	}

	// A confirmed pair in double mode: the left pane shows the role-left
	// camera, the right pane the role-right one.
	let paneRoles = $derived(cameraMode === 'double' && swapLocked);

	function paneLabel(pane: 'left' | 'right', idx: number): string {
		if (cameraMode === 'double') return paneAlt(pane, idx);
		return cameraName(idx) ?? $m.cam_fallback_name;
	}

	// Before the roles are confirmed, the title is the camera's own label or
	// model; once they are, PageCameraLabel puts the words before it.
	function paneLabelTitle(idx: number): string | undefined {
		if (cameraMode !== 'double') return undefined;
		return cameraName(idx);
	}
</script>

<svelte:window
	onkeydown={handleWindowKeydown}
	onkeyup={handleWindowKeyup}
	onblur={clearChordLatch}
/>

<div class="viewport-outer">
	<div class="mat-board" bind:clientWidth={boardW} bind:clientHeight={boardH}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="camera-viewport"
			class:flash={captureFlash}
			bind:this={viewportEl}
			style={viewportBox.w && viewportBox.h
				? `width: ${viewportBox.w}px; height: ${viewportBox.h}px`
				: undefined}
		>
			<!-- Banners: the volume has no stem, or the last capture failed
           (NEH-72). The capture-error banner clears on the next good capture
           (`reportSuccess`), so it cannot stay up in the middle of a
           sequence. -->
			{#if needsStem && captureReady}
				<div class="needs-stem-banner" role="alert">
					<span class="material-symbols-outlined icon-sm" aria-hidden="true">warning</span>
					<span>{$m.lv_needs_stem}</span>
					{#if stemNote}
						<span class="needs-stem-note">{stemNote}</span>
					{:else if stemFormHref}
						<a class="needs-stem-link" href={stemFormHref}>{$m.lv_needs_stem_link}</a>
					{/if}
				</div>
			{:else if $cameraStatus.notice}
				<!-- NEH-381: a capture still in flight after 10 s, one that ended in
             a timeout and is being checked, or one the check found. -->
				<div class="capture-note-banner" role="status">
					{#if $cameraStatus.notice === 'found'}
						<span class="material-symbols-outlined icon-sm" aria-hidden="true">check_circle</span>
					{:else}
						<span class="material-symbols-outlined icon-sm" aria-hidden="true">sync</span>
					{/if}
					{$cameraStatus.notice === 'still_working'
						? $m.lv_capture_still_working
						: $cameraStatus.notice === 'maybe_saved'
							? $m.lv_capture_maybe_saved
							: $m.lv_capture_found}
				</div>
			{:else if $cameraStatus.captureError}
				<div class="capture-error-banner" role="alert">
					<span class="material-symbols-outlined icon-sm">error</span>
					<!-- `||`, not `??`: an empty message must also fall back to the
               catalogue, or the banner shows no text. -->
					{$cameraStatus.errorMessage || $m.lv_capture_error}
				</div>
			{/if}

			{#if lastPair}
				<!-- NEH-334: nothing retries in last-pair mode, so one failure says
             how to try again instead of "Reconnecting". -->
				{#if previewFailed}
					<div
						class="reconnect-banner preview-failed"
						class:stacked={$cameraStatus.captureError}
						role="status"
					>
						<span class="material-symbols-outlined icon-sm" aria-hidden="true">error</span>
						{$m.lv_preview_failed}
					</div>
				{/if}
			{:else if previewConnectError}
				<div class="reconnect-banner" class:stacked={$cameraStatus.captureError}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
						/>
					</svg>
					{$m.lv_reconnecting}
				</div>
			{/if}

			<div class="camera-feeds-wrapper" style="transform: scale({zoom})">
				<div
					class="camera-feed"
					bind:clientWidth={feedW0}
					bind:clientHeight={feedH0}
					style="flex-grow: {leftFeedAspect}"
				>
					{#if shownUrl(leftIdx)}
						<img
							bind:this={imgEl0}
							bind:naturalWidth={naturalW0}
							bind:naturalHeight={naturalH0}
							src={shownUrl(leftIdx)}
							alt={paneAlt('left', leftIdx)}
							class="feed-img"
							style={feedRotateStyle(paneRotation(leftIdx), feedW0, feedH0)}
							onload={() => {
								if (imgEl0)
									histogramStore.update((s) => ({ ...s, [leftIdx]: computeHistogram(imgEl0!) }));
							}}
						/>
						<!-- WB sampling overlay: visible only when picker is active for this camera -->
						{#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === leftIdx && !showsCapture(leftIdx)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="wb-sample-overlay"
								onclick={(e) => handleWbSampleClick(leftIdx, e)}
								title={$m.lv_wb_click_hint}
							></div>
						{/if}
					{:else if !cameraMissing[leftIdx] && !cameraNoImage[leftIdx]}
						<!-- No signal yet, or waiting for the first frame. Omitted when
                 the camera is marked missing: the NEH-229 notice says the same
                 with the concrete instruction, and both would sit in the
                 center of the feed. -->
						<div class="no-stream">
							<svg
								width="36"
								height="36"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
								/>
								<circle cx="12" cy="13" r="4" />
							</svg>
							<span>{paneNoSignal('left')}</span>
							<small>{$m.lv_check_hw}</small>
						</div>
					{/if}
					<!-- The camera returned 404 on its last fetch (NEH-229). -->
					{#if cameraMissing[leftIdx]}
						<div class="camera-missing" role="status">{$m.lv_camera_missing}</div>
					{:else if cameraNoImage[leftIdx]}
						<div class="camera-missing" role="status">{$m.lv_camera_no_image}</div>
					{/if}
					{#if paneRoles}
						<PageCameraLabel
							role="left"
							width={feedW0}
							title={cameraName(leftIdx)}
							class="feed-label"
						/>
					{:else}
						<div class="feed-label" title={paneLabelTitle(leftIdx)}>
							{paneLabel('left', leftIdx)}
						</div>
					{/if}
					<!-- Last-pair mode (NEH-334): whether the pane shows the last capture
               or a frame fetched on request, which is not saved. -->
					{#if lastPair && shownUrl(leftIdx)}
						<div class="feed-source">
							{showsCapture(leftIdx) ? $m.lv_last_capture : $m.lv_preview_unsaved}
						</div>
					{/if}
					<!-- Floating rotation overlay -->
					{#if onRotateDegChange}
						<div class="feed-rotate-overlay">
							<button
								class="feed-rotate-btn"
								onclick={() => stepRotation(leftIdx, -90)}
								aria-label={$m.lv_rotate_ccw}
								title={$m.lv_rotate_ccw}
							>
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
								>
									<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
									<path d="M3 3v5h5" />
								</svg>
							</button>
							<span class="feed-rotate-deg">{(rotateDeg ?? {})[leftIdx] ?? 0}°</span>
							<button
								class="feed-rotate-btn"
								onclick={() => stepRotation(leftIdx, 90)}
								aria-label={$m.lv_rotate_cw}
								title={$m.lv_rotate_cw}
							>
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
								>
									<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
									<path d="M21 3v5h-5" />
								</svg>
							</button>
						</div>
					{/if}
				</div>

				{#if cameraMode === 'double'}
					<div
						class="camera-feed"
						bind:clientWidth={feedW1}
						bind:clientHeight={feedH1}
						style="flex-grow: {rightFeedAspect}"
					>
						{#if shownUrl(rightIdx)}
							<img
								bind:this={imgEl1}
								bind:naturalWidth={naturalW1}
								bind:naturalHeight={naturalH1}
								src={shownUrl(rightIdx)}
								alt={paneAlt('right', rightIdx)}
								class="feed-img"
								style={feedRotateStyle(paneRotation(rightIdx), feedW1, feedH1)}
								onload={() => {
									if (imgEl1)
										histogramStore.update((s) => ({ ...s, [rightIdx]: computeHistogram(imgEl1!) }));
								}}
							/>
							{#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === rightIdx && !showsCapture(rightIdx)}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="wb-sample-overlay"
									onclick={(e) => handleWbSampleClick(rightIdx, e)}
									title={$m.lv_wb_click_hint}
								></div>
							{/if}
						{:else if !cameraMissing[rightIdx] && !cameraNoImage[rightIdx]}
							<!-- No signal yet, or waiting for the first frame. Omitted when
                   the camera is marked missing: the NEH-229 notice says the
                   same with the concrete instruction, and both would sit in
                   the center of the feed. -->
							<div class="no-stream">
								<svg
									width="36"
									height="36"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<path
										d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
									/>
									<circle cx="12" cy="13" r="4" />
								</svg>
								<span>{paneNoSignal('right')}</span>
								<small>{$m.lv_check_hw}</small>
							</div>
						{/if}
						<!-- The camera returned 404 on its last fetch (NEH-229). -->
						{#if cameraMissing[rightIdx]}
							<div class="camera-missing" role="status">{$m.lv_camera_missing}</div>
						{:else if cameraNoImage[rightIdx]}
							<div class="camera-missing" role="status">{$m.lv_camera_no_image}</div>
						{/if}
						{#if paneRoles}
							<PageCameraLabel
								role="right"
								width={feedW1}
								title={cameraName(rightIdx)}
								class="feed-label right"
							/>
						{:else}
							<div class="feed-label right" title={paneLabelTitle(rightIdx)}>
								{paneLabel('right', rightIdx)}
							</div>
						{/if}
						{#if lastPair && shownUrl(rightIdx)}
							<div class="feed-source right">
								{showsCapture(rightIdx) ? $m.lv_last_capture : $m.lv_preview_unsaved}
							</div>
						{/if}
						<!-- Floating rotation overlay -->
						{#if onRotateDegChange}
							<div class="feed-rotate-overlay">
								<button
									class="feed-rotate-btn"
									onclick={() => stepRotation(rightIdx, -90)}
									aria-label={$m.lv_rotate_ccw}
									title={$m.lv_rotate_ccw}
								>
									<svg
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
									>
										<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
										<path d="M3 3v5h5" />
									</svg>
								</button>
								<span class="feed-rotate-deg">{(rotateDeg ?? {})[rightIdx] ?? 0}°</span>
								<button
									class="feed-rotate-btn"
									onclick={() => stepRotation(rightIdx, 90)}
									aria-label={$m.lv_rotate_cw}
									title={$m.lv_rotate_cw}
								>
									<svg
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
									>
										<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
										<path d="M21 3v5h-5" />
									</svg>
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if showGrid}
				{#each Array.from({ length: gridCols - 1 }, (_, i) => i) as i}
					<div class="grid-line vertical" style="left: {(i + 1) * (100 / gridCols)}%"></div>
				{/each}
				{#each Array.from({ length: gridRows - 1 }, (_, i) => i) as i}
					<div class="grid-line horizontal" style="top: {(i + 1) * (100 / gridRows)}%"></div>
				{/each}
			{/if}

			{#if showGuides}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="guide vertical"
					style="left: {guideV}%"
					onpointerdown={(e) => startDrag('v', e)}
					onpointermove={handleGuideMove}
					onpointerup={stopDrag}
					onpointercancel={stopDrag}
				>
					<div class="guide-line"></div>
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="guide horizontal"
					style="top: {guideH}%"
					onpointerdown={(e) => startDrag('h', e)}
					onpointermove={handleGuideMove}
					onpointerup={stopDrag}
					onpointercancel={stopDrag}
				>
					<div class="guide-line"></div>
				</div>
			{/if}

			<div class="metadata-bar">
				<div class="metadata-values">
					<span>ISO {iso}</span>
					<span>{shutterSpeed}</span>
					<span>f/{aperture}</span>
					<span>50mm</span>
				</div>
			</div>
		</div>
		<!-- /camera-viewport -->

		<div
			class="floating-controls"
			class:collapsed={!controlsOpen}
			class:folded={!panelOneColumn}
			style={panelOneColumn ? undefined : `grid-template-rows: repeat(${panelRows}, ${BTN}px);`}
		>
			<button
				class="float-btn float-btn-toggle"
				onclick={() => (controlsOpen = !controlsOpen)}
				aria-expanded={controlsOpen}
				aria-label={controlsOpen ? $m.lv_controls_collapse : $m.lv_controls_expand}
				title={controlsOpen ? $m.lv_controls_collapse : $m.lv_controls_expand}
			>
				<svg
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if controlsOpen}
						<path d="M9 18l6-6-6-6" />
					{:else}
						<path d="M15 18l-6-6 6-6" />
					{/if}
				</svg>
			</button>
			{#if controlsOpen}
				{#if panelOneColumn}<div class="float-divider"></div>{/if}
				<button class="float-btn" onclick={zoomIn} aria-label={$m.lv_zoom_in} title={$m.lv_zoom_in}>
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
						<line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
					</svg>
				</button>
				<button
					class="float-btn"
					onclick={zoomOut}
					aria-label={$m.lv_zoom_out}
					title={$m.lv_zoom_out}
				>
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
						<line x1="8" y1="11" x2="14" y2="11" />
					</svg>
				</button>
				<button
					class="float-btn"
					onclick={resetZoom}
					aria-label={$m.col_fit_screen_aria}
					title={$m.col_fit_screen_aria}
				>
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
						/>
					</svg>
				</button>
				{#if panelOneColumn}<div class="float-divider"></div>{/if}
				<button
					class="float-btn"
					onclick={() => (showGridModal = true)}
					aria-label={$m.lv_grid_settings}
					title={$m.lv_grid_settings}
				>
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
						<rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
					</svg>
				</button>
				{#if cameraMode === 'double' && !swapLocked}
					{#if panelOneColumn}<div class="float-divider"></div>{/if}
					<button
						class="float-btn"
						class:float-btn-active={swapped}
						onclick={() => (swapped = !swapped)}
						aria-label={$m.lv_swap_orientation}
						title={swapped ? $m.lv_orientation_swapped : $m.lv_orientation_normal}
					>
						<span class="material-symbols-outlined" style="font-size:22px" aria-hidden="true"
							>swap_horiz</span
						>
					</button>
				{/if}
			{/if}
		</div>

		<div class="capture-btn-wrapper" class:setup-view={setupView}>
			{#if !setupView}
				<button
					class="capture-btn"
					bind:this={captureBtn}
					class:capturing={isCapturing}
					onclick={handleCapture}
					disabled={isCapturing || !canCapture}
					title={!captureReady ? $m.lv_capture_not_ready : needsStem ? $m.lv_needs_stem : undefined}
					aria-label={$m.lv_capture_btn}
				>
					<div class="capture-ring outer"></div>
					<div class="capture-ring middle"></div>
					<div class="capture-circle"></div>
				</button>
			{/if}
			{#if lastPair && framesAvailable}
				<!-- NEH-334: one live frame from each camera, never a capture. It sits
             beside the capture button, smaller and in the panel's colours. -->
				<button
					class="float-btn refresh-preview-btn"
					onclick={refreshPreview}
					disabled={framesInFlight > 0 || camerasBusy}
					aria-label={$m.lv_refresh_preview}
					title={$m.lv_refresh_preview}
				>
					<span class="material-symbols-outlined" style="font-size:22px" aria-hidden="true"
						>refresh</span
					>
				</button>
			{/if}
			{#if retakeLast && !setupView}
				{#if retakeConfirming}
					<div
						class="retake-last-confirm"
						style={`width: ${retakeWidth}px; max-height: ${Math.max(0, boardH - 32)}px; right: calc(100% + ${onRefocus ? 76 : 16}px);`}
						role="group"
						aria-labelledby="retake-last-q"
					>
						<p id="retake-last-q" class="retake-last-q">{$m.lvm_retake_confirm}</p>
						<div class="retake-last-btns">
							<button
								class="btn btn-secondary"
								bind:this={retakeCancelBtn}
								onclick={cancelRetakeLast}>{$m.common_cancel}</button
							>
							<button
								class="btn btn-danger"
								onclick={confirmRetakeLast}
								disabled={isCapturing || !canCapture}
							>
								<span class="material-symbols-outlined icon-sm" aria-hidden="true">check</span>
								{$m.common_confirm}
							</button>
						</div>
					</div>
				{:else}
					<button
						class="retake-last-btn"
						bind:this={retakeLastBtn}
						style={`max-width: ${retakeWidth}px; right: calc(100% + ${onRefocus ? 76 : 16}px);`}
						onclick={askRetakeLast}
						disabled={isCapturing || !canCapture}
					>
						<span class="material-symbols-outlined icon-sm" aria-hidden="true">refresh</span>
						<span>{$m.lv_retake_last(cameraMode !== 'double')}</span>
					</button>
				{/if}
			{/if}
			{#if onRefocus}
				<!-- NEH-339: the focus check, on the other side of the capture button,
             in the same panel style. Not while the cameras are capturing. -->
				<button
					class="float-btn refocus-btn"
					onclick={onRefocus}
					disabled={camerasBusy}
					aria-label={$m.focus_refocus}
					title={$m.focus_refocus}
				>
					<svg
						width="22"
						height="22"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<path
							d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
						/>
						<circle cx="12" cy="12" r="3" />
					</svg>
				</button>
			{/if}
		</div>
	</div>
	<!-- /mat-board -->
</div>
<!-- /viewport-outer -->

{#if showGridModal}
	<div
		class="modal-backdrop"
		bind:this={gridBackdrop}
		use:dismissible={{ onDismiss: closeGridModal }}
	>
		<div
			class="modal-card dialog-fit"
			role="dialog"
			aria-modal="true"
			aria-labelledby="grid-modal-title"
		>
			<h3 class="modal-title" id="grid-modal-title">{$m.lv_grid_modal_title}</h3>
			<p class="modal-subtitle">{$m.lv_grid_modal_subtitle}</p>
			<div class="modal-body">
				<div class="modal-toggle-row">
					<div>
						<p class="modal-toggle-title">{$m.lv_grid}</p>
						<p class="modal-toggle-sub">{$m.lv_grid_desc}</p>
					</div>
					<button
						class="toggle-btn"
						class:on={showGrid}
						onclick={() => (showGrid = !showGrid)}
						aria-label={$m.lv_grid}
						aria-pressed={showGrid}
					>
						<div class="toggle-thumb" class:on={showGrid}></div>
					</button>
				</div>
				<div class="modal-toggle-row">
					<div>
						<p class="modal-toggle-title">{$m.lv_guides}</p>
						<p class="modal-toggle-sub">{$m.lv_guides_desc}</p>
					</div>
					<button
						class="toggle-btn"
						class:on={showGuides}
						onclick={() => (showGuides = !showGuides)}
						aria-label={$m.lv_guides}
						aria-pressed={showGuides}
					>
						<div class="toggle-thumb" class:on={showGuides}></div>
					</button>
				</div>
			</div>
			<div class="modal-actions">
				<button class="modal-btn confirm" onclick={closeGridModal}>{$m.common_close}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.viewport-outer {
		flex: 1;
		position: relative;
		background-color: var(--color-bg);
		overflow: hidden;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.mat-board {
		position: relative;
		width: 100%;
		height: 100%;
		background-color: #2c2920;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
	}

	/* The banners are centred with margin-inline: auto between left: 0 and
     right: 0, not with left: 50% and a transform: left: 50% leaves a box only
     the right half of the feed to size itself in, so on the unit's narrow
     feed the text wrapped to a word per line (NEH-324). */
	/* Failed-capture banner — the same visual language as the reconnect
     banner, but opaque and without the pulse: it is a state that calls for
     action, not a wait. z-index 60 puts it above everything drawn in the
     viewport (guides and overlays go up to 50), so it is not hidden while
     the operator has the framing guides on. */
	/* Same place and shape as the error banner, in neutral colours. */
	.capture-note-banner {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		margin-inline: auto;
		width: fit-content;
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 80%;
		padding: 8px 16px;
		background: rgba(30, 30, 30, 0.92);
		color: #fff;
		font-size: 0.8rem;
		border-radius: 20px;
		backdrop-filter: blur(4px);
		pointer-events: none;
	}

	.capture-error-banner {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		margin-inline: auto;
		width: fit-content;
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 80%;
		padding: 8px 16px;
		background: rgba(190, 45, 35, 0.96);
		color: #fff;
		font-size: 0.8rem;
		border-radius: 20px;
		backdrop-filter: blur(4px);
		pointer-events: none;
	}

	/* Banner: the volume has no stem. Unlike the error banner, it receives
     clicks: it carries the link to the volume's form. */
	.needs-stem-banner {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		margin-inline: auto;
		width: fit-content;
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 80%;
		padding: 8px 16px;
		background: rgba(30, 30, 30, 0.94);
		border: 1px solid var(--color-highlight);
		color: #fff;
		font-size: 0.8rem;
		border-radius: 20px;
		backdrop-filter: blur(4px);
	}
	.needs-stem-link {
		color: var(--color-highlight);
		font-weight: var(--fw-bold);
		text-decoration: underline;
		white-space: nowrap;
	}

	.reconnect-banner {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		margin-inline: auto;
		width: fit-content;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 80%;
		padding: 6px 14px;
		background: rgba(220, 80, 60, 0.88);
		color: #fff;
		font-size: 0.75rem;
		border-radius: 20px;
		backdrop-filter: blur(4px);
		pointer-events: none;
		animation: pulse-opacity 1.5s ease-in-out infinite;
	}

	/* A failed capture and a lost preview connection can show both banners at
     once, both centered at the top: the reconnect banner then moves down so
     it is not hidden under the failed-capture banner. */
	.reconnect-banner.stacked {
		top: 52px;
	}

	/* Last-pair mode's failed fetch: the same banner, still, since nothing is
     being retried. */
	.reconnect-banner.preview-failed {
		animation: none;
	}

	@keyframes pulse-opacity {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	/* width/aspect-ratio are the fallback until the board (.mat-board) is
     first measured — viewportBox is 0x0 on that first tick and the element
     has no inline size yet, so without them it would collapse to 0. Once
     viewportBox is no longer 0x0, the inline size (width/height in px)
     overrides these two rules. max-height: 100% is deliberately absent:
     with width: 100% it would cut the height but not the width and break
     the aspect ratio, and the inline size from fitBox already fits the
     board. */
	.camera-viewport {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		background-color: #0a0a0a;
		border: 1px solid rgba(90, 140, 98, 0.2);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
		overflow: hidden;
		cursor: crosshair;
	}

	.camera-viewport.flash::after {
		content: '';
		position: absolute;
		inset: 0;
		background-color: rgba(255, 255, 255, 0.3);
		z-index: 50;
		pointer-events: none;
		animation: flash 150ms ease;
	}

	@keyframes flash {
		0% {
			opacity: 0.3;
		}
		100% {
			opacity: 0;
		}
	}

	/* Holds the left and right panels side by side. In double mode each
     panel's flex-grow is set inline from its frame's shape (leftFeedAspect,
     rightFeedAspect). */
	.camera-feeds-wrapper {
		display: flex;
		width: 100%;
		height: 100%;
		transition: transform 0.3s ease;
	}

	.camera-feed {
		flex: 1 1 0;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		border-right: 1px solid rgba(255, 255, 255, 0.06);
	}

	.camera-feed:last-child {
		border-right: none;
	}

	/* Missing camera (404 on its last preview fetch, NEH-229) */
	.camera-missing {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: 80%;
		background: rgba(19, 17, 16, 0.85);
		backdrop-filter: blur(2px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-md);
		padding: 10px 16px;
		font-size: var(--text-sm);
		font-weight: var(--fw-medium);
		color: var(--color-light);
		text-align: center;
		z-index: 6;
		pointer-events: none;
	}

	.feed-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	/* Global because a confirmed pair's label is PageCameraLabel's element. */
	.camera-feed :global(.feed-label) {
		position: absolute;
		top: 8px;
		left: 8px;
		background: rgba(19, 17, 16, 0.75);
		backdrop-filter: blur(2px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 4px 10px;
		font-size: 14px;
		font-weight: 700;
		color: var(--color-light);
		pointer-events: none;
		z-index: 5;
		white-space: nowrap;
	}

	.camera-feed :global(.feed-label.right) {
		left: auto;
		right: 8px;
	}

	/* What a pane shows in last-pair mode (NEH-334), under the camera's
     label and in its style, lighter. */
	.feed-source {
		position: absolute;
		top: 44px;
		left: 8px;
		background: rgba(19, 17, 16, 0.75);
		backdrop-filter: blur(2px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 12px;
		font-weight: var(--fw-medium);
		color: var(--color-light-grey);
		pointer-events: none;
		z-index: 5;
	}

	.feed-source.right {
		left: auto;
		right: 8px;
	}

	.no-stream {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: var(--color-light-grey);
		opacity: 0.4;
		text-align: center;
		padding: 16px;
	}

	.no-stream span {
		font-size: var(--text-base);
		font-weight: var(--fw-medium);
	}
	.no-stream small {
		font-size: var(--text-sm);
	}

	.grid-line {
		position: absolute;
		pointer-events: none;
		z-index: 20;
		background-color: rgba(0, 210, 255, 0.5);
	}

	.grid-line.vertical {
		top: 0;
		bottom: 0;
		width: 1px;
	}
	.grid-line.horizontal {
		left: 0;
		right: 0;
		height: 1px;
	}

	.guide {
		position: absolute;
		z-index: 30;
		/* Without this the browser treats the gesture as a scroll and takes it
       over: pointer events stop arriving in the middle of the drag. */
		touch-action: none;
	}

	/* 24px, not 16: the strip has to be grabbed with a finger. It stays below
     the 44px touch minimum on purpose — a 44px vertical guide would cover a
     whole column of the image being framed, and unlike a button, a guide is
     visible before it is grabbed and is dragged rather than tapped. */
	.guide.vertical {
		top: 0;
		bottom: 0;
		width: 24px;
		margin-left: -12px;
		cursor: ew-resize;
	}
	.guide.horizontal {
		left: 0;
		right: 0;
		height: 24px;
		margin-top: -12px;
		cursor: ns-resize;
	}

	.guide-line {
		position: absolute;
		background-color: rgba(220, 50, 50, 0.8);
		transition: background-color var(--transition-fast);
	}

	.guide.vertical .guide-line {
		left: 50%;
		top: 0;
		bottom: 0;
		width: 1px;
		transform: translateX(-50%);
	}
	.guide.horizontal .guide-line {
		top: 50%;
		left: 0;
		right: 0;
		height: 1px;
		transform: translateY(-50%);
	}
	.guide:hover .guide-line {
		background-color: rgba(255, 80, 80, 1);
	}

	.metadata-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 32px;
		background-color: #18181b;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		padding: 0 16px;
		z-index: 40;
	}

	.metadata-values {
		display: flex;
		gap: 16px;
		font-family: monospace;
		font-size: 10px;
		color: var(--color-light-grey);
	}

	.floating-controls {
		position: absolute;
		top: 75px;
		right: 1px;
		z-index: 40;
		background-color: rgba(26, 24, 21, 0.9);
		backdrop-filter: blur(4px);
		border: 1px solid rgba(90, 140, 98, 0.3);
		border-radius: var(--radius-xl);
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 56px;
		align-items: center;
		/* No scroll on purpose: the panel is sized by its content. It sits inside
       the viewport, which clips any overflow, so any added control has to be
       checked against the space available. */
		transition: width var(--transition-base);
	}

	/* Collapsed: only the toggle button, to give the area back to the feed */
	.floating-controls.collapsed {
		background-color: rgba(26, 24, 21, 0.6);
	}

	/* Folded: a grid filled column by column, its row count set inline from the
     height available. `direction: rtl` starts the first column at the right
     edge, so the collapse toggle stays where it is when the panel opens, and
     the panel grows leftwards. */
	.floating-controls.folded {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: var(--touch-target-min);
		gap: 4px;
		width: auto;
		direction: rtl;
		justify-items: center;
		align-items: center;
	}

	.float-btn-toggle {
		color: var(--color-light);
	}

	.float-btn {
		/* 44px, not 64: the collection view's rail can afford 64 because it is a
       full-height bar; this panel sits inside the viewport. */
		width: var(--touch-target-min);
		height: var(--touch-target-min);
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-light-grey);
		border-radius: var(--radius-md);
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.float-btn:hover {
		color: var(--color-primary);
		background-color: rgba(255, 255, 255, 0.05);
	}
	.float-btn-active {
		color: var(--color-primary);
	}
	.float-btn-active:hover {
		color: var(--color-primary);
	}

	.float-divider {
		width: 32px;
		height: 1px;
		background-color: var(--border-color);
	}

	.capture-btn-wrapper {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 50;
	}

	/* Without the capture button the two buttons beside it keep their places. */
	.capture-btn-wrapper.setup-view {
		width: 60px;
		height: 60px;
	}

	.capture-btn {
		position: relative;
		width: 60px;
		height: 60px;
		background: none;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition: opacity var(--transition-fast);
	}

	.capture-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* "Refresh preview" (NEH-334): a panel button to the right of the capture
     button, which stays centred; the background and border are the
     floating panel's, so it reads as a control, not a second shutter. */
	.refresh-preview-btn {
		position: absolute;
		top: 50%;
		left: calc(100% + 16px);
		transform: translateY(-50%);
		background-color: rgba(26, 24, 21, 0.9);
		border: 1px solid rgba(90, 140, 98, 0.3);
		border-radius: 50%;
	}

	.refresh-preview-btn:hover:not(:disabled) {
		background-color: rgba(26, 24, 21, 0.9);
	}
	.refresh-preview-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* "Refocus" (NEH-339): the mirror of "Refresh preview", to the left of
     the capture button. */
	.refocus-btn {
		position: absolute;
		top: 50%;
		right: calc(100% + 16px);
		transform: translateY(-50%);
		background-color: rgba(26, 24, 21, 0.9);
		border: 1px solid rgba(90, 140, 98, 0.3);
		border-radius: 50%;
	}

	.refocus-btn:hover:not(:disabled) {
		background-color: rgba(26, 24, 21, 0.9);
	}
	.refocus-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* NEH-388: "Retake the last opening" and its confirmation, left of the
     capture button (past "Refocus"), bottom-aligned with it; the inline
     style sets the width the board leaves and the offset. */
	.retake-last-btn {
		position: absolute;
		bottom: 8px;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: var(--touch-target-min);
		width: max-content;
		padding: 6px 12px;
		background-color: rgba(26, 24, 21, 0.9);
		border: 1px solid rgba(90, 140, 98, 0.3);
		border-radius: var(--radius-xl);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		line-height: 1.25;
		text-align: left;
		color: var(--color-light);
		cursor: pointer;
	}
	.retake-last-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.retake-last-confirm {
		position: absolute;
		bottom: 0;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		overflow-y: auto;
		background-color: rgba(26, 24, 21, 0.95);
		border: 1px solid var(--color-highlight);
		border-radius: var(--radius-md);
	}
	.retake-last-q {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.35;
		color: var(--color-light);
	}
	.retake-last-btns {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.retake-last-btns .btn {
		flex: 1 1 auto;
		min-height: var(--touch-target-min);
		justify-content: center;
	}

	.capture-ring {
		position: absolute;
		border-radius: 50%;
		transition: transform var(--transition-fast);
	}

	.capture-ring.outer {
		inset: 0;
		border: 2px solid rgba(255, 255, 255, 0.6);
		animation: pulse-ring 2s ease infinite;
	}
	.capture-ring.middle {
		width: 52px;
		height: 52px;
		border: 1.5px solid rgba(255, 255, 255, 0.3);
	}

	.capture-circle {
		width: 44px;
		height: 44px;
		background-color: white;
		border-radius: 50%;
		box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
		transition: transform var(--transition-fast);
		z-index: 1;
	}

	.capture-btn:hover:not(:disabled) .capture-circle {
		transform: scale(0.93);
	}
	.capture-btn:active:not(:disabled) .capture-circle {
		transform: scale(0.88);
	}
	.capture-btn.capturing .capture-ring.outer {
		border-color: var(--color-primary);
		animation: none;
	}

	@keyframes pulse-ring {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.7;
			transform: scale(1.05);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* ── Modal ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
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
		padding: 32px 28px;
		width: 100%;
		max-width: 420px;
		box-shadow: var(--shadow-lg);
	}

	.modal-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0 0 6px;
	}
	.modal-subtitle {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0 0 24px;
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin-bottom: 24px;
	}

	.modal-toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px;
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
	}

	.modal-toggle-title {
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-light);
		margin: 0 0 2px;
	}
	.modal-toggle-sub {
		font-size: var(--text-xs);
		color: var(--color-light-grey);
		margin: 0;
	}

	.toggle-btn {
		width: 48px;
		height: 24px;
		border-radius: var(--radius-full);
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		cursor: pointer;
		position: relative;
		transition: background-color var(--transition-base);
		flex-shrink: 0;
	}

	.toggle-btn.on {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background-color: var(--color-light-grey);
		transition:
			transform var(--transition-base),
			background-color var(--transition-base);
	}

	.toggle-thumb.on {
		transform: translateX(24px);
		background-color: white;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
	}

	.modal-btn {
		flex: 1;
		height: 44px;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		cursor: pointer;
		transition: all var(--transition-base);
		border: 1px solid var(--border-color);
	}

	.modal-btn.confirm {
		background-color: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
		box-shadow: 0 4px 12px rgba(90, 140, 98, 0.3);
	}
	.modal-btn.confirm:hover {
		background-color: var(--color-primary-hover);
	}
</style>

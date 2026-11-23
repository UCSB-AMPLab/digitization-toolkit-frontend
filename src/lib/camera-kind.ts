// The kind of camera the unit drives (NEH-252, NEH-348), as the interface
// reads it from GET /system/camera-kind (app/api/system.py,
// app/core/camera_kind.py in the backend): the kind in effect and why, the
// administrator's stored choice, the cameras connected of each kind, which
// drivers the unit has, and whether the cameras connected are of another
// kind than the one in effect (`mismatch`) or of more than one kind
// (`mixed`).
//
// Settings > Cameras, Diagnostics and the capture screen read the same
// store, `cameraKind`. loadCameraKind() reads the route each time it is
// called; reads asked for while one is in flight share it. A backend
// without the route (404) leaves the store `absent`: the three places then
// show nothing new and no error, and Settings leaves Cameras out.
//
// An operator never sees the driver names (picamera2, gphoto2, chdk); every
// kind is shown by its name (kindName), and Diagnostics adds the driver name
// beside it.
//
// No static import of api.ts, so the pure helpers can be tested in plain
// node; the loader imports it when it first runs.

import { get, writable } from 'svelte/store';
import type { Messages } from './i18n';

export const CAMERA_KINDS = ['picamera2', 'gphoto2', 'chdk'] as const;
export type CameraKind = (typeof CAMERA_KINDS)[number];

export interface CameraKindReport {
	// The kind in effect as the backend names it; usually one of CAMERA_KINDS.
	configured: string;
	source: string;
	stored: CameraKind | null;
	pendingRestart: boolean;
	connected: Record<CameraKind, number | null>;
	available: Record<CameraKind, boolean>;
	mixed: boolean;
	mismatch: boolean;
}

function isKind(value: unknown): value is CameraKind {
	return typeof value === 'string' && (CAMERA_KINDS as readonly string[]).includes(value);
}

/** The GET /system/camera-kind body, or null for an answer of any other shape. */
export function readCameraKind(data: unknown): CameraKindReport | null {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const d = data as { [k: string]: unknown };
	if (typeof d.configured !== 'string' || typeof d.source !== 'string') return null;
	const connectedIn = (d.connected ?? {}) as { [k: string]: unknown };
	const availableIn = (d.available ?? {}) as { [k: string]: unknown };
	const connected = {} as Record<CameraKind, number | null>;
	const available = {} as Record<CameraKind, boolean>;
	for (const kind of CAMERA_KINDS) {
		const n = connectedIn[kind];
		connected[kind] = typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
		available[kind] = availableIn[kind] === true;
	}
	return {
		configured: d.configured,
		source: d.source,
		stored: isKind(d.stored) ? d.stored : null,
		pendingRestart: d.pending_restart === true,
		connected,
		available,
		mixed: d.mixed === true,
		mismatch: d.mismatch === true
	};
}

/** The kind the configured driver counts as: rpicam-still (`subprocess`) drives Pi cameras; null for any other name. */
export function kindOf(configured: string): CameraKind | null {
	if (configured === 'subprocess') return 'picamera2';
	return isKind(configured) ? configured : null;
}

/** The name of a kind ("Pi cameras"); a driver Captua has no name for is shown as the backend names it. */
export function kindName(kind: string, msgs: Messages): string {
	const k = kindOf(kind);
	if (k === 'picamera2') return msgs.camera_kind_picamera2;
	if (k === 'gphoto2') return msgs.camera_kind_gphoto2;
	if (k === 'chdk') return msgs.camera_kind_chdk;
	return kind;
}

/** A count of cameras of one kind ("2 Canon DSLR cameras"). */
export function kindCount(kind: CameraKind, n: number, msgs: Messages): string {
	if (kind === 'picamera2') return msgs.camera_kind_count_picamera2(n);
	if (kind === 'gphoto2') return msgs.camera_kind_count_gphoto2(n);
	return msgs.camera_kind_count_chdk(n);
}

/** One sentence for why the kind in effect is in effect; null for a source this version does not know. */
export function sourceText(source: string, msgs: Messages): string | null {
	switch (source) {
		case 'stored':
			return msgs.camera_kind_source_stored;
		case 'environment':
			return msgs.camera_kind_source_environment;
		case 'detected':
			return msgs.camera_kind_source_detected;
		case 'last_used':
			return msgs.camera_kind_source_last_used;
		case 'default':
			return msgs.camera_kind_source_default;
		default:
			return null;
	}
}

export type KindNotice =
	| { kind: 'mixed'; present: { kind: CameraKind; count: number }[] }
	| { kind: 'mismatch'; connected: CameraKind; count: number }
	| { kind: 'no_driver'; connected: CameraKind; count: number };

/**
 * What the unit's cameras call for: cameras of more than one kind connected
 * (`mixed`); cameras of another kind than the one in effect (`mismatch`),
 * or of a kind whose driver the unit lacks (`no_driver`). Only measured
 * counts make a notice: a null count never does.
 */
export function kindNotice(report: CameraKindReport | null): KindNotice | null {
	if (!report) return null;
	const present = CAMERA_KINDS.flatMap((kind) => {
		const count = report.connected[kind];
		return count !== null && count > 0 ? [{ kind, count }] : [];
	});
	if (report.mixed && present.length > 1) return { kind: 'mixed', present };
	if (!report.mismatch) return null;
	const own = kindOf(report.configured);
	const other = present.find((p) => p.kind !== own);
	if (!other) return null;
	return report.available[other.kind]
		? { kind: 'mismatch', connected: other.kind, count: other.count }
		: { kind: 'no_driver', connected: other.kind, count: other.count };
}

/** The notice's sentence. */
export function noticeText(notice: KindNotice, report: CameraKindReport, msgs: Messages): string {
	if (notice.kind === 'mixed')
		return msgs.camera_kind_mixed(notice.present.map((p) => kindCount(p.kind, p.count, msgs)));
	const connected = kindCount(notice.connected, notice.count, msgs);
	if (notice.kind === 'no_driver') return msgs.camera_kind_no_driver(connected, notice.count);
	return msgs.camera_kind_mismatch(kindName(report.configured, msgs), connected, notice.count);
}

/**
 * Whether PUT `choice` (DELETE for 'follow') restarts Captua, which then
 * owes the unit a restart until it has one: the backend's rule (the table
 * above put_camera_kind in app/api/system.py). "applied" is the choice the
 * process started with: the kind in effect when `source` is `stored`, none
 * otherwise. A is the kind in effect (`configured`), B another kind.
 *
 *   applied  stored  request  restarts
 *   none     none    PUT A    no   (A becomes the applied choice)
 *   none     none    PUT B    yes
 *   none     B       PUT B    yes
 *   none     B       PUT A    no
 *   none     B       DELETE   no
 *   none     none    DELETE   no
 *   A        A       DELETE   yes
 *   A        none    DELETE   yes
 *   A        none    PUT A    no
 *   A        A       PUT B    yes
 *   A        A       PUT A    no
 *
 * So a PUT restarts for any kind but the one in effect, compared as the
 * backend names it (rpicam-still's `subprocess` is not `picamera2`), and a
 * DELETE restarts while the process started with a stored choice. `stored`
 * and `pending_restart` do not change the answer.
 */
export function choiceRestarts(report: CameraKindReport, choice: CameraKind | 'follow'): boolean {
	if (choice === 'follow') return report.source === 'stored';
	return choice !== report.configured;
}

/** Whether two reports say the same about the kind: what a choice is decided from, and what the card shows. */
export function sameKindReport(a: CameraKindReport | null, b: CameraKindReport | null): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The refusal code of a 409 from PUT or DELETE /system/camera-kind, or null for any other error. */
export function kindRefusal(error: unknown): string | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return null;
	const code = (e.detail as { code?: unknown }).code;
	return typeof code === 'string' ? code : null;
}

/** One sentence per refusal code; the backend's English is never shown. */
export function kindRefusalText(code: string | null, msgs: Messages): string {
	switch (code) {
		case 'busy_capturing':
			return msgs.camera_kind_refused_busy_capturing;
		case 'offsite_job_running':
			return msgs.camera_kind_refused_offsite_job_running;
		case 'backend_restarting':
			return msgs.camera_kind_refused_backend_restarting;
		case 'driver_unavailable':
			return msgs.camera_kind_refused_driver_unavailable;
		default:
			return msgs.camera_kind_refused_other;
	}
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export type CameraKindState =
	| { status: 'unread' }
	| { status: 'ready'; report: CameraKindReport }
	// The backend has no such route (404): nothing is shown.
	| { status: 'absent' }
	// The read failed, or answered in a shape this version does not know.
	| { status: 'failed' };

export const cameraKind = writable<CameraKindState>({ status: 'unread' });

// What one request gave: `state`, what the store holds once it has answered
// (an earlier `ready` answer is kept over a failure), and `own`, what that
// request itself read.
interface ReadResult {
	state: CameraKindState;
	own: CameraKindState;
}

// The read in flight, which a mount shares.
let pending: Promise<ReadResult> | null = null;
// The fresh read asked for and not sent yet, which fresh callers share.
let freshQueued: Promise<ReadResult> | null = null;
// Raised by resetCameraKind, so a read that started before it is not kept.
let generation = 0;
// Each read takes the next number; an answer older than one already kept is dropped.
let sent = 0;
let kept = 0;

async function read(): Promise<ReadResult> {
	const { cameraKindApi } = await import('./api');
	const startedIn = generation;
	const seq = ++sent;
	let own: CameraKindState;
	try {
		const report = readCameraKind(await cameraKindApi.get());
		own = report ? { status: 'ready', report } : { status: 'failed' };
	} catch (err) {
		const status = (err as { status?: unknown } | null)?.status;
		own = status === 404 ? { status: 'absent' } : { status: 'failed' };
	}
	if (startedIn !== generation || seq < kept) return { state: get(cameraKind), own };
	kept = seq;
	// A failed read keeps an answer read before it: the screens go on showing
	// it, and the next of them to open reads again.
	if (own.status === 'failed' && get(cameraKind).status === 'ready')
		return { state: get(cameraKind), own };
	cameraKind.set(own);
	return { state: own, own };
}

function send(): Promise<ReadResult> {
	const p = read().finally(() => {
		if (pending === p) pending = null;
	});
	pending = p;
	return p;
}

// A read whose request is sent after the call: a read in flight is let
// settle first, then a new one goes out, which every fresh call made before
// it goes out shares.
function sendFresh(): Promise<ReadResult> {
	if (freshQueued) return freshQueued;
	const before = pending;
	// Declared first: the body reads it after its first await, by which time it is set.
	let queued: Promise<ReadResult> | null = null;
	queued = (async () => {
		await (before ? before.catch(() => undefined) : undefined);
		if (freshQueued === queued) freshQueued = null;
		return send();
	})();
	freshQueued = queued;
	return queued;
}

/**
 * Read GET /system/camera-kind into the store, and resolve what the store
 * holds then. A mount (the capture screen, Settings, Settings > Cameras,
 * Diagnostics) shares a read in flight; any other call sends a new one.
 * With `fresh` (after a reconnect, a change, a restart) the request is sent
 * after the call (sendFresh). Either way, when that request fails, the store
 * keeps the answer before, and the call resolves it: the screens go on
 * showing it, as the last answer and not a new one. A caller that decides
 * from the answer uses readCameraKindNow.
 */
export async function loadCameraKind(opts: { fresh?: boolean } = {}): Promise<CameraKindState> {
	const result = await (opts.fresh ? sendFresh() : (pending ?? send()));
	return result.state;
}

/**
 * The report of a request sent after the call, or null when that request
 * failed, found no route, or answered in a shape this version does not
 * know: never an answer read before. The store is updated as by
 * loadCameraKind. Settings > Cameras decides Save and "Restart now" from it.
 */
export async function readCameraKindNow(): Promise<CameraKindReport | null> {
	const { own } = await sendFresh();
	return own.status === 'ready' ? own.report : null;
}

/** Forget what was read (tests). */
export function resetCameraKind(): void {
	generation += 1;
	pending = null;
	freshQueued = null;
	cameraKind.set({ status: 'unread' });
}

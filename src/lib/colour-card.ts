// Colour card shots (NEH-340): a photograph of a colour reference card, one
// per camera, taken under the light and settings of the volume's pages so
// that its colours can be corrected later. The interface says "colour card";
// "calibration" names the camera calibration elsewhere.
//
// What the screens read from the backend (app/api/colour_card.py,
// app/core/colour_card.py):
// - GET /collections/{id}/colour-card: {enabled, needed, reason, status,
//   sets}. `needed` is true with a reason (start, begun_without,
//   settings_changed), false, or null when a camera's settings could not be
//   read; null never opens the step.
// - the `colour_card` summary on a volume in its list and detail answers:
//   {enabled: false} with the unit's setting off or in a testing volume,
//   else {enabled: true, status, sets}.
// - the refusals of the routes, {code, message}, told apart here by code;
//   a 404 with no code is the volume deleted meanwhile.
//
// No static import of api.ts, so this file is tested in plain node; an
// error is read by its `status` and `detail`, as capture-errors.ts does.
//
// Version: 0.3.0

import type { Messages } from './i18n';

export type ColourCardReason = 'start' | 'begun_without' | 'settings_changed';
export type ColourCardStatus = 'present' | 'skipped' | 'none';

export interface ColourCardShot {
	id: number;
	camera_index: number;
	capture_id: string;
	filename: string;
	// Whether a browser can be shown the shot: a JPEG master, or a RAW
	// master with its preview.
	preview: boolean;
	captured_at: string | null;
	captured_by: string | null;
	// The preview route, relative to the API base.
	url: string;
}

export interface ColourCardSet {
	id: number;
	number: number;
	outcome: 'taken' | 'skipped' | null;
	capture_mode: 'single' | 'dual';
	// The cameras of the set's mode, by index.
	cameras: number[];
	opened_at: string | null;
	opened_by: string | null;
	completed_at: string | null;
	completed_by: string | null;
	shots: ColourCardShot[];
	delivery: 'sent' | 'waiting' | 'undeliverable' | null;
	delivery_reason: string | null;
}

export interface ColourCardState {
	enabled: boolean;
	needed: boolean | null;
	reason: ColourCardReason | null;
	status: ColourCardStatus;
	sets: ColourCardSet[];
}

export type ColourCardSummary =
	| { enabled: false }
	| { enabled: true; status: ColourCardStatus; sets: number };

type Obj = { [k: string]: unknown };
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function readShot(raw: unknown): ColourCardShot | null {
	if (!isObj(raw) || typeof raw.id !== 'number' || typeof raw.camera_index !== 'number')
		return null;
	return {
		id: raw.id,
		camera_index: raw.camera_index,
		capture_id: str(raw.capture_id) ?? '',
		filename: str(raw.filename) ?? '',
		preview: raw.preview === true,
		captured_at: str(raw.captured_at),
		captured_by: str(raw.captured_by),
		url: str(raw.url) ?? ''
	};
}

/** A set as POST .../sets, .../complete and .../skip answer it, or null for another shape. */
export function readColourCardSet(raw: unknown): ColourCardSet | null {
	if (!isObj(raw) || typeof raw.id !== 'number') return null;
	const cameras = Array.isArray(raw.cameras)
		? raw.cameras.flatMap((c) =>
				isObj(c) && typeof c.camera_index === 'number' ? [c.camera_index] : []
			)
		: [];
	const shots = Array.isArray(raw.shots)
		? raw.shots.flatMap((s) => {
				const shot = readShot(s);
				return shot ? [shot] : [];
			})
		: [];
	const outcome = raw.outcome === 'taken' || raw.outcome === 'skipped' ? raw.outcome : null;
	const delivery =
		raw.delivery === 'sent' || raw.delivery === 'waiting' || raw.delivery === 'undeliverable'
			? raw.delivery
			: null;
	return {
		id: raw.id,
		number: typeof raw.number === 'number' ? raw.number : 0,
		outcome,
		capture_mode: raw.capture_mode === 'single' ? 'single' : 'dual',
		cameras,
		opened_at: str(raw.opened_at),
		opened_by: str(raw.opened_by),
		completed_at: str(raw.completed_at),
		completed_by: str(raw.completed_by),
		shots,
		delivery,
		delivery_reason: str(raw.delivery_reason)
	};
}

/** The GET /collections/{id}/colour-card body, or null for another shape. */
export function readColourCardState(raw: unknown): ColourCardState | null {
	if (!isObj(raw) || typeof raw.enabled !== 'boolean') return null;
	if (!(raw.needed === null || typeof raw.needed === 'boolean')) return null;
	const reason =
		raw.reason === 'start' || raw.reason === 'begun_without' || raw.reason === 'settings_changed'
			? raw.reason
			: null;
	const status =
		raw.status === 'present' || raw.status === 'skipped' ? raw.status : ('none' as const);
	const sets = Array.isArray(raw.sets)
		? raw.sets.flatMap((s) => {
				const set = readColourCardSet(s);
				return set ? [set] : [];
			})
		: [];
	return { enabled: raw.enabled, needed: raw.needed, reason, status, sets };
}

/** Whether the capture screen opens the step: asked for, and needed for certain. */
export function stepOpens(state: ColourCardState | null): boolean {
	return !!state && state.enabled && state.needed === true;
}

/** Whether every camera of the set has its shot ("Continue" is enabled only then). */
export function setComplete(set: ColourCardSet): boolean {
	return (
		set.cameras.length > 0 && set.cameras.every((c) => set.shots.some((s) => s.camera_index === c))
	);
}

/** The set's cameras in the order the capture screen shows them: the left pane's camera first. */
export function cameraOrder(set: ColourCardSet, leftIndex: number): number[] {
	return [...set.cameras].sort((a, b) => (a === leftIndex ? -1 : b === leftIndex ? 1 : a - b));
}

/**
 * The shot's image, inline. A shot taken again keeps its id and gets a new
 * capture id, so the capture id is in the address and the browser does not
 * show the earlier image from its cache.
 */
export function shotImageUrl(base: string, shot: ColourCardShot): string {
	return `${base}${shot.url}?v=${encodeURIComponent(shot.capture_id)}`;
}

/** The flag a volume carries in its lists and on its page: none, skipped, or nothing. */
export function colourCardFlag(
	summary: ColourCardSummary | { enabled?: unknown } | null | undefined
): 'none' | 'skipped' | null {
	if (!isObj(summary) || summary.enabled !== true) return null;
	const status = (summary as Obj).status;
	return status === 'none' || status === 'skipped' ? status : null;
}

export type ColourCardRefusal =
	| 'camera_busy'
	| 'not_connected'
	| 'capture_failed'
	| 'set_gone'
	| 'shots_missing'
	| 'not_enabled'
	| 'stem'
	| 'storage'
	| 'restarting'
	| 'volume_gone'
	| 'timeout'
	| 'failed';

/** Which refusal of the colour card routes an error is (module header). */
export function colourCardRefusal(error: unknown): ColourCardRefusal {
	if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
	if (!error || typeof error !== 'object') return 'failed';
	const e = error as { status?: unknown; detail?: unknown };
	const status = typeof e.status === 'number' ? e.status : null;
	const code = isObj(e.detail) && typeof e.detail.code === 'string' ? e.detail.code : null;
	if (status === 504) return 'timeout';
	switch (code) {
		case 'camera_busy':
			return 'camera_busy';
		case 'camera_not_connected':
			return 'not_connected';
		case 'colour_card_capture_failed':
			return 'capture_failed';
		case 'colour_card_set_closed':
		case 'colour_card_set_not_found':
		case 'colour_card_camera_not_in_set':
			return 'set_gone';
		case 'colour_card_shots_missing':
			return 'shots_missing';
		case 'colour_card_not_enabled':
			return 'not_enabled';
		case 'stem_required':
			return 'stem';
		case 'storage_reserve':
			return 'storage';
		case 'backend_restarting':
			return 'restarting';
	}
	if (status === 404 && code === null) return 'volume_gone';
	return 'failed';
}

function reasonText(reason: string | null, msgs: Messages): string | null {
	switch (reason) {
		case 'staging_failed':
			return msgs.cc_reason_staging_failed;
		case 'file_unstable':
			return msgs.cc_reason_file_unstable;
		case 'listed_without_sha1':
			return msgs.cc_reason_listed_without_sha1;
		case 'unverified':
			return msgs.cc_reason_unverified;
		case 'file_missing':
			return msgs.cc_reason_file_missing;
		case 'upload_refused':
			return msgs.cc_reason_upload_refused;
		default:
			return null;
	}
}

/** Where a taken set's shots are on their way offsite; null for an open or skipped set. */
export function deliveryText(set: ColourCardSet, msgs: Messages): string | null {
	if (set.delivery === 'sent') return msgs.cc_delivery_sent;
	const reason = reasonText(set.delivery_reason, msgs);
	if (set.delivery === 'waiting')
		return reason ? msgs.cc_delivery_waiting_because(reason) : msgs.cc_delivery_waiting;
	if (set.delivery === 'undeliverable')
		return msgs.cc_delivery_undeliverable(reason ?? msgs.cc_reason_file_missing);
	return null;
}

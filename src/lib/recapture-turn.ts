// ============================================================================
// The recapture turn on the frontend (0.2.0). While recaptures are pending
// anywhere on the unit, starting a new volume (one with no records)
// alternates with finishing recaptures: finishing every recapture of one
// volume opens the turn for one new volume, and the first capture into that
// volume hands the turn back to recaptures. The backend decides the turn and
// refuses what it forbids; this module reads what it says:
// - GET /records/to-retake/summary, checked for shape, so that an answer of
//   another shape blocks nothing;
// - the two 409s by their `detail.code`: a capture that would start an empty
//   volume during the retake turn, and the promotion of a volume with
//   rejected records;
// - which volume the queue offers first, the folios a rejection comment
//   names, and which record the guided retake opens next.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`), as capture-errors.ts does.
// ============================================================================
//
// Version: 0.2.0

import type { QueueItem, RetakeSummary, RetakeSummaryVolume } from './api';

export const RECAPTURE_TURN_CODE = 'recapture_turn';
export const RECAPTURES_PENDING_CODE = 'recaptures_pending';

const TURN_STATES = new Set(['free', 'new', 'recaptures']);

function isVolume(v: unknown): v is RetakeSummaryVolume {
	if (!v || typeof v !== 'object') return false;
	const x = v as { [k: string]: unknown };
	return (
		typeof x.collectionId === 'number' &&
		typeof x.projectId === 'number' &&
		typeof x.name === 'string' &&
		typeof x.pending === 'number' &&
		typeof x.total === 'number' &&
		typeof x.firstPendingRecordId === 'number' &&
		Array.isArray(x.pendingRecordIds) &&
		x.pendingRecordIds.every((id) => typeof id === 'number')
	);
}

/** The summary as the contract gives it, or null for an answer of any other shape. */
export function readRetakeSummary(data: unknown): RetakeSummary | null {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const x = data as { pendingRecords?: unknown; volumes?: unknown; turn?: unknown };
	if (typeof x.pendingRecords !== 'number' || !Array.isArray(x.volumes) || !x.volumes.every(isVolume)) return null;
	const turn = x.turn as { state?: unknown; unlockedBy?: unknown } | null | undefined;
	if (!turn || typeof turn.state !== 'string' || !TURN_STATES.has(turn.state)) return null;
	return data as RetakeSummary;
}

function detailOf(error: unknown, status: number): { [k: string]: unknown } | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== status || typeof e.detail !== 'object' || e.detail === null) return null;
	return e.detail as { [k: string]: unknown };
}

/** Whether a capture was refused because it would start a volume during the retake turn. */
export function isRecaptureTurnRefusal(error: unknown): boolean {
	return detailOf(error, 409)?.code === RECAPTURE_TURN_CODE;
}

/** How many retakes a refused promotion says are left, or null for any other failure. */
export function recapturesPendingCount(error: unknown): number | null {
	const detail = detailOf(error, 409);
	if (detail?.code !== RECAPTURES_PENDING_CODE || typeof detail.pending !== 'number') return null;
	return detail.pending;
}

/** The summary's volumes by collection id; empty without a summary. */
export function retakeVolumeMap(summary: RetakeSummary | null): Map<number, RetakeSummaryVolume> {
	return new Map((summary?.volumes ?? []).map((v) => [v.collectionId, v]));
}

/**
 * The volume to retake next: the first item of the list, in list order,
 * whose volume has retakes pending, as Cola's Siguiente; without one, the
 * volume with most pending (the summary's first). Null when none is pending.
 */
export function preferredRetakeVolume(summary: RetakeSummary | null, items: QueueItem[]): RetakeSummaryVolume | null {
	const volumes = retakeVolumeMap(summary);
	for (const item of items) {
		const volume = item.collectionId != null ? volumes.get(item.collectionId) : undefined;
		if (volume) return volume;
	}
	return summary?.volumes[0] ?? null;
}

const FOLIOS = /^Folios ([^:]+):/;

/**
 * The folios a rejection comment names when it starts "Folios …:", as the
 * import writes the list's retakes; null for any other comment.
 */
export function folioHint(comment: string | null | undefined): string | null {
	const match = comment?.match(FOLIOS);
	return match ? match[1].trim() : null;
}

/**
 * The guided retake's order: the volume's rejected records by sequence,
 * starting at the one the guide opened on, with those before it at the back.
 */
export function guideOrder(bySequence: number[], startId: number): number[] {
	const at = bySequence.indexOf(startId);
	return at <= 0 ? [...bySequence] : [...bySequence.slice(at), ...bySequence.slice(0, at)];
}

/**
 * "Saltar por ahora": the record goes to the back of the order, so that the
 * guide comes back to the skipped records, in the order they were skipped,
 * once it has passed every other one. A skipped record is never dropped.
 */
export function deferToBack(order: number[], id: number): number[] {
	return [...order.filter((x) => x !== id), id];
}

/**
 * The record the guided retake opens next: the first of `order` still
 * pending. `exceptId` leaves the open record out, to say what comes after
 * it. Null when none is.
 */
export function guideNextId(order: number[], isPending: (id: number) => boolean, exceptId?: number): number | null {
	return order.find((id) => id !== exceptId && isPending(id)) ?? null;
}

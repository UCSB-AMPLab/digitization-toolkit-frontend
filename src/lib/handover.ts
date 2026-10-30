// ============================================================================
// Handover (NEH-260): what the volume's top bar offers an operator, decided
// from the records' statuses alone.
//
// The backend keeps no "submitted" flag on a collection: a volume reads as
// handed over when none of its records is captured. So the controls are
// derived the same way, from the counts, and never stored.
//
// A record Fisqua excluded (contract 1.6) has been sent and ruled on, so it
// counts as sent before. It is not a retake and is never pending, so it
// blocks no send, and it is not in review, so there is nothing to take back.
//
// A record that misses a side (0.3.2, `missing_side`) stays captured: promote
// leaves it on the unit and sends the others, so it is not counted as
// captured here, and a volume whose only captured records miss a side
// offers no send. It is pending, and the lock counts it with the other
// pending records, but on its own it does not lock a volume that has other
// records to send (handoverLock).
// ============================================================================
//
// Version: 0.3.2

import type { Record } from '$lib/api';

export interface HandoverCounts {
	// The captured records a send would hand over: those that miss a side are left out.
	captured: number;
	inReview: number;
	approved: number;
	rejected: number;
	excluded: number;
}

export function handoverCounts(records: Pick<Record, 'status' | 'missing_side'>[]): HandoverCounts {
	const c: HandoverCounts = { captured: 0, inReview: 0, approved: 0, rejected: 0, excluded: 0 };
	for (const r of records) {
		if (r.status === 'captured') {
			if (r.missing_side == null) c.captured++;
		}
		else if (r.status === 'in_review') c.inReview++;
		else if (r.status === 'approved') c.approved++;
		else if (r.status === 'rejected') c.rejected++;
		else if (r.status === 'excluded') c.excluded++;
	}
	return c;
}

export interface HandoverOffer {
	// 'volume': nothing has been sent yet, so the button sends the volume.
	// 'new': part of the volume has already been sent or ruled on, so the
	// button names the records it would add. Both call the same endpoint.
	send: 'volume' | 'new' | null;
	takeBack: boolean;
}

export function handoverOffer(c: HandoverCounts): HandoverOffer {
	const sentBefore = c.inReview + c.approved + c.rejected + c.excluded > 0;
	return {
		send: c.captured === 0 ? null : sentBefore ? 'new' : 'volume',
		takeBack: c.inReview > 0
	};
}

/** The captured records that miss a side, which no send hands over. */
export function missingSideCount(records: Pick<Record, 'status' | 'missing_side'>[]): number {
	return records.filter((r) => r.status === 'captured' && r.missing_side != null).length;
}

/**
 * How many pending records the locked send button names, or 0 for no lock.
 * `pending` is the volume's pending records, `missingSide` those of them
 * that miss a side. A retake of a rejection left locks the send, as the
 * backend refuses it; the records that miss a side lock it only when there
 * is nothing else to send.
 */
export function handoverLock(pending: number, missingSide: number, offer: HandoverOffer): number {
	if (pending <= 0) return 0;
	return pending - missingSide > 0 || offer.send === null ? pending : 0;
}

// The ids promote names when it refuses (422 with blocking_record_ids), or
// null for any other failure. Read off the error's structured detail, which
// ApiError carries, rather than by instanceof, so this module does not load
// the API client.
export function promoteBlockers(err: unknown): number[] | null {
	const detail = (err as { detail?: unknown } | null)?.detail;
	const ids = (detail as { blocking_record_ids?: unknown } | undefined)?.blocking_record_ids;
	return Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : null;
}

// ============================================================================
// Handover (NEH-260): what the volume's top bar offers an operator, decided
// from the records' statuses alone.
//
// The backend keeps no "submitted" flag on a collection: a volume reads as
// handed over when none of its records is captured. So the controls are
// derived the same way, from the counts, and never stored.
// ============================================================================
//
// Version: 0.1.0-beta

import type { Record } from '$lib/api';

export interface HandoverCounts {
	captured: number;
	inReview: number;
	approved: number;
	rejected: number;
}

export function handoverCounts(records: Pick<Record, 'status'>[]): HandoverCounts {
	const c: HandoverCounts = { captured: 0, inReview: 0, approved: 0, rejected: 0 };
	for (const r of records) {
		if (r.status === 'captured') c.captured++;
		else if (r.status === 'in_review') c.inReview++;
		else if (r.status === 'approved') c.approved++;
		else if (r.status === 'rejected') c.rejected++;
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
	const sentBefore = c.inReview + c.approved + c.rejected > 0;
	return {
		send: c.captured === 0 ? null : sentBefore ? 'new' : 'volume',
		takeBack: c.inReview > 0
	};
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

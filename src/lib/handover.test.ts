// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { handoverCounts, handoverOffer, promoteBlockers } from './handover';

type S = 'captured' | 'in_review' | 'rejected' | 'approved';
const recs = (...statuses: S[]) => statuses.map((status) => ({ status }));

describe('handoverCounts', () => {
	it('counts each status', () => {
		expect(handoverCounts(recs('captured', 'captured', 'in_review', 'approved', 'rejected', 'rejected'))).toEqual(
			{ captured: 2, inReview: 1, approved: 1, rejected: 2 }
		);
	});
});

describe('handoverOffer', () => {
	it('offers nothing on an empty volume', () => {
		expect(handoverOffer(handoverCounts([]))).toEqual({ send: null, takeBack: false });
	});

	it('offers to send the volume when nothing has been sent', () => {
		expect(handoverOffer(handoverCounts(recs('captured', 'captured')))).toEqual({ send: 'volume', takeBack: false });
	});

	it('offers only take-back once everything is in review', () => {
		expect(handoverOffer(handoverCounts(recs('in_review', 'in_review')))).toEqual({ send: null, takeBack: true });
	});

	it('offers both when a record was captured after the volume was sent', () => {
		expect(handoverOffer(handoverCounts(recs('in_review', 'captured')))).toEqual({ send: 'new', takeBack: true });
	});

	it('names new records, without take-back, when the reviewers have ruled on everything sent', () => {
		expect(handoverOffer(handoverCounts(recs('approved', 'rejected', 'captured')))).toEqual({ send: 'new', takeBack: false });
	});

	it('offers nothing when every record has been ruled on', () => {
		expect(handoverOffer(handoverCounts(recs('approved', 'rejected')))).toEqual({ send: null, takeBack: false });
	});
});

describe('promoteBlockers', () => {
	it('reads the ids from a refusal', () => {
		expect(promoteBlockers({ detail: { message: 'x', blocking_record_ids: [12, 31] } })).toEqual([12, 31]);
	});

	it('returns null for an error without them', () => {
		expect(promoteBlockers(new Error('network'))).toBeNull();
		expect(promoteBlockers({ detail: 'plain string' })).toBeNull();
		expect(promoteBlockers(null)).toBeNull();
	});
});

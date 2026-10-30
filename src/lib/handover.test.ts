// Version: 0.3.2

import { describe, expect, it } from 'vitest';
import { handoverCounts, handoverLock, handoverOffer, promoteBlockers } from './handover';

type S = 'captured' | 'in_review' | 'rejected' | 'approved' | 'excluded';
const recs = (...statuses: S[]) => statuses.map((status) => ({ status }));

describe('handoverCounts', () => {
	it('counts each status', () => {
		expect(handoverCounts(recs('captured', 'captured', 'in_review', 'approved', 'rejected', 'rejected'))).toEqual(
			{ captured: 2, inReview: 1, approved: 1, rejected: 2, excluded: 0 }
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

describe('excluded records (Fisqua contract 1.6)', () => {
	it('are counted apart, never as rejected', () => {
		expect(handoverCounts(recs('excluded', 'excluded', 'approved'))).toEqual(
			{ captured: 0, inReview: 0, approved: 1, rejected: 0, excluded: 2 }
		);
	});

	it('do not block sending new captures, and count as already sent', () => {
		expect(handoverOffer(handoverCounts(recs('excluded', 'captured')))).toEqual({ send: 'new', takeBack: false });
	});

	it('offer nothing to send or take back on their own', () => {
		expect(handoverOffer(handoverCounts(recs('excluded', 'approved')))).toEqual({ send: null, takeBack: false });
	});
});

describe('records that miss a side (0.3.2)', () => {
	const missing = (side: 'left' | 'right') => ({ status: 'captured' as const, missing_side: side });

	it('are not counted as captured: a send leaves them on the unit', () => {
		expect(handoverCounts([missing('left'), { status: 'captured' }, { status: 'approved' }])).toEqual(
			{ captured: 1, inReview: 0, approved: 1, rejected: 0, excluded: 0 }
		);
	});

	it('offer no send when they are the only captured records, since it would promote nothing', () => {
		expect(handoverOffer(handoverCounts([missing('left'), missing('right')]))).toEqual({ send: null, takeBack: false });
		expect(handoverOffer(handoverCounts([missing('left'), { status: 'in_review' }]))).toEqual({ send: null, takeBack: true });
	});

	it('leave the send of the other captured records open', () => {
		expect(handoverOffer(handoverCounts([missing('left'), { status: 'captured' }]))).toEqual({ send: 'volume', takeBack: false });
	});
});

describe('handoverLock', () => {
	const offer = (send: 'volume' | 'new' | null) => ({ send, takeBack: false });

	it('locks with every pending record while a retake of a rejection is left', () => {
		expect(handoverLock(3, 1, offer('volume'))).toBe(3);
		expect(handoverLock(2, 0, offer(null))).toBe(2);
	});

	it('does not lock over missing sides alone while other records can be sent', () => {
		expect(handoverLock(2, 2, offer('volume'))).toBe(0);
		expect(handoverLock(1, 1, offer('new'))).toBe(0);
	});

	it('locks over missing sides when nothing else can be sent', () => {
		expect(handoverLock(2, 2, offer(null))).toBe(2);
	});

	it('does not lock with nothing pending', () => {
		expect(handoverLock(0, 0, offer('volume'))).toBe(0);
		expect(handoverLock(0, 0, offer(null))).toBe(0);
	});
});

import { describe, expect, it } from 'vitest';
import { REJECTION_COMMENT_MAX_LENGTH, isCommentTooLong, showsCommentCount } from './rejection-comment';

class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.detail = detail;
		this.status = status;
	}
}

// FastAPI's 422 for RecordRejectRequest's comment validator (app/schemas/record.py).
const tooLongDetail = [
	{
		type: 'value_error',
		loc: ['body', 'comment'],
		msg: 'Value error, A rejection comment can be at most 2,000 characters long.',
		input: 'x'
	}
];

describe('rejection comment', () => {
	it('stops at the 2,000 characters Fisqua keeps', () => {
		expect(REJECTION_COMMENT_MAX_LENGTH).toBe(2000);
	});

	it('shows the count only near the limit', () => {
		expect(showsCommentCount(0)).toBe(false);
		expect(showsCommentCount(1799)).toBe(false);
		expect(showsCommentCount(1800)).toBe(true);
		expect(showsCommentCount(2000)).toBe(true);
	});

	it("recognises the backend's 422 for a comment that is too long", () => {
		expect(isCommentTooLong(new ApiError(JSON.stringify(tooLongDetail), tooLongDetail, 422))).toBe(true);
		expect(isCommentTooLong(new ApiError('A rejection comment can be at most 2,000 characters long.', 'raw', 422))).toBe(true);
	});

	it('does not take other refusals for it', () => {
		const otherNeedsNote = [{ type: 'value_error', loc: ['body'], msg: 'Value error, other needs a comment' }];
		expect(isCommentTooLong(new ApiError(JSON.stringify(otherNeedsNote), otherNeedsNote, 422))).toBe(false);
		expect(isCommentTooLong(new ApiError('x', tooLongDetail, 409))).toBe(false);
		expect(isCommentTooLong(new Error('Failed to fetch'))).toBe(false);
		expect(isCommentTooLong(null)).toBe(false);
	});
});

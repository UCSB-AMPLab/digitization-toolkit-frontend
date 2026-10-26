// The comment sent with a formal rejection (POST /records/{id}/reject).
//
// Fisqua keeps the first 2,000 characters of a rejection's note, so the
// backend refuses a longer comment with a 422 (REJECTION_COMMENT_MAX_LENGTH
// and the comment validator of RecordRejectRequest in app/schemas/record.py).
// The note field stops at that length, and shows a count as the note nears
// it; a longer saved note still meets the 422, which gets its own message.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`, `message`).
//
// Version: 0.1.0-beta

export const REJECTION_COMMENT_MAX_LENGTH = 2000;

/** The length from which the note field shows how many characters it holds. */
export const REJECTION_COMMENT_COUNT_FROM = 1800;

/** Whether the note field shows its count for a note of this length. */
export function showsCommentCount(length: number): boolean {
	return length >= REJECTION_COMMENT_COUNT_FROM;
}

/**
 * Whether a reject failed because its comment is too long: a 422 whose
 * validation detail is about `comment`, or whose text is the backend's
 * REJECTION_COMMENT_TOO_LONG.
 */
export function isCommentTooLong(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const e = error as { status?: unknown; detail?: unknown; message?: unknown };
	if (e.status !== 422) return false;
	if (Array.isArray(e.detail)) {
		for (const item of e.detail) {
			if (typeof item !== 'object' || item === null) continue;
			const loc = (item as { loc?: unknown }).loc;
			if (Array.isArray(loc) && loc.includes('comment')) return true;
		}
	}
	return typeof e.message === 'string' && e.message.includes('at most 2,000 characters');
}

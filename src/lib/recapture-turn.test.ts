// The recapture turn's rules on the frontend (0.2.0): reading
// GET /records/to-retake/summary, the two 409 refusals by their codes, which
// volume the queue offers first, the folios of the next guided retake, and
// which record the guided retake opens next.
//
// Version: 0.2.0
import { describe, expect, it } from 'vitest';
import type { QueueItem, RetakeSummary, StatusCounts } from './api';
import {
	deferToBack,
	folioHint,
	guideNextId,
	guideOrder,
	isRecaptureTurnRefusal,
	preferredRetakeVolume,
	readRetakeSummary,
	recapturesPendingCount,
	retakeVolumeMap
} from './recapture-turn';

// A stand-in for api.ts's ApiError, as in capture-errors.test.ts.
class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.detail = detail;
		this.status = status;
	}
}

function counts(c: Partial<StatusCounts> = {}): StatusCounts {
	return { captured: 0, in_review: 0, rejected: 0, approved: 0, ...c };
}

function item(position: number, collectionId: number | null, projectId: number | null = 1): QueueItem {
	return {
		position,
		sequence: position,
		referenceCode: `co-${position}`,
		filenameStem: `co-${position}`,
		title: `Tomo ${position}`,
		notes: null,
		action: null,
		collectionId,
		projectId,
		status: counts(),
		doneMark: null
	};
}

const summary: RetakeSummary = {
	pendingRecords: 33,
	volumes: [
		{ collectionId: 92, projectId: 24, name: 'Tomo 066', filenameStem: 'co-ahr-not-t066', pending: 31, total: 31, firstPendingRecordId: 20946, pendingRecordIds: Array.from({ length: 31 }, (_, i) => 20946 + i) },
		{ collectionId: 3, projectId: 24, name: 'Tomo 003', filenameStem: 'co-ahr-not-t003', pending: 2, total: 2, firstPendingRecordId: 11, pendingRecordIds: [11, 12] }
	],
	turn: { state: 'recaptures', unlockedBy: null }
};

describe('readRetakeSummary', () => {
	it('keeps a summary of the contract shape', () => {
		expect(readRetakeSummary(summary)).toEqual(summary);
	});

	it('gives null for anything else, so that a wrong answer blocks nothing', () => {
		expect(readRetakeSummary([])).toBeNull();
		expect(readRetakeSummary(null)).toBeNull();
		expect(readRetakeSummary({ pendingRecords: 2, volumes: [] })).toBeNull();
		expect(readRetakeSummary({ pendingRecords: 2, volumes: [], turn: { state: 'other', unlockedBy: null } })).toBeNull();
		// Each volume lists its pending records (0.2.0, backend/summary-pending-ids).
		const { pendingRecordIds: _ids, ...withoutIds } = summary.volumes[0];
		expect(readRetakeSummary({ ...summary, volumes: [withoutIds] })).toBeNull();
		expect(readRetakeSummary({ ...summary, volumes: [{ ...summary.volumes[0], pendingRecordIds: ['20946'] }] })).toBeNull();
	});
});

describe('the 409 refusals', () => {
	const turn = new ApiError('It is the retake turn.', { code: 'recapture_turn', message: 'It is the retake turn.' }, 409);
	const pending = new ApiError('3 retakes left.', { code: 'recaptures_pending', pending: 3, message: '3 retakes left.' }, 409);

	it('reads the capture refusal by its code', () => {
		expect(isRecaptureTurnRefusal(turn)).toBe(true);
		expect(isRecaptureTurnRefusal(pending)).toBe(false);
		expect(isRecaptureTurnRefusal(new ApiError('x', { code: 'recapture_turn' }, 422))).toBe(false);
		expect(isRecaptureTurnRefusal(new Error('recapture_turn'))).toBe(false);
	});

	it('reads the promotion refusal and its count by its code', () => {
		expect(recapturesPendingCount(pending)).toBe(3);
		expect(recapturesPendingCount(turn)).toBeNull();
		expect(recapturesPendingCount(new ApiError('x', { code: 'recaptures_pending' }, 409))).toBeNull();
		expect(recapturesPendingCount(new Error('x'))).toBeNull();
	});
});

describe('preferredRetakeVolume', () => {
	it('takes the first item of the list whose volume has retakes', () => {
		const items = [item(1, 50), item(2, 3), item(3, 92)];
		expect(preferredRetakeVolume(summary, items)?.collectionId).toBe(3);
	});

	it('falls back to the volume with most pending when no item has one', () => {
		expect(preferredRetakeVolume(summary, [item(1, 50)])?.collectionId).toBe(92);
		expect(preferredRetakeVolume(summary, [])?.collectionId).toBe(92);
	});

	it('gives null without volumes', () => {
		expect(preferredRetakeVolume({ ...summary, pendingRecords: 0, volumes: [] }, [item(1, 3)])).toBeNull();
		expect(preferredRetakeVolume(null, [item(1, 3)])).toBeNull();
	});

	it('maps the volumes by id', () => {
		expect([...retakeVolumeMap(summary).keys()]).toEqual([92, 3]);
		expect(retakeVolumeMap(null).size).toBe(0);
	});
});

describe('folioHint', () => {
	it('takes the folios before the colon of a comment that starts with Folios', () => {
		expect(folioHint('Folios 10r, 9v: recaptura pedida en la lista (imágenes 23 y 24 de AHR0108).')).toBe('10r, 9v');
		expect(folioHint('Folios 4r: recaptura pedida')).toBe('4r');
	});

	it('gives null for any other comment', () => {
		expect(folioHint('La imagen está movida.')).toBeNull();
		expect(folioHint('Folios sin dos puntos')).toBeNull();
		expect(folioHint('Ver folios 4r: algo')).toBeNull();
		expect(folioHint(null)).toBeNull();
		expect(folioHint(undefined)).toBeNull();
	});
});

describe('the guide order', () => {
	const pending = (ids: number[]) => (id: number) => ids.includes(id);

	it('starts at the record the guide opened on, the ones before it at the back', () => {
		expect(guideOrder([1, 2, 3, 4], 1)).toEqual([1, 2, 3, 4]);
		expect(guideOrder([1, 2, 3, 4], 3)).toEqual([3, 4, 1, 2]);
		expect(guideOrder([1, 2], 9)).toEqual([1, 2]);
	});

	it('defers a skipped record to the back, so the skipped come last in the order they were skipped', () => {
		let order = [1, 2, 3, 4];
		order = deferToBack(order, 1);
		expect(order).toEqual([2, 3, 4, 1]);
		order = deferToBack(order, 3);
		expect(order).toEqual([2, 4, 1, 3]);
	});

	it('takes the first pending record of the order, passing over retaken ones', () => {
		expect(guideNextId([1, 2, 3], pending([2, 3]))).toBe(2);
		expect(guideNextId([2, 3, 1], pending([1]))).toBe(1);
	});

	it('reopens a skipped record when it is the only one left', () => {
		expect(guideNextId(deferToBack([1, 2], 1), pending([1]))).toBe(1);
	});

	it('can leave out the open record, to say what comes after it', () => {
		expect(guideNextId([1, 2, 3], pending([1, 2, 3]), 1)).toBe(2);
		expect(guideNextId([1], pending([1]), 1)).toBeNull();
	});

	it('gives null when nothing is pending', () => {
		expect(guideNextId([1, 2], pending([]))).toBeNull();
	});
});

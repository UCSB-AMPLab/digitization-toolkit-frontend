// The digitisation queue's rules: which item is next, which are done, the
// action filter, the import report's skips, and the capture instruction a
// volume carries from its list.
//
// Version: 0.2.0
import { describe, it, expect } from 'vitest';
import type { QueueItem, QueueList, ImportReject, StatusCounts } from './api';
import {
	QUEUE_ACTIONS,
	isItemDone,
	hasCapturedRecord,
	nextItemPosition,
	actionsPresent,
	filterByAction,
	isOnUnitReject,
	captureInstruction,
	instructionForVolume,
	captureUrl,
	retakeUrl
} from './queue';

function counts(c: Partial<StatusCounts> = {}): StatusCounts {
	return { captured: 0, in_review: 0, rejected: 0, approved: 0, ...c };
}

function item(position: number, over: Partial<QueueItem> = {}): QueueItem {
	return {
		position,
		sequence: position,
		referenceCode: `co-ahr-${position}`,
		filenameStem: `co-ahr-${position}`,
		title: `Tomo ${position}`,
		notes: null,
		action: null,
		collectionId: position,
		projectId: 1,
		status: counts(),
		doneMark: null,
		...over
	};
}

describe('QUEUE_ACTIONS', () => {
	it('lists the four actions a list may carry', () => {
		expect(QUEUE_ACTIONS).toEqual(['spot-recapture', 'full-rescan', 'full-digitisation', 'complete']);
	});
});

describe('hasCapturedRecord', () => {
	it('an item with no volume, or a volume with no records, has nothing captured', () => {
		expect(hasCapturedRecord(item(1, { collectionId: null, status: null }))).toBe(false);
		expect(hasCapturedRecord(item(1))).toBe(false);
	});

	it('any record, in any status, counts as captured', () => {
		expect(hasCapturedRecord(item(1, { status: counts({ in_review: 1 }) }))).toBe(true);
		expect(hasCapturedRecord(item(1, { status: counts({ rejected: 1 }) }))).toBe(true);
	});
});

describe('isItemDone', () => {
	const mark = { by: 'revisora', at: '2026-10-28T10:00:00' };

	it('is done whenever the item carries a done mark, whatever its action or records', () => {
		expect(isItemDone(item(1, { doneMark: mark }))).toBe(true);
		expect(isItemDone(item(1, { action: 'spot-recapture', doneMark: mark }))).toBe(true);
		expect(isItemDone(item(1, { collectionId: null, status: null, doneMark: mark }))).toBe(true);
	});

	it('with no action, or full-digitisation, is done when every record is approved', () => {
		for (const action of [null, 'full-digitisation']) {
			expect(isItemDone(item(1, { action, status: counts({ approved: 4 }) }))).toBe(true);
			expect(isItemDone(item(1, { action, status: counts({ approved: 4, in_review: 1 }) }))).toBe(false);
			expect(isItemDone(item(1, { action, status: counts({ captured: 3 }) }))).toBe(false);
			expect(isItemDone(item(1, { action }))).toBe(false);
			expect(isItemDone(item(1, { action, collectionId: null, status: null }))).toBe(false);
		}
	});

	it('is never done by its records for a full rescan, a spot recapture or a completion', () => {
		for (const action of ['full-rescan', 'spot-recapture', 'complete']) {
			expect(isItemDone(item(1, { action, status: counts({ approved: 40 }) }))).toBe(false);
		}
	});

	it('treats an action it does not know like one that recaptures: never done by records', () => {
		expect(isItemDone(item(1, { action: 'rescan-cover', status: counts({ approved: 4 }) }))).toBe(false);
	});
});

describe('nextItemPosition', () => {
	it('is the first item in list order that is not done and has a volume', () => {
		const items = [
			item(1, { status: counts({ approved: 2 }) }),
			item(2, { doneMark: { by: 'a', at: null } }),
			item(3, { status: counts({ captured: 1 }) }),
			item(4)
		];
		expect(nextItemPosition(items)).toBe(3);
	});

	it('a full rescan whose old records are all approved is still to do', () => {
		const items = [item(1, { action: 'full-rescan', status: counts({ approved: 30 }) }), item(2)];
		expect(nextItemPosition(items)).toBe(1);
	});

	it('skips an item with no volume on this unit, which cannot be captured', () => {
		const items = [item(1, { collectionId: null, status: null }), item(2)];
		expect(nextItemPosition(items)).toBe(2);
	});

	it('is null when every item is done', () => {
		expect(nextItemPosition([item(1, { status: counts({ approved: 1 }) })])).toBeNull();
		expect(nextItemPosition([])).toBeNull();
	});
});

describe('actionsPresent and filterByAction', () => {
	const items = [
		item(1, { action: 'full-rescan' }),
		item(2, { action: 'spot-recapture' }),
		item(3),
		item(4, { action: 'full-rescan' })
	];

	it('lists each action once, in order of first appearance', () => {
		expect(actionsPresent(items)).toEqual(['full-rescan', 'spot-recapture']);
	});

	it('null keeps every item; an action keeps only its items, in order', () => {
		expect(filterByAction(items, null).map((i) => i.position)).toEqual([1, 2, 3, 4]);
		expect(filterByAction(items, 'full-rescan').map((i) => i.position)).toEqual([1, 4]);
	});
});

describe('isOnUnitReject', () => {
	const reject = (reason: string): ImportReject => ({
		position: 1,
		referenceCode: 'co-ahr-1',
		referenceCodeTruncated: false,
		reason
	});

	it('is true for an item already on the unit, by code or by stem', () => {
		expect(isOnUnitReject(reject('reference_code_on_unit'))).toBe(true);
		expect(isOnUnitReject(reject('filename_stem_on_unit'))).toBe(true);
	});

	it('is false for every other reason', () => {
		expect(isOnUnitReject(reject('missing_title'))).toBe(false);
		expect(isOnUnitReject(reject('refused_by_database'))).toBe(false);
	});
});

describe('captureInstruction', () => {
	it('reads fisqua.notes and fisqua.action', () => {
		const attrs = JSON.stringify({ fisqua: { notes: '117r, 116v; 193r, 192v', action: 'spot-recapture' } });
		expect(captureInstruction(attrs)).toEqual({ notes: '117r, 116v; 193r, 192v', action: 'spot-recapture' });
	});

	it('gives a null action when the list gave none', () => {
		const attrs = JSON.stringify({ fisqua: { notes: 'Desde el folio 49r hasta el final' } });
		expect(captureInstruction(attrs)).toEqual({ notes: 'Desde el folio 49r hasta el final', action: null });
	});

	it('is null without notes, with blank notes, or with notes that are not text', () => {
		expect(captureInstruction(JSON.stringify({ fisqua: { action: 'full-rescan' } }))).toBeNull();
		expect(captureInstruction(JSON.stringify({ fisqua: { notes: '   ' } }))).toBeNull();
		expect(captureInstruction(JSON.stringify({ fisqua: { notes: 12 } }))).toBeNull();
		expect(captureInstruction(JSON.stringify({ other: { notes: 'x' } }))).toBeNull();
	});

	it('is null for missing or unreadable attributes', () => {
		expect(captureInstruction(null)).toBeNull();
		expect(captureInstruction(undefined)).toBeNull();
		expect(captureInstruction('')).toBeNull();
		expect(captureInstruction('{not json')).toBeNull();
		expect(captureInstruction('"a string"')).toBeNull();
		expect(captureInstruction('null')).toBeNull();
	});

	it('ignores an action that is not text', () => {
		const attrs = JSON.stringify({ fisqua: { notes: 'Todo', action: 3 } });
		expect(captureInstruction(attrs)).toEqual({ notes: 'Todo', action: null });
	});
});

describe('instructionForVolume', () => {
	function list(listId: string, items: QueueItem[]): QueueList {
		return { listId, listName: listId, projectId: 1, importedAt: null, listFileMissing: false, items };
	}

	it('takes the item of the newest list (first in the response) whose volume is the open one', () => {
		const lists = [
			list('new', [item(1, { collectionId: 9, notes: '117r, 116v', action: 'spot-recapture' })]),
			list('old', [item(4, { collectionId: 9, notes: 'Todo el tomo', action: 'full-rescan' })])
		];
		expect(instructionForVolume(lists, 9)).toEqual({ notes: '117r, 116v', action: 'spot-recapture' });
	});

	it('looks in older lists when the newest has no item for the volume', () => {
		const lists = [list('new', [item(1, { collectionId: 3 })]), list('old', [item(4, { collectionId: 9, notes: 'Desde 49r' })])];
		expect(instructionForVolume(lists, 9)).toEqual({ notes: 'Desde 49r', action: null });
	});

	it('gives an action without notes, and is null when the matching item has neither', () => {
		expect(instructionForVolume([list('a', [item(1, { collectionId: 9, action: 'full-rescan' })])], 9)).toEqual({
			notes: null,
			action: 'full-rescan'
		});
		expect(instructionForVolume([list('a', [item(1, { collectionId: 9 })])], 9)).toBeNull();
	});

	it('treats blank notes as none', () => {
		const lists = [list('a', [item(1, { collectionId: 9, notes: '   ', action: 'complete' })])];
		expect(instructionForVolume(lists, 9)).toEqual({ notes: null, action: 'complete' });
	});

	it('is undefined when no list item is for the volume, so the caller falls back', () => {
		expect(instructionForVolume([list('a', [item(1, { collectionId: 3 })])], 9)).toBeUndefined();
		expect(instructionForVolume([], 9)).toBeUndefined();
	});
});

describe('captureUrl and retakeUrl', () => {
	it('are the capture screen, and the capture screen opened on one record', () => {
		expect(captureUrl(2, 7)).toBe('/live-preview?projectId=2&collectionId=7');
		expect(retakeUrl(2, 7, 41)).toBe('/live-preview?projectId=2&collectionId=7&recordId=41');
	});
});

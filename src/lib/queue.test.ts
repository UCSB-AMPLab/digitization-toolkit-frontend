// The digitisation queue's rules: which item is next, which are done, the
// action filter, the import report's skips, and the capture instruction a
// volume carries from its list; and the Fisqua queue's (contract 1.7): the
// list shown first, the items each user sees, and a spot recapture's pairs.
//
// Version: 0.3.0
import { describe, it, expect } from 'vitest';
import type { QueueItem, QueueList, ImportReject, RecordToRetake, StatusCounts } from './api';
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
	retakeUrl,
	isQueueList,
	defaultListId,
	isItemShown,
	itemsForUser,
	filterByAssignee,
	retakePairs
} from './queue';

function counts(c: Partial<StatusCounts> = {}): StatusCounts {
	return { captured: 0, in_review: 0, rejected: 0, approved: 0, excluded: 0, ...c };
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

	it('skips an item whose volume has no project, which the queue cannot open for capture', () => {
		const items = [item(1, { projectId: null }), item(2)];
		expect(nextItemPosition(items)).toBe(2);
	});

	it('prefers the first item whose volume has retakes pending (0.2.0)', () => {
		const items = [item(1), item(2), item(3), item(4)];
		expect(nextItemPosition(items, new Set([3, 4]))).toBe(3);
		// No such item: the usual rule.
		expect(nextItemPosition(items, new Set([99]))).toBe(1);
		expect(nextItemPosition(items, new Set())).toBe(1);
	});

	it('prefers an item with retakes even when it is marked done, but not one without a project', () => {
		const items = [item(1), item(2, { doneMark: { by: 'a', at: null } }), item(3, { projectId: null })];
		expect(nextItemPosition(items, new Set([2]))).toBe(2);
		expect(nextItemPosition(items, new Set([3]))).toBe(1);
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

	it('skips a withdrawn queue item, so the next-newest list that names the volume decides', () => {
		const lists = [
			list('queue', [item(1, { collectionId: 9, notes: '117r, 116v', action: 'spot-recapture', withdrawn: true })]),
			list('old', [item(4, { collectionId: 9, notes: 'Todo el tomo', action: 'full-rescan' })])
		];
		expect(instructionForVolume(lists, 9)).toEqual({ notes: 'Todo el tomo', action: 'full-rescan' });
	});

	it('is null, not undefined, when every item that names the volume is withdrawn or hidden', () => {
		// Null keeps the caller from falling back to custom_attributes, where
		// the backend keeps a withdrawn volume's Fisqua notes.
		const withdrawn = [list('queue', [item(1, { collectionId: 9, notes: '117r', action: 'spot-recapture', withdrawn: true })])];
		expect(instructionForVolume(withdrawn, 9)).toBeNull();
		const hidden = [
			list('queue', [item(1, { collectionId: 9, notes: '117r', withdrawn: true })]),
			list('file', [item(2, { collectionId: 9, notes: 'Desde 49r', queueHidden: true })])
		];
		expect(instructionForVolume(hidden, 9)).toBeNull();
	});

	it('stays undefined when no list names the volume, with or without suppressed items of other volumes', () => {
		const lists = [list('queue', [item(1, { collectionId: 3, notes: '117r', withdrawn: true })])];
		expect(instructionForVolume(lists, 9)).toBeUndefined();
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

describe('excluded records (Fisqua contract 1.6)', () => {
	it('count as records of the volume', () => {
		expect(hasCapturedRecord(item(1, { status: counts({ excluded: 1 }) }))).toBe(true);
	});

	it('do not keep an item from being done once the rest is approved', () => {
		expect(isItemDone(item(1, { status: counts({ approved: 8, excluded: 2 }) }))).toBe(true);
	});

	it('do not make an item done while other records are pending', () => {
		expect(isItemDone(item(1, { status: counts({ rejected: 1, excluded: 2 }) }))).toBe(false);
		expect(isItemDone(item(1, { status: counts({ in_review: 1, excluded: 2 }) }))).toBe(false);
	});
});

describe('the Fisqua queue (contract 1.7)', () => {
	function list(listId: string, source?: 'queue' | 'file'): QueueList {
		return { listId, source, listName: listId, projectId: 1, importedAt: null, items: [], listFileMissing: false };
	}

	it('tells the queue from a file list, and a list from an older backend is a file list', () => {
		expect(isQueueList(list('q', 'queue'))).toBe(true);
		expect(isQueueList(list('f', 'file'))).toBe(false);
		expect(isQueueList(list('old'))).toBe(false);
		expect(isQueueList(null)).toBe(false);
	});

	it('shows the queue first when there is one, wherever it is in the lists', () => {
		expect(defaultListId([list('f1', 'file'), list('q', 'queue'), list('f2', 'file')])).toBe('q');
		expect(defaultListId([list('f1', 'file'), list('f2')])).toBe('f1');
		expect(defaultListId([])).toBeNull();
	});

	it('leaves out withdrawn and hidden items, and keeps an item without the fields', () => {
		expect(isItemShown(item(1))).toBe(true);
		expect(isItemShown(item(1, { withdrawn: false, queueHidden: false }))).toBe(true);
		expect(isItemShown(item(1, { withdrawn: true }))).toBe(false);
		expect(isItemShown(item(1, { queueHidden: true }))).toBe(false);
	});

	const items = [
		item(1, { assignee: 'ana' }),
		item(2, { assignee: null }),
		item(3, { assignee: 'luis' }),
		item(4)
	];
	const positions = (xs: QueueItem[]) => xs.map((i) => i.position);

	it('gives an operator the items assigned to them and the unassigned ones', () => {
		expect(positions(itemsForUser(items, 'operator', 'ana'))).toEqual([1, 2, 4]);
		expect(positions(itemsForUser(items, 'operator', 'luis'))).toEqual([2, 3, 4]);
		expect(positions(itemsForUser(items, 'operator', null))).toEqual([2, 4]);
	});

	it('gives an admin and a reviewer every item', () => {
		expect(positions(itemsForUser(items, 'admin', 'ana'))).toEqual([1, 2, 3, 4]);
		expect(positions(itemsForUser(items, 'reviewer', 'ana'))).toEqual([1, 2, 3, 4]);
	});

	it("filters by Mine, Unassigned and Everyone", () => {
		expect(positions(filterByAssignee(items, 'mine', 'luis'))).toEqual([3]);
		expect(positions(filterByAssignee(items, 'unassigned', 'luis'))).toEqual([2, 4]);
		expect(positions(filterByAssignee(items, 'everyone', 'luis'))).toEqual([1, 2, 3, 4]);
		expect(positions(filterByAssignee(items, 'mine', null))).toEqual([]);
	});

	function row(recordId: number, title: string, sequence: number | null): RecordToRetake {
		return {
			recordId, title, sequence, collectionId: 1, projectId: 1,
			name: null, filenameStem: null, reason: null, comment: null, rejectedBy: null, rejectedAt: null
		};
	}

	it('names each pair from the records to retake, by sequence where known, the unknown ones after', () => {
		const pairs = retakePairs(
			[
				{ captuaRecordId: 30, pairId: 'p-30', side: 'both' },
				{ captuaRecordId: 99, pairId: null, side: 'left' },
				{ captuaRecordId: 10, pairId: null, side: 'right' },
				{ captuaRecordId: 20, pairId: 'p-20', side: 'both' },
				{ captuaRecordId: 98, pairId: 'p-98', side: 'both' }
			],
			[row(10, 'f. 10', 10), row(30, 'f. 30', 30), row(20, 'f. 20', null)]
		);
		expect(pairs.map((p) => [p.recordId, p.title, p.sequence])).toEqual([
			[10, 'f. 10', 10],
			[30, 'f. 30', 30],
			[20, 'f. 20', null],
			[99, null, null],
			[98, null, null]
		]);
		expect(pairs[3]).toMatchObject({ pairId: null, side: 'left' });
	});

	it('has no pairs for an item without retakes', () => {
		expect(retakePairs(undefined, [])).toEqual([]);
		expect(retakePairs([], [row(1, 'x', 1)])).toEqual([]);
	});
});

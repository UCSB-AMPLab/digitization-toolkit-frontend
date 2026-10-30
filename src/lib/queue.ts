// ============================================================================
// The digitisation queue (Cola): what each item of an imported list asks
// for, which item is next, which are done, and the instruction a volume
// keeps from its list item for the capture screen.
//
// An item is done when an admin or reviewer marked it done (`doneMark`).
// An item with no action, or a full digitisation, is also done when its
// volume has records and every one is approved (placeVolume's last stage).
// A full rescan, a spot recapture or a completion works on a volume whose
// records may all be approved already, so the records cannot say when it is
// finished: only the mark can. The list is worked from the top, so the next
// item is the first, in list order, that is not done and has a volume on
// this unit; an item without a volume cannot be captured.
//
// The digitisation queue synced with Fisqua (contract 1.7) is one more list,
// with `source` `queue`, and Cola shows it first. Its items carry an
// assignee: an operator sees the items assigned to them and the unassigned
// ones, an admin every item, with a filter. A withdrawn item, and an item
// whose volume a withdrawn entry hid (on any list), is not shown. A spot
// recapture's retakes are named as Por recapturar names a record.
// ============================================================================
//
// Version: 0.3.0

import type { ImportReject, QueueItem, QueueList, QueueRetake, RecordToRetake, StatusCounts } from '$lib/api';
import { placeVolume } from '$lib/pipeline';

// The action values a list may carry on an item (an additive field the
// contract ignores). Another value is shown as the file gives it.
export const QUEUE_ACTIONS = ['spot-recapture', 'full-rescan', 'full-digitisation', 'complete'] as const;
export type QueueAction = (typeof QUEUE_ACTIONS)[number];

export function isQueueAction(value: unknown): value is QueueAction {
	return typeof value === 'string' && (QUEUE_ACTIONS as readonly string[]).includes(value);
}

// Excluded records (Fisqua contract 1.6) are records of the volume too.
function total(counts: StatusCounts): number {
	return counts.captured + counts.in_review + counts.rejected + counts.approved + counts.excluded;
}

/** Whether the item's volume has at least one record, in any status. */
export function hasCapturedRecord(item: QueueItem): boolean {
	return item.status != null && total(item.status) > 0;
}

// The actions whose items are done once every record is approved; null
// stands for an item with no action.
const DONE_BY_RECORDS = new Set<string | null>([null, 'full-digitisation']);

/** Whether the item is done: marked by hand, or finished by its records. */
export function isItemDone(item: QueueItem): boolean {
	if (item.doneMark) return true;
	if (!DONE_BY_RECORDS.has(item.action)) return false;
	return hasCapturedRecord(item) && placeVolume(item.status as StatusCounts) === 'approved';
}

/**
 * Position of the next item to capture, or null when there is none. An item
 * must have a volume and a project, as the capture link needs both. While
 * retakes are pending (0.2.0), the first item whose volume is in
 * `retakeVolumes` comes first, done or not, since its retakes are still
 * owed; the usual rule applies when no item has one.
 */
export function nextItemPosition(items: QueueItem[], retakeVolumes?: ReadonlySet<number>): number | null {
	const capturable = (i: QueueItem) => i.collectionId != null && i.projectId != null;
	if (retakeVolumes && retakeVolumes.size > 0) {
		const retake = items.find((i) => capturable(i) && retakeVolumes.has(i.collectionId as number));
		if (retake) return retake.position;
	}
	const next = items.find((i) => capturable(i) && !isItemDone(i));
	return next ? next.position : null;
}

/** The distinct actions on the list's items, in order of first appearance. */
export function actionsPresent(items: QueueItem[]): string[] {
	const seen: string[] = [];
	for (const i of items) if (i.action && !seen.includes(i.action)) seen.push(i.action);
	return seen;
}

/** The items with the given action, in list order; every item for null. */
export function filterByAction(items: QueueItem[], action: string | null): QueueItem[] {
	return action === null ? items : items.filter((i) => i.action === action);
}

// Skips that mean the volume is already on the unit, which is not an error.
const ON_UNIT_REASONS = new Set(['reference_code_on_unit', 'filename_stem_on_unit']);

export function isOnUnitReject(reject: ImportReject): boolean {
	return ON_UNIT_REASONS.has(reject.reason);
}

export interface CaptureInstruction {
	// Null when the list item has an action but no notes in text.
	notes: string | null;
	action: string | null;
}

/**
 * The instruction for a volume from the stored lists: the item of the
 * newest list (the first in GET /imports/digitisation-lists) whose volume is
 * `collectionId`, leaving out withdrawn and hidden items. Null when that item has neither notes nor an action,
 * and when every item that names the volume is withdrawn or hidden: the
 * backend keeps a withdrawn volume's Fisqua notes in its custom_attributes,
 * which must not be read for the band then. Undefined only when no list has
 * an item for the volume, so that the caller can fall back to the volume's
 * own custom_attributes.
 */
export function instructionForVolume(lists: QueueList[], collectionId: number): CaptureInstruction | null | undefined {
	let suppressed = false;
	for (const list of lists) {
		// A withdrawn item, or one whose volume a withdrawn entry hid, gives
		// no instruction (contract 1.7): the next list that names the volume does.
		const named = list.items.filter((i) => i.collectionId === collectionId);
		const item = named.find(isItemShown);
		if (!item) {
			if (named.length > 0) suppressed = true;
			continue;
		}
		const notes = typeof item.notes === 'string' && item.notes.trim() ? item.notes : null;
		const action = item.action || null;
		return notes || action ? { notes, action } : null;
	}
	return suppressed ? null : undefined;
}

/**
 * The list item's notes and action, which the import keeps in the volume's
 * `custom_attributes` (JSON text) under `fisqua`. Null when there are no
 * notes, or the attributes cannot be read.
 */
export function captureInstruction(customAttributes: string | null | undefined): CaptureInstruction | null {
	if (!customAttributes) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(customAttributes);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object') return null;
	const fisqua = (parsed as { fisqua?: unknown }).fisqua;
	if (!fisqua || typeof fisqua !== 'object') return null;
	const { notes, action } = fisqua as { notes?: unknown; action?: unknown };
	if (typeof notes !== 'string' || !notes.trim()) return null;
	return { notes, action: typeof action === 'string' && action ? action : null };
}

/** The capture screen for a volume. */
export function captureUrl(projectId: number, collectionId: number): string {
	return `/live-preview?projectId=${projectId}&collectionId=${collectionId}`;
}

/**
 * The capture screen opened on one record's retake, the address the volume
 * view's retake buttons go to (NEH-209).
 */
export function retakeUrl(projectId: number, collectionId: number, recordId: number): string {
	return `${captureUrl(projectId, collectionId)}&recordId=${recordId}`;
}

// ---------------------------------------------------------------------------
// The Fisqua queue (contract 1.7)
// ---------------------------------------------------------------------------

/** Whether the list is the digitisation queue synced with Fisqua. */
export function isQueueList(list: QueueList | null | undefined): boolean {
	return list?.source === 'queue';
}

/** The list Cola shows first: the Fisqua queue when there is one, else the newest. */
export function defaultListId(lists: QueueList[]): string | null {
	return (lists.find(isQueueList) ?? lists[0])?.listId ?? null;
}

/** Whether Cola shows the item: not withdrawn, and its volume not hidden. */
export function isItemShown(item: QueueItem): boolean {
	return item.withdrawn !== true && item.queueHidden !== true;
}

/**
 * The items a user sees: an operator, those assigned to them and the
 * unassigned ones; anyone else, every item.
 */
export function itemsForUser(items: QueueItem[], role: string | null, username: string | null): QueueItem[] {
	if (role !== 'operator') return items;
	return items.filter((i) => i.assignee == null || (username !== null && i.assignee === username));
}

export type AssigneeFilter = 'mine' | 'unassigned' | 'everyone';

/** The admin's filter: the items assigned to `username`, the unassigned ones, or every item. */
export function filterByAssignee(items: QueueItem[], filter: AssigneeFilter, username: string | null): QueueItem[] {
	if (filter === 'mine') return items.filter((i) => username !== null && i.assignee === username);
	if (filter === 'unassigned') return items.filter((i) => i.assignee == null);
	return items;
}

export interface RetakePair {
	recordId: number;
	// The record's title and sequence from GET /records/to-retake; null when
	// the record is not there (no longer rejected, or not on this unit).
	title: string | null;
	sequence: number | null;
	pairId: string | null;
	side: QueueRetake['side'];
}

/**
 * A spot recapture's retakes, each named from the records to retake as Por
 * recapturar names it: those with a sequence first, by sequence; then the
 * other records found there, then those not found, both in the entry's
 * order.
 */
export function retakePairs(retakes: QueueRetake[] | undefined, rows: RecordToRetake[]): RetakePair[] {
	const byId = new Map(rows.map((r) => [r.recordId, r]));
	const pairs = (retakes ?? []).map((r) => {
		const row = byId.get(r.captuaRecordId);
		return { recordId: r.captuaRecordId, title: row?.title ?? null, sequence: row?.sequence ?? null, pairId: r.pairId, side: r.side };
	});
	const rank = (p: RetakePair) => (p.sequence !== null ? 0 : p.title !== null ? 1 : 2);
	return pairs
		.map((p, index) => ({ p, index }))
		.sort((a, b) => rank(a.p) - rank(b.p) || (a.p.sequence ?? 0) - (b.p.sequence ?? 0) || a.index - b.index)
		.map(({ p }) => p);
}

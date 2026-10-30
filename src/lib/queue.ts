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
// finished: only the mark can.
//
// Cola groups the items not done in three sections (0.3.1): work in
// progress, then recaptures and rescans, then new material; the done items
// come after them, except an item whose volume still owes retakes, which
// stays in the second section. The next item is the first of the first section that has
// one with a volume and a project on this unit; an item without them cannot
// be captured. During the recapture turn only new material waits.
//
// The digitisation queue synced with Fisqua (contract 1.7) is one more list,
// with `source` `queue`, and Cola shows it first. Its items carry an
// assignee: an operator sees the items assigned to them and the unassigned
// ones, an admin every item, with a filter. A withdrawn item, and an item
// whose volume a withdrawn entry hid (on any list), is not shown. A spot
// recapture's retakes are named as Por recapturar names a record.
// ============================================================================
//
// Version: 0.3.1

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

// ---------------------------------------------------------------------------
// Cola's sections (0.3.1)
// ---------------------------------------------------------------------------

/**
 * Cola's three sections, in the order shown: work in progress (a volume with
 * records and no pages waiting to be recaptured, whatever its action); then
 * recaptures and rescans (volumes with pages waiting to be recaptured, then
 * full rescans not in progress); then new material (everything else).
 */
export type QueueSectionKey = 'progress' | 'rework' | 'new';
const SECTION_ORDER: QueueSectionKey[] = ['progress', 'rework', 'new'];

// The section the item's work belongs to, done or not. Section 2 holds the
// retakes before the rescans.
function workOf(item: QueueItem, retakeVolumes?: ReadonlySet<number>): QueueSectionKey {
	if (item.collectionId != null && retakeVolumes?.has(item.collectionId)) return 'rework';
	if (hasCapturedRecord(item)) return 'progress';
	if (item.action === 'full-rescan') return 'rework';
	return 'new';
}

function hasRetakes(item: QueueItem, retakeVolumes?: ReadonlySet<number>): boolean {
	return item.collectionId != null && retakeVolumes?.has(item.collectionId) === true;
}

/**
 * The item's section, or null when it is done. An item whose volume has
 * pages waiting to be recaptured stays in section 2 even when it is marked
 * done, since those retakes are still owed; any other done item is in none.
 */
export function sectionOf(item: QueueItem, retakeVolumes?: ReadonlySet<number>): QueueSectionKey | null {
	if (hasRetakes(item, retakeVolumes)) return 'rework';
	return isItemDone(item) ? null : workOf(item, retakeVolumes);
}

export interface QueueSection {
	key: QueueSectionKey;
	// 1 for the first section shown: an empty section is not shown and takes no number.
	ordinal: number;
	items: QueueItem[];
}

/**
 * The items in their sections, each in list order (in section 2, the items
 * with retakes first, done or not, then the rescans), with the empty
 * sections left out; and the other done items apart, in list order, shown
 * below the sections.
 */
export function queueSections(items: QueueItem[], retakeVolumes?: ReadonlySet<number>): { sections: QueueSection[]; done: QueueItem[] } {
	const byKey = new Map<QueueSectionKey, QueueItem[]>(SECTION_ORDER.map((k) => [k, []]));
	const done: QueueItem[] = [];
	for (const item of items) {
		const key = sectionOf(item, retakeVolumes);
		if (key === null) done.push(item);
		else byKey.get(key)!.push(item);
	}
	const rework = byKey.get('rework')!;
	byKey.set('rework', [...rework.filter((i) => hasRetakes(i, retakeVolumes)), ...rework.filter((i) => !hasRetakes(i, retakeVolumes))]);
	const sections = SECTION_ORDER.filter((k) => byKey.get(k)!.length > 0).map((key, index) => ({ key, ordinal: index + 1, items: byKey.get(key)! }));
	return { sections, done };
}

/**
 * Position of the next item to capture (Siguiente), or null when there is
 * none: the first item of the first section that has one an operator can
 * open, in the sections' order. An item must have a volume and a project, as
 * the capture link needs both. `retakeVolumes` are the volumes with pages
 * waiting to be recaptured (0.2.0).
 */
export function nextItemPosition(items: QueueItem[], retakeVolumes?: ReadonlySet<number>): number | null {
	const capturable = (i: QueueItem) => i.collectionId != null && i.projectId != null;
	for (const section of queueSections(items, retakeVolumes).sections) {
		const next = section.items.find(capturable);
		if (next) return next.position;
	}
	return null;
}

/**
 * Whether the item's capture waits for the recapture turn: only new material,
 * and only during the recaptures turn. Sections 1 and 2 are never locked,
 * since the backend lets a full rescan start in any turn. A done item is
 * locked as its work would be.
 */
export function isLockedForTurn(item: QueueItem, retakeVolumes: ReadonlySet<number> | undefined, turnState: string | null | undefined): boolean {
	return turnState === 'recaptures' && workOf(item, retakeVolumes) === 'new';
}

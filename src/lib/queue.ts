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
// ============================================================================
//
// Version: 0.2.0

import type { ImportReject, QueueItem, QueueList, StatusCounts } from '$lib/api';
import { placeVolume } from '$lib/pipeline';

// The action values a list may carry on an item (an additive field the
// contract ignores). Another value is shown as the file gives it.
export const QUEUE_ACTIONS = ['spot-recapture', 'full-rescan', 'full-digitisation', 'complete'] as const;
export type QueueAction = (typeof QUEUE_ACTIONS)[number];

export function isQueueAction(value: unknown): value is QueueAction {
	return typeof value === 'string' && (QUEUE_ACTIONS as readonly string[]).includes(value);
}

function total(counts: StatusCounts): number {
	return counts.captured + counts.in_review + counts.rejected + counts.approved;
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
 * `collectionId`. Null when that item has neither notes nor an action;
 * undefined when no list has an item for the volume, so that the caller can
 * fall back to the volume's own custom_attributes.
 */
export function instructionForVolume(lists: QueueList[], collectionId: number): CaptureInstruction | null | undefined {
	for (const list of lists) {
		const item = list.items.find((i) => i.collectionId === collectionId);
		if (!item) continue;
		const notes = typeof item.notes === 'string' && item.notes.trim() ? item.notes : null;
		const action = item.action || null;
		return notes || action ? { notes, action } : null;
	}
	return undefined;
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

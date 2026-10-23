// ============================================================================
// Pipeline board: which stage a volume is in, decided from its records'
// status counts (GET /activity/collections).
//
// A volume sits in its first unfinished stage, in the order the work moves:
// capture, recapture of rejected images, review, approval. So a volume with
// one captured record is still "en captura" however many of its other records
// are approved, and only a volume whose every record is approved is done.
// ============================================================================

import type { CollectionActivity, StatusCounts } from '$lib/api';

export const PIPELINE_STAGES = ['capture', 'recapture', 'review', 'approved'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Segment order of the stacked status bar, the same order RecordStatusBar
// lists its legend in.
export const BAR_STATUSES = ['captured', 'rejected', 'in_review', 'approved'] as const;
export type BarStatus = (typeof BAR_STATUSES)[number];

/**
 * The stage a volume belongs in:
 *   any captured record          → capture
 *   else any rejected record     → recapture
 *   else any record in review    → review
 *   else (all approved, ≥1)      → approved
 * A volume with no records is in capture: nothing in it has been started.
 */
export function placeVolume(counts: StatusCounts): PipelineStage {
	if (counts.captured > 0) return 'capture';
	if (counts.rejected > 0) return 'recapture';
	if (counts.in_review > 0) return 'review';
	if (counts.approved > 0) return 'approved';
	return 'capture';
}

export interface BarSegment {
	status: BarStatus;
	count: number;
	// Share of the volume's records, 0–100.
	percent: number;
}

/**
 * Non-empty segments of the stacked bar, in BAR_STATUSES order. A volume with
 * no records has no segments.
 */
export function barSegments(counts: StatusCounts): BarSegment[] {
	const total = BAR_STATUSES.reduce((sum, s) => sum + counts[s], 0);
	if (total === 0) return [];
	return BAR_STATUSES.filter((s) => counts[s] > 0).map((s) => ({
		status: s,
		count: counts[s],
		percent: (counts[s] / total) * 100
	}));
}

/**
 * Activity rows grouped by stage, every stage present (empty when nothing is
 * in it). Within a stage, the volume whose status changed most recently comes
 * first; volumes with no status change at all go last, in id order.
 */
export function groupByStage<T extends CollectionActivity>(rows: T[]): { [K in PipelineStage]: T[] } {
	const groups = { capture: [], recapture: [], review: [], approved: [] } as { [K in PipelineStage]: T[] };
	for (const row of rows) groups[placeVolume(row.status_counts)].push(row);
	for (const stage of PIPELINE_STAGES) {
		groups[stage].sort((a, b) => {
			const ta = a.last_status_change_at ?? '';
			const tb = b.last_status_change_at ?? '';
			if (ta !== tb) return tb.localeCompare(ta);
			return a.collection_id - b.collection_id;
		});
	}
	return groups;
}

/**
 * The API serialises datetimes as naive UTC ISO strings ("2026-10-22T17:03:11").
 * `new Date()` reads a string without an offset as local time, so mark it as
 * UTC first. A string that already carries "Z" or an offset is left as is.
 */
export function parseApiDate(iso: string): Date {
	const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
	return new Date(hasZone ? iso : `${iso}Z`);
}

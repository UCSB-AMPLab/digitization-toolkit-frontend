// Records Fisqua excluded (contract 1.6): Fisqua's third QC decision, for an
// opening that is not a page of the volume. Only a Fisqua decision sets the
// status, and the reason Fisqua gives is kept on the history row of the
// change into "excluded" (GET /collections/{id}/status-changes), not on the
// record. No import of api.ts, so the tests run in plain node.
//
// Version: 0.2.1

interface StatusChangeLike {
	record_id: number | null;
	to_status: string;
	note?: string | null;
}

/**
 * Fisqua's reason for excluding the record: the note of its latest change
 * into "excluded", or null when that change has none. `changes` is the
 * volume's history, newest first, as the backend lists it.
 */
export function exclusionNote(changes: readonly StatusChangeLike[], recordId: number): string | null {
	const latest = changes.find((c) => c.record_id === recordId && c.to_status === 'excluded');
	const note = latest?.note?.trim();
	return note ? note : null;
}

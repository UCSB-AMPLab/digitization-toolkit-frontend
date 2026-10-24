// Which record the volume page selects once its records are loaded. An
// ordinary load selects the first record. A refresh in place, as after a
// change in what is freed of the volume (NEH-248), keeps the record being
// read when it is still in the volume. With no records the selection is left
// as it was, as the page has always done.

export function selectionAfterLoad(
	records: ReadonlyArray<{ id: number }>,
	selectedId: number | null,
	keepSelection: boolean
): number | null {
	if (records.length === 0) return selectedId;
	if (keepSelection && selectedId !== null && records.some((r) => r.id === selectedId)) return selectedId;
	return records[0].id;
}

/**
 * The record an open inspection modal should show after the records were
 * reloaded: the reloaded copy with the same id, so the modal sees its new
 * state (freed timestamps among it), or null, which closes the modal, when
 * the record is no longer in the volume.
 */
export function reconcileInspected<T extends { id: number }>(inspected: T | null, records: ReadonlyArray<T>): T | null {
	if (inspected === null) return null;
	return records.find((r) => r.id === inspected.id) ?? null;
}

// The note shown on a record Fisqua excluded (contract 1.6): the note of the
// latest change into "excluded", read off the volume's status history.
//
// Version: 0.2.1
import { describe, expect, it } from 'vitest';
import { exclusionNote } from './excluded';

type Change = { record_id: number | null; to_status: string; note?: string | null };

describe('exclusionNote', () => {
	it("is the note of the record's latest change into excluded (the history is newest first)", () => {
		const changes: Change[] = [
			{ record_id: 4, to_status: 'excluded', note: 'Prueba del soporte' },
			{ record_id: 3, to_status: 'excluded', note: 'Otra' },
			{ record_id: 4, to_status: 'in_review', note: null },
			{ record_id: 4, to_status: 'excluded', note: 'Más antigua' }
		];
		expect(exclusionNote(changes, 4)).toBe('Prueba del soporte');
	});

	it('is null when the latest exclusion carries no note, even if an older one did', () => {
		const changes: Change[] = [
			{ record_id: 4, to_status: 'excluded', note: null },
			{ record_id: 4, to_status: 'excluded', note: 'Más antigua' }
		];
		expect(exclusionNote(changes, 4)).toBeNull();
	});

	it('is null for a blank note, a missing note and a record never excluded', () => {
		expect(exclusionNote([{ record_id: 4, to_status: 'excluded', note: '  ' }], 4)).toBeNull();
		expect(exclusionNote([{ record_id: 4, to_status: 'excluded' }], 4)).toBeNull();
		expect(exclusionNote([{ record_id: 4, to_status: 'approved', note: 'x' }], 4)).toBeNull();
		expect(exclusionNote([], 4)).toBeNull();
	});
});

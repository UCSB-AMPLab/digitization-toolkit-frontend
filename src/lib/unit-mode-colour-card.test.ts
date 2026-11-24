// The unit's colour card setting (NEH-340) as GET /system/unit gives it:
// `colourCardShots`, absent from an older backend.
//
// Version: 0.3.0
import { describe, expect, it } from 'vitest';
import { readUnitState } from './unit-mode';

const body = {
	mode: 'offline',
	projectsEnabled: true,
	projectsShown: true,
	defaultProjectId: null,
	prerequisites: { backup: [], fisqua: [] }
};

describe('readUnitState: colourCardShots', () => {
	it('reads the setting, on and off', () => {
		expect(readUnitState({ ...body, colourCardShots: true })?.colourCardShots).toBe(true);
		expect(readUnitState({ ...body, colourCardShots: false })?.colourCardShots).toBe(false);
	});

	it('leaves it out for an older backend, or a value of another type', () => {
		expect(readUnitState(body)).not.toHaveProperty('colourCardShots');
		expect(readUnitState({ ...body, colourCardShots: 'yes' })).not.toHaveProperty(
			'colourCardShots'
		);
	});
});

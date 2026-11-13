// NEH-339: the stepped zoom of a CHDK camera (the PowerShot A2500), set from
// the camera check. Steps run from 0 to zoom_steps - 1; a failed request's
// detail is the backend's, in either of the two forms it sends.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { clampStep, stepRange, zoomFailureDetail } from './zoom-steps';

function failure(status: number, message: string, detail?: unknown) {
	return Object.assign(new Error(message), { status, detail });
}

describe('stepRange', () => {
	it('is the last valid step of the camera with fewer steps, or null when one is unknown', () => {
		expect(stepRange(64, 64)).toBe(63);
		expect(stepRange(64, 40)).toBe(39);
		expect(stepRange(64, null)).toBeNull();
		expect(stepRange(undefined, 64)).toBeNull();
		expect(stepRange(0, 64)).toBeNull();
	});
});

describe('clampStep', () => {
	it('keeps a step between 0 and the last one', () => {
		expect(clampStep(25, 63)).toBe(25);
		expect(clampStep(-1, 63)).toBe(0);
		expect(clampStep(64, 63)).toBe(63);
	});
});

describe('zoomFailureDetail', () => {
	it('is the string detail of a refusal', () => {
		expect(zoomFailureDetail(failure(502, 'The camera on usb:001,004 did not answer'))).toBe(
			'The camera on usb:001,004 did not answer'
		);
		expect(zoomFailureDetail(failure(422, 'zoom_step must be between 0 and 63'))).toBe('zoom_step must be between 0 and 63');
	});

	it('joins the messages of pydantic\'s list form', () => {
		const list = [
			{ type: 'int_type', loc: ['body', 'zoom_step'], msg: 'Input should be a valid integer' },
			{ type: 'missing', loc: ['body'], msg: 'Field required' }
		];
		expect(zoomFailureDetail(failure(422, JSON.stringify(list), list))).toBe('Input should be a valid integer; Field required');
	});

	it('is undefined for a failure with no answer from the backend', () => {
		expect(zoomFailureDetail(new TypeError('Failed to fetch'))).toBeUndefined();
		expect(zoomFailureDetail('nope')).toBeUndefined();
	});
});

import { describe, expect, it } from 'vitest';
import { describeCaptureFailure, describeCaptureOutcome, describeTestCapture } from './capture-outcome';

describe('describeCaptureOutcome', () => {
	it('reports ok when the capture succeeded', () => {
		expect(describeCaptureOutcome({ success: true })).toEqual({ kind: 'ok' });
	});

	it('reports the backend error detail when success is false', () => {
		expect(describeCaptureOutcome({ success: false, error: 'Camera 0 is not connected' })).toEqual(
			{ kind: 'error', detail: 'Camera 0 is not connected' }
		);
	});

	it('reports an error with no detail when the backend gives none', () => {
		expect(describeCaptureOutcome({ success: false })).toEqual({ kind: 'error', detail: undefined });
	});
});

describe('describeTestCapture', () => {
	it('reports ok with seconds and bytes', () => {
		expect(describeTestCapture({ seconds: 1.2, bytes: 483920 })).toEqual({
			kind: 'ok',
			seconds: 1.2,
			bytes: 483920
		});
	});

	it('reports ok with null seconds and bytes when the headers were missing', () => {
		expect(describeTestCapture({ seconds: null, bytes: null })).toEqual({
			kind: 'ok',
			seconds: null,
			bytes: null
		});
	});

	it('carries the object URL when one is given', () => {
		expect(describeTestCapture({ seconds: 1, bytes: 2 }, 'blob:http://x/1')).toEqual({
			kind: 'ok',
			seconds: 1,
			bytes: 2,
			imageUrl: 'blob:http://x/1'
		});
	});
});

describe('describeCaptureFailure', () => {
	it('reports the thrown Error message as the detail', () => {
		const error = new Error('HTTP 422: project_name does not match a known project');
		expect(describeCaptureFailure(error)).toEqual({
			kind: 'error',
			detail: 'HTTP 422: project_name does not match a known project'
		});
	});

	it('reports no detail for a non-Error throw', () => {
		expect(describeCaptureFailure('boom')).toEqual({ kind: 'error', detail: undefined });
	});
});

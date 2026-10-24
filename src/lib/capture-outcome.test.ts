import { describe, expect, it } from 'vitest';
import { describeCaptureFailure, describeCaptureOutcome, describeTestCapture } from './capture-outcome';
import { es } from './i18n/es';
import { en } from './i18n/en';

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
	class ApiError extends Error {
		status?: number;
		constructor(message: string, status?: number) {
			super(message);
			this.status = status;
		}
	}

	it('gives a not-connected camera and a timeout their catalogue messages', () => {
		expect(describeCaptureFailure(new ApiError('Camera 1 is not connected', 404), es)).toEqual({
			kind: 'error',
			detail: es.dash_camera_capture_not_connected
		});
		expect(describeCaptureFailure(new ApiError('DSLR capture failed: no image after 12s', 504), en)).toEqual({
			kind: 'error',
			detail: en.dash_camera_capture_timeout
		});
	});

	it('gives anything else no detail, never the backend text', () => {
		for (const thrown of [
			new ApiError('Test capture failed', 500),
			new ApiError('DSLR capture failed: I/O in progress', 500),
			new ApiError('Invalid resolution: huge', 422),
			new ApiError('Camera 1 is not connected', 500),
			new Error('Failed to fetch'),
			'boom'
		]) {
			expect(describeCaptureFailure(thrown, es)).toEqual({ kind: 'error' });
		}
	});
});

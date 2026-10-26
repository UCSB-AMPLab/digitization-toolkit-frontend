// Classifies the result of a dashboard test capture so the UI can tell the
// operator whether it actually saved anything, instead of ending silently
// whether it succeeded or failed (NEH-166).
//
// Kept free of api.ts (like login-error.ts) so this stays a plain node test.
//
// Version: 0.1.0-beta

import type { Messages } from './i18n';

export type CaptureOutcome =
	| { kind: 'ok'; seconds?: number | null; bytes?: number | null; imageUrl?: string }
	| { kind: 'error'; detail?: string };

export function describeCaptureOutcome(
	result: { success: boolean; error?: string } | null | undefined
): CaptureOutcome {
	if (result?.success) return { kind: 'ok' };
	return { kind: 'error', detail: result?.error };
}

// Test-capture result from camerasApi.testCapture() (NEH-166): a failed
// request throws, so there is no success flag to check here — seconds/bytes
// just ride along for the status line, and imageUrl (the object URL the
// caller already made from the blob) rides along in case the outcome itself
// needs to know it.
export function describeTestCapture(
	result: { seconds?: number | null; bytes?: number | null },
	imageUrl?: string
): CaptureOutcome {
	return {
		kind: 'ok',
		seconds: result.seconds,
		bytes: result.bytes,
		...(imageUrl !== undefined ? { imageUrl } : {})
	};
}

// What POST /cameras/test-capture/{n} (app/api/cameras.py, test_capture)
// answers when it fails: a 404 "Camera {n} is not connected", a 504 when the
// camera did not deliver the image before the deadline, and otherwise a 500
// (or a 422 for a resolution the dashboard never sends) whose text is the
// backend's.
const CAMERA_NOT_CONNECTED = /^Camera \d+ is not connected$/;

/**
 * A failed test capture. `detail` is a catalogue message for the two failures
 * the operator can act on, and absent for any other: the backend's English
 * is never shown, and the caller logs the original error.
 */
export function describeCaptureFailure(thrown: unknown, msgs: Messages): CaptureOutcome {
	const status = typeof thrown === 'object' && thrown !== null ? (thrown as { status?: unknown }).status : undefined;
	if (status === 404 && thrown instanceof Error && CAMERA_NOT_CONNECTED.test(thrown.message)) {
		return { kind: 'error', detail: msgs.dash_camera_capture_not_connected };
	}
	if (status === 504) return { kind: 'error', detail: msgs.dash_camera_capture_timeout };
	return { kind: 'error' };
}

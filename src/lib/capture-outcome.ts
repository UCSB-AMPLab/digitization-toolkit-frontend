// Classifies the result of a dashboard test capture so the UI can tell the
// operator whether it actually saved anything, instead of ending silently
// whether it succeeded or failed (NEH-166).
//
// Kept free of api.ts (like login-error.ts) so this stays a plain node test.

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

export function describeCaptureFailure(thrown: unknown): CaptureOutcome {
	return { kind: 'error', detail: thrown instanceof Error ? thrown.message : undefined };
}

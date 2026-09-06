// Classifies the result of a dashboard test capture so the UI can tell the
// operator whether it actually saved anything, instead of ending silently
// whether it succeeded or failed (NEH-166).
//
// Kept free of api.ts (like login-error.ts) so this stays a plain node test.

export type CaptureOutcome = { kind: 'ok' } | { kind: 'error'; detail?: string };

export function describeCaptureOutcome(
	result: { success: boolean; error?: string } | null | undefined
): CaptureOutcome {
	if (result?.success) return { kind: 'ok' };
	return { kind: 'error', detail: result?.error };
}

export function describeCaptureFailure(thrown: unknown): CaptureOutcome {
	return { kind: 'error', detail: thrown instanceof Error ? thrown.message : undefined };
}

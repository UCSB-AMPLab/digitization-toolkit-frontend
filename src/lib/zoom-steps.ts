// NEH-339: the stepped zoom of a CHDK camera (the PowerShot A2500), set from
// the camera check with camerasApi.setZoomStep. A camera with zoom_steps
// steps takes 0..zoom_steps - 1. No import of api.ts, so the tests run in
// plain node.
//
// Version: 0.3.3

/**
 * The last step both cameras take: one less than the smaller count. Null
 * while either count is unknown (the camera has not entered shooting mode).
 */
export function stepRange(a: number | null | undefined, b: number | null | undefined): number | null {
	if (a == null || b == null || a < 1 || b < 1) return null;
	return Math.min(a, b) - 1;
}

export function clampStep(step: number, last: number): number {
	return Math.min(last, Math.max(0, step));
}

/**
 * The backend's detail of a refused zoom request: its string detail (the
 * thrown error's message), or the messages of pydantic's list form joined.
 * Undefined when the backend never answered (no HTTP status).
 */
export function zoomFailureDetail(thrown: unknown): string | undefined {
	if (!(thrown instanceof Error)) return undefined;
	const { status, detail } = thrown as Error & { status?: unknown; detail?: unknown };
	if (typeof status !== 'number') return undefined;
	if (Array.isArray(detail)) {
		const messages = detail
			.map((item) => (item && typeof item === 'object' ? (item as { msg?: unknown }).msg : undefined))
			.filter((msg): msg is string => typeof msg === 'string' && msg.length > 0);
		if (messages.length) return messages.join('; ');
	}
	return thrown.message || undefined;
}

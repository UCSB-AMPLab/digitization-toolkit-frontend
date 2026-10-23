// Only a 401 from /auth/login means bad credentials. Anything else — a failed
// fetch, a 5xx, Nginx's 502 while Uvicorn is still booting — means the backend
// is unavailable (NEH-153). A 429 means the backend's login throttle has
// locked the account or the client IP after repeated failures (NEH-219).

export type LoginFailure = 'credentials' | 'throttled' | 'unavailable';

// Matched by name/status instead of `instanceof AuthError` so this module
// stays free of api.ts, and its test can run in plain node.
function isUnauthorized(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.name === 'AuthError' &&
		(error as Error & { status?: number }).status === 401
	);
}

function isThrottled(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.name === 'ApiError' &&
		(error as Error & { status?: number }).status === 429
	);
}

export function classifyLoginError(
	error: unknown,
	{ credentialsChecked }: { credentialsChecked: boolean }
): LoginFailure {
	// Once /auth/login has returned 200 the password was correct, so a later
	// failure (e.g. /users/me) must never be reported as a credentials problem.
	if (credentialsChecked) return 'unavailable';

	if (isUnauthorized(error)) return 'credentials';
	if (isThrottled(error)) return 'throttled';
	return 'unavailable';
}

// Minutes to wait before the next attempt, from the `Retry-After` header of a
// 429, rounded up to whole minutes. The backend sends seconds. Returns null
// when the header is missing or not a number of seconds (the HTTP-date form
// is not used by the backend), so the caller can fall back to a message
// without a figure.
export function lockoutMinutes(retryAfter: string | null | undefined): number | null {
	if (retryAfter == null || !/^\s*\d+\s*$/.test(retryAfter)) return null;
	const seconds = Number(retryAfter);
	if (seconds <= 0) return null;
	return Math.ceil(seconds / 60);
}

// Reads `retryAfter` from an ApiError-shaped error without importing api.ts.
export function retryAfterOf(error: unknown): string | null {
	if (error instanceof Error && 'retryAfter' in error) {
		const value = (error as Error & { retryAfter?: unknown }).retryAfter;
		return typeof value === 'string' ? value : null;
	}
	return null;
}
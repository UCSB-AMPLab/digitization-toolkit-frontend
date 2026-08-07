// Only a 401 from /auth/login means bad credentials. Anything else — a failed
// fetch, a 5xx, Nginx's 502 while Uvicorn is still booting — means the backend
// is unavailable (NEH-153).

export type LoginFailure = 'credentials' | 'unavailable';

// Matched by name/status instead of `instanceof AuthError` so this module
// stays free of api.ts, and its test can run in plain node.
function isUnauthorized(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.name === 'AuthError' &&
		(error as Error & { status?: number }).status === 401
	);
}

export function classifyLoginError(
	error: unknown,
	{ credentialsChecked }: { credentialsChecked: boolean }
): LoginFailure {
	// Once /auth/login has returned 200 the password was correct, so a later
	// failure (e.g. /users/me) must never be reported as a credentials problem.
	if (credentialsChecked) return 'unavailable';

	return isUnauthorized(error) ? 'credentials' : 'unavailable';
}
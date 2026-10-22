// Validating a saved session against the backend (NEH-219).
//
// On the appliance the kiosk opens the app before the backend answers: Nginx
// returns 502 for several seconds while the backend starts under pixi. Only a
// 401 or 403 means the backend rejected the session. A failed fetch, a 5xx or
// any other error means the backend could not be asked, so the saved session
// is kept and the check is repeated after a delay instead of sending the
// operator to /login.

export type SessionCheckFailure = 'invalid' | 'unavailable';

// Matched by name/status instead of `instanceof AuthError` so this module
// stays free of api.ts and its tests can run in plain node (same approach as
// login-error.ts).
export function classifySessionError(error: unknown): SessionCheckFailure {
	if (error instanceof Error && error.name === 'AuthError') {
		const status = (error as Error & { status?: number }).status;
		if (status === 401 || status === 403) return 'invalid';
	}
	return 'unavailable';
}

export const SESSION_RETRY_FIRST_MS = 2000;
export const SESSION_RETRY_MAX_MS = 10000;

// Delay before retry number `attempt` (0 for the first retry): 2 s, 4 s, 8 s,
// then 10 s for every retry after that.
export function sessionRetryDelay(attempt: number): number {
	return Math.min(SESSION_RETRY_FIRST_MS * 2 ** Math.max(0, attempt), SESSION_RETRY_MAX_MS);
}

export type SessionCheckOutcome<T> =
	| { kind: 'valid'; user: T }
	| { kind: 'invalid' }
	| { kind: 'cancelled' };

export interface WaitForSessionOptions {
	// Called with true when the first check fails because the backend is
	// unavailable, and with false once a check gets an answer.
	onWaiting?: (waiting: boolean) => void;
	// Aborting stops the retries (the layout aborts on unmount).
	signal?: AbortSignal;
	delay?: (attempt: number) => number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}

// Runs `check` until the backend answers. Returns the user on success,
// 'invalid' on a 401/403, and 'cancelled' if `signal` is aborted first.
// Never gives up on an unavailable backend: the kiosk has nowhere better to go.
export async function waitForSession<T>(
	check: () => Promise<T>,
	{
		onWaiting,
		signal,
		delay = sessionRetryDelay,
		sleep = defaultSleep
	}: WaitForSessionOptions = {}
): Promise<SessionCheckOutcome<T>> {
	let waiting = false;
	for (let attempt = 0; ; attempt++) {
		if (signal?.aborted) return { kind: 'cancelled' };
		try {
			const user = await check();
			if (signal?.aborted) return { kind: 'cancelled' };
			if (waiting) onWaiting?.(false);
			return { kind: 'valid', user };
		} catch (error) {
			if (signal?.aborted) return { kind: 'cancelled' };
			if (classifySessionError(error) === 'invalid') {
				if (waiting) onWaiting?.(false);
				return { kind: 'invalid' };
			}
			if (!waiting) {
				waiting = true;
				onWaiting?.(true);
			}
			await sleep(delay(attempt), signal);
		}
	}
}

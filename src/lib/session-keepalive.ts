// Keeps the session alive while someone is using the interface (NEH-355).
//
// The backend's session lasts ACCESS_TOKEN_EXPIRE_SECONDS (eight hours) from
// the moment its token was issued. POST /auth/refresh issues a new token with
// a full eight hours and sets it in a new cookie whose Max-Age is again the
// full eight hours; it needs a token that has not yet expired, and answers an
// expired one with a 401, which apiRequest() turns into the global sign-out.
// So the session has to be renewed before it ends, and a renewal can only
// extend it, never bring it back.
//
// A renewal follows real input only: a pointer press, a key (the capture
// pedal is a keyboard sending one key), a touch or a wheel turn, from the
// browser itself (isTrusted). An input renews at once when the last renewal
// was at least SESSION_RENEW_INTERVAL_MS ago, so there is at most one renewal
// per interval and none without input: an unattended kiosk is signed out
// eight hours after its last renewal, between eight hours less one interval
// and eight hours after the last input. Renewing on the input itself, rather
// than on a timer that checks for input, means a person who comes back to a
// session close to its end renews it before it lapses.
//
// One renewal is in flight at a time. A failed one is silent; the next input
// after another interval tries again.
//
// The renewals of the page (sessionRenewals) are shared with sign-out in
// api.ts: a sign-out stops them, waits for the one in flight to settle, and
// only then sends POST /auth/logout; a sign-in resumes them. api.ts imports
// this module and this module imports nothing, so there is no import cycle.
//
// No Svelte imports and no direct `window` references, so the node test
// project can test the module.
//
// Version: 0.1.0-beta

// Ten minutes: far inside the eight hours, so a session in use never comes
// near its end, and short enough that an idle session ends at most ten
// minutes before eight hours after the last input. It costs one small request
// per ten minutes of use.
export const SESSION_RENEW_INTERVAL_MS = 10 * 60 * 1000;

export const SESSION_ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

export interface SessionKeepaliveOptions {
	// Where input is listened for (the window).
	target: EventTarget;
	// Renews the session (authApi.refreshSession).
	renew: () => Promise<void>;
	// Whether this tab holds a session; nothing is renewed while it does not.
	isSignedIn: () => boolean;
	now?: () => number;
	intervalMs?: number;
	// Shared with sign-out; sessionRenewals unless a test gives its own.
	renewals?: SessionRenewals;
}

// The page's session renewals: at most one in flight, none while stopped.
export interface SessionRenewals {
	// Whether a renewal may start now: none is in flight and renewals are not stopped.
	canStart(): boolean;
	// Runs `renew` as the renewal in flight. Its failure is silent.
	start(renew: () => Promise<void>): void;
	// Stops renewals until resume(). Resolves, never rejects, once the renewal
	// in flight when it was called has settled (at once with none), with
	// whether there was one.
	stop(): Promise<boolean>;
	// Allows renewals again, after a sign-in.
	resume(): void;
}

export function createSessionRenewals(): SessionRenewals {
	let inFlight: Promise<void> | null = null;
	let stopped = false;
	return {
		canStart: () => !stopped && inFlight === null,
		start(renew) {
			if (stopped || inFlight) return;
			const settled = renew()
				.catch(() => {
					// Silent: the next input after an interval tries again.
				})
				.finally(() => {
					if (inFlight === settled) inFlight = null;
				});
			inFlight = settled;
		},
		stop() {
			stopped = true;
			const pending = inFlight;
			return pending ? pending.then(() => true) : Promise.resolve(false);
		},
		resume() {
			stopped = false;
		}
	};
}

export const sessionRenewals = createSessionRenewals();

// Starts listening; the function it returns stops.
export function startSessionKeepalive(options: SessionKeepaliveOptions): () => void {
	const {
		target,
		renew,
		isSignedIn,
		now = Date.now,
		intervalMs = SESSION_RENEW_INTERVAL_MS,
		renewals = sessionRenewals
	} = options;
	// No renewal yet in this page: the token may be close to its end after a
	// reload, so the first input renews at once.
	let lastAttempt = -Infinity;

	const onInput = (event: Event) => {
		if (!event.isTrusted || !renewals.canStart() || !isSignedIn()) return;
		const at = now();
		if (at - lastAttempt < intervalMs) return;
		lastAttempt = at;
		renewals.start(renew);
	};

	const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
	for (const type of SESSION_ACTIVITY_EVENTS)
		target.addEventListener(type, onInput, listenerOptions);
	return () => {
		for (const type of SESSION_ACTIVITY_EVENTS)
			target.removeEventListener(type, onInput, listenerOptions);
	};
}

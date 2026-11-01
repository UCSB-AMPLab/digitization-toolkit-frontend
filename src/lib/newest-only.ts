// Only the newest of overlapping loads is assigned (NEH-317).
//
// A screen that reads the same thing from several places (after a capture,
// on a retry, when the guide moves on) can have two reads in flight; if the
// older answers last, assigning it would put an older snapshot over a newer
// one. newestOnly gives each call a number: a response is applied only when
// its call is still the newest, and an older response is discarded whoever
// started it. Each caller gets back
// - `own`: its own response was the one applied;
// - `ok`: what is on screen is a successful read started no earlier than
//   its call: its own, or, once its response has been discarded, the newest
//   call's outcome, which it waits for.
// `apply` assigns the value and says whether it was usable (false assigns
// nothing on screen that the caller can rely on). A failed request is
// passed to `onError` and counts as not ok.
//
// No import of api.ts, so the tests run in plain node.
//
// Version: 0.3.3

export interface LoadResult {
	ok: boolean;
	own: boolean;
}

export function newestOnly<T>(
	request: () => Promise<T>,
	apply: (value: T) => boolean,
	onError?: (error: unknown) => void
): () => Promise<LoadResult> {
	let newestId = 0;
	// The newest call's own outcome: whether its response was applied and usable.
	let newest: Promise<boolean> = Promise.resolve(false);

	// The outcome of the newest call, following any newer call that starts meanwhile.
	async function newestOutcome(): Promise<boolean> {
		for (;;) {
			const current = newest;
			const ok = await current;
			if (current === newest) return ok;
		}
	}

	return function load(): Promise<LoadResult> {
		const id = ++newestId;
		const mine = (async (): Promise<boolean> => {
			let value: T;
			try {
				value = await request();
			} catch (error) {
				onError?.(error);
				return false;
			}
			if (id !== newestId) return false;
			return apply(value);
		})();
		newest = mine;
		return mine.then(async (ok) => {
			if (id === newestId) return { ok, own: ok };
			return { ok: await newestOutcome(), own: false };
		});
	};
}

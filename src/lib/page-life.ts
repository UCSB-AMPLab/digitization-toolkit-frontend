// The life of a page's requests (NEH-336). A page creates it while it is
// set up (pageLife) and starts each operation with `begin(kind)`. The
// operation's token goes stale, and its signal aborts, when a newer
// operation of the same kind starts, when that kind is stopped, or when the
// page is destroyed. Every continuation after an `await` in such a page
// checks its token with `current()` before any effect: a session, a
// navigation, a language, a cookie, a store write or a message. Operations of
// other kinds go on.
//
// createPageLife has no Svelte lifecycle, so it can be tested in Node.

import { onDestroy } from 'svelte';

export interface Operation {
	readonly signal: AbortSignal;
	/** True while the page is mounted and no newer operation of this kind has started. */
	current(): boolean;
}

export interface PageLife {
	alive(): boolean;
	begin(kind?: string): Operation;
	stop(kind?: string): void;
	destroy(): void;
}

export function createPageLife(): PageLife {
	let destroyed = false;
	const running = new Map<string, AbortController>();
	return {
		alive: () => !destroyed,
		begin(kind = 'main') {
			running.get(kind)?.abort();
			const controller = new AbortController();
			if (destroyed) controller.abort();
			else running.set(kind, controller);
			return {
				signal: controller.signal,
				current: () => !destroyed && !controller.signal.aborted
			};
		},
		stop(kind = 'main') {
			running.get(kind)?.abort();
			running.delete(kind);
		},
		destroy() {
			destroyed = true;
			for (const controller of running.values()) controller.abort();
			running.clear();
		}
	};
}

/** A page's life, destroyed with the component that creates it. */
export function pageLife(): PageLife {
	const life = createPageLife();
	onDestroy(() => life.destroy());
	return life;
}

// The specs' API client, with one change from Playwright's own: it closes
// each connection after its response instead of keeping it for reuse.
//
// uvicorn closes an idle keep-alive connection after 5 s (its default; the
// dev backend sets no --timeout-keep-alive). A spec that drives the browser
// for about that long and then calls the API could reuse a connection the
// server was closing at that moment, and the call failed with "socket hang
// up" before reaching the backend. Through an SSH tunnel to a remote stack
// the window is wider: in a probe, 4 of 6 calls made 5 s after the previous
// one were dropped on a reused connection, and none with Connection: close.
// The browser's own requests are left as they are; no failure in them has
// been traced to this.
//
// Version: 0.1.0-beta
import { test as base } from '@playwright/test';

export const test = base.extend({
	request: async ({ playwright }, use) => {
		const ctx = await playwright.request.newContext({ extraHTTPHeaders: { Connection: 'close' } });
		await use(ctx);
		await ctx.dispose();
	}
});

export { expect } from '@playwright/test';
export type { APIRequestContext, Page } from '@playwright/test';

// A unique, valid filename_stem for a throwaway volume. The backend requires
// one at creation and refuses captures and uploads into a volume without one.
// The `xx-test-` prefix marks it as synthetic; the rest (time, a random part
// and a per-run counter, all base 36) keeps it unique across runs and
// parallel workers, within the 27-character limit.
let stemCounter = 0;
const stemRun = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export function testStem(): string {
	stemCounter += 1;
	return `xx-test-${stemRun}-${stemCounter.toString(36)}`;
}

/// <reference types="@vitest/browser/matchers" />
/// <reference types="@vitest/browser/providers/playwright" />
// Set-up for every browser test. All the files of a browser page run in one
// Chromium page with one real pointer, one file after another and one test
// after another, and the pointer stays where the last click or hover put it:
// a control drawn under it in the next test would start in its hover state.
// Before each test the pointer is moved outside the runner page's viewport
// (movePointerOffPage in vite.config.ts), where it is over nothing, at any
// size of the test frame. The files share the page's storage too, so the
// camera panel's remembered state (NEH-225) is cleared before each test:
// every test starts with the panel collapsed, as on a browser that has none.
// They share its cookies as well, so the sign-out mark a logout sets
// (SIGNED_OUT_COOKIE in src/lib/stores/signed-out.ts, NEH-415) is cleared
// before each test: every test starts in a browser that has not signed out.
//
// Version: 0.4.0
import { beforeEach } from 'vitest';
import { commands } from 'vitest/browser';
import { STORAGE_KEYS } from './src/lib/storage-keys';

// SIGNED_OUT_COOKIE in src/lib/stores/signed-out.ts. Named here, not
// imported: importing signed-out.ts before a test file's vi.mock calls would
// load it with the real modules that test mocks.
const SIGNED_OUT_COOKIE = 'captua_signed_out';

declare module 'vitest/browser' {
	interface BrowserCommands {
		movePointerOffPage: () => Promise<void>;
	}
}

beforeEach(async () => {
	await commands.movePointerOffPage();
	try {
		localStorage.removeItem(STORAGE_KEYS.cameraPanelOpen);
		localStorage.removeItem(STORAGE_KEYS.cameraPanelSections);
	} catch {
		// Nothing to clear when storage is unavailable.
	}
	document.cookie = `${SIGNED_OUT_COOKIE}=; path=/; max-age=0`;
});

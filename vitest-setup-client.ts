/// <reference types="@vitest/browser/matchers" />
/// <reference types="@vitest/browser/providers/playwright" />
// Set-up for every browser test. All the files of a browser page run in one
// Chromium page with one real pointer, one file after another and one test
// after another, and the pointer stays where the last click or hover put it:
// a control drawn under it in the next test would start in its hover state.
// Before each test the pointer is moved outside the runner page's viewport
// (movePointerOffPage in vite.config.ts), where it is over nothing, at any
// size of the test frame.
//
// Version: 0.3.7
import { beforeEach } from 'vitest';
import { commands } from 'vitest/browser';

declare module 'vitest/browser' {
	interface BrowserCommands {
		movePointerOffPage: () => Promise<void>;
	}
}

beforeEach(async () => {
	await commands.movePointerOffPage();
});

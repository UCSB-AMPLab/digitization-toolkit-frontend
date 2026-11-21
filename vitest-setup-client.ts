/// <reference types="@vitest/browser/matchers" />
/// <reference types="@vitest/browser/providers/playwright" />
// Set-up for every browser test. All the files of a browser page run in one
// Chromium page with one real pointer, one file after another and one test
// after another, and the pointer stays where the last click or hover put it:
// a control drawn under it in the next test would start in its hover state.
// Before each test the pointer is moved off the test frame, onto the bare
// runner page beside it (movePointerOffFrame in vite.config.ts), where no
// control of any page under test can be.
//
// Version: 0.3.7
import { beforeEach } from 'vitest';
import { commands } from 'vitest/browser';

declare module 'vitest/browser' {
	interface BrowserCommands {
		movePointerOffFrame: () => Promise<void>;
	}
}

beforeEach(async () => {
	await commands.movePointerOffFrame();
});

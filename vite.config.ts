import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';

// Moves the real pointer to a point above and to the left of the runner
// page, outside its viewport. Chromium hit-tests nothing there, so the pointer
// leaves the page and no element of it, the test frame included, is hovered;
// the point stays outside the viewport whatever size the test frame is given
// later, including a frame that covers the whole page.
const movePointerOffPage: BrowserCommand<[]> = async ({ page }) => {
	await page.mouse.move(-1, -1);
};

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Capped at 2 because the development machine is shared and small.
		maxWorkers: 2,
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						// A zone west of UTC, so that tests of naive-UTC date parsing
						// can fail on a UTC host (CI) too.
						provider: playwright({ contextOptions: { timezoneId: 'America/Bogota' } }),
						instances: [{ browser: 'chromium' }],
						commands: { movePointerOffPage }
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});

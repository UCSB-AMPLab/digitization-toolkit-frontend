import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';

// The test frame sits inside the runner page; headless, it is drawn at the
// top left of the page and scaled to fit inside it, so unless its shape
// matches the page's, part of the page beside or below it is bare. The
// pointer goes to the page's bottom right corner, off the frame; if the frame
// covers the whole page there is no such place, and the command fails rather
// than leave the pointer on a control.
const movePointerOffFrame: BrowserCommand<[]> = async ({ page }) => {
	const frame = await page.locator('iframe[data-vitest="true"]').boundingBox();
	const size = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
	const x = size.width - 1;
	const y = size.height - 1;
	if (frame && x < frame.x + frame.width && y < frame.y + frame.height) {
		throw new Error(`The test frame covers the whole runner page (${size.width}x${size.height}); there is no place off it for the pointer.`);
	}
	await page.mouse.move(x, y);
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
						commands: { movePointerOffFrame }
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

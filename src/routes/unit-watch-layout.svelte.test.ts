// NEH-186: the root layout starts the watcher (lib/unit-watch.ts) on every
// page, signed in or not, the login and set-up pages included, asks the
// health with healthApi.probe, stops it on unmount and starts it again on a
// new mount, and shows the banner while the unit is not answering. The
// watcher's timing and its one-at-a-time rule are tested in
// lib/unit-watch.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/login') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const watch = vi.hoisted(() => ({
	calls: [] as { probe: (s: AbortSignal) => Promise<unknown> }[],
	stopped: 0
}));
vi.mock('$lib/unit-watch', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/unit-watch')>();
	return {
		...actual,
		startUnitWatch: (opts: (typeof watch.calls)[number]) => {
			watch.calls.push(opts);
			return () => {
				watch.stopped += 1;
			};
		}
	};
});

import { en } from '$lib/i18n/en';
import { unitNotAnswering } from '$lib/unit-watch';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>login</p>' }));

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
	watch.calls = [];
	watch.stopped = 0;
	fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify({ status: 'ok' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	);
});
afterEach(() => {
	unitNotAnswering.set(false);
	vi.restoreAllMocks();
});

describe('watcher in the root layout', () => {
	it('starts on mount, asks /health, stops on unmount and starts again on the next mount', async () => {
		const first = render(Layout, { props: { children, data: { locale: 'en' } } });
		await expect.poll(() => watch.calls.length).toBe(1);
		expect(await watch.calls[0].probe(new AbortController().signal)).toBe('ok');
		expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith('/health'))).toBe(true);
		first.unmount();
		expect(watch.stopped).toBe(1);
		render(Layout, { props: { children, data: { locale: 'en' } } });
		await expect.poll(() => watch.calls.length).toBe(2);
		expect(watch.stopped).toBe(1);
	});

	it('shows the banner while the unit is not answering', async () => {
		render(Layout, { props: { children, data: { locale: 'en' } } });
		await expect.poll(() => watch.calls.length).toBe(1);
		unitNotAnswering.set(true);
		await expect.element(page.getByText(en.unit_not_answering)).toBeVisible();
	});
});

// NEH-355: the root layout renews the session on real input, so every
// signed-in page renews it, /live-preview included, which is outside the
// dashboard layout. Signed out, input renews nothing.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/live-preview') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type AuthUser } from '$lib/stores/auth';
import Layout from './+layout.svelte';

const user: AuthUser = {
	id: 1,
	username: 'operator1',
	email: null,
	role: 'operator',
	is_active: true
};

const children = createRawSnippet(() => ({ render: () => '<p>capture screen</p>' }));

function refreshCalls(spy: MockInstance<typeof fetch>) {
	return spy.mock.calls.filter(([url, init]) => {
		return (
			String(url).endsWith('/auth/refresh') && (init as RequestInit | undefined)?.method === 'POST'
		);
	});
}

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify({ access_token: null, token_type: 'cookie' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('session renewal from the root layout', () => {
	it('a key press while signed in renews the session', async () => {
		authStore.setSession(user);
		render(Layout, { props: { children, data: { locale: 'en' } } });

		await userEvent.keyboard('b');

		await expect.poll(() => refreshCalls(fetchSpy).length).toBe(1);
	});

	it('signed out, input renews nothing', async () => {
		render(Layout, { props: { children, data: { locale: 'en' } } });

		await userEvent.keyboard('b');
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(refreshCalls(fetchSpy)).toHaveLength(0);
	});
});

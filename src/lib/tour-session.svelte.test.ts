// A tour ends with the session that opened it (NEH-391): one left open by a
// user who signs out, or whose session the backend ends, is not active for
// the next account that signs in in the same tab.
//
// Version: 0.1.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type AuthUser } from '$lib/stores/auth';
import { authApi, endRejectedSession } from '$lib/api';
import { tour } from '$lib/tour';

const operator: AuthUser = {
	id: 1,
	username: 'op',
	email: null,
	role: 'operator',
	is_active: true
};
const testing: AuthUser = {
	id: 9,
	username: 'unit-testing',
	email: null,
	role: 'testing',
	is_active: true
};

afterEach(() => {
	vi.restoreAllMocks();
	tour.stop();
	authStore.clearSession();
});

describe('the guided tour and the end of a session', () => {
	it('is not active for the testing account that signs in after a logout', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
		authStore.setSession(operator);
		tour.start();
		expect(get(tour).active).toBe(true);
		await authApi.logout();
		authStore.setSession(testing, { signIn: true });
		expect(get(tour).active).toBe(false);
	});

	it('is not active for the testing account that signs in after the backend ended the session', () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
		authStore.setSession(operator);
		tour.start();
		endRejectedSession();
		authStore.setSession(testing, { signIn: true });
		expect(get(tour).active).toBe(false);
	});

	it('keeps the tour open while the same user is revalidated', () => {
		authStore.setSession(operator);
		tour.start();
		authStore.setSession({ ...operator });
		expect(get(tour).active).toBe(true);
	});
});

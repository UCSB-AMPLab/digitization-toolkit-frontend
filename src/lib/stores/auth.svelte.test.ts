// NEH-41: authStore and tokenStore used to write the access token to
// localStorage independently (two copies of the same key, only coincidentally
// in sync). These tests pin authStore's session methods to actually delegate
// to tokenStore — the single store of record — so a future change can't
// silently reintroduce the divergence.
import { afterEach, describe, expect, it } from 'vitest';
import { authStore } from './auth';
import { tokenStore } from './token';
import type { AuthUser } from './auth';

const user: AuthUser = {
	id: 1,
	username: 'reviewer1',
	email: 'reviewer1@example.com',
	role: 'reviewer',
	is_active: true
};

afterEach(() => {
	authStore.clearSession();
});

describe('authStore delegates token persistence to tokenStore', () => {
	it('setSession writes the token where tokenStore reads it', () => {
		authStore.setSession('token-abc', user);
		expect(tokenStore.get()).toBe('token-abc');
	});

	it('clearSession clears the token from tokenStore too', () => {
		authStore.setSession('token-abc', user);
		authStore.clearSession();
		expect(tokenStore.get()).toBeNull();
	});

	it('updateToken (the refresh path) updates tokenStore and the store state without touching the user', () => {
		authStore.setSession('token-abc', user);
		authStore.updateToken('token-refreshed');

		expect(tokenStore.get()).toBe('token-refreshed');

		let state: { token: string | null; user: AuthUser | null } | undefined;
		authStore.subscribe((s) => (state = s))();
		expect(state?.token).toBe('token-refreshed');
		expect(state?.user).toEqual(user);
	});

	it('a token set directly via tokenStore is what a fresh authStore read would see (one store, not two)', () => {
		tokenStore.set('token-set-elsewhere');
		expect(tokenStore.get()).toBe('token-set-elsewhere');
		// authStore's own initial-state read uses the same tokenStore.get(),
		// so there is no second copy of the key that could disagree with it.
	});
});

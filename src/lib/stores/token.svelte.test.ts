import { afterEach, describe, expect, it } from 'vitest';
import { tokenStore } from './token';

afterEach(() => {
	tokenStore.clear();
});

describe('tokenStore', () => {
	it('returns null when nothing is stored', () => {
		expect(tokenStore.get()).toBeNull();
	});

	it('set() persists the token and get() reads it back', () => {
		tokenStore.set('abc123');
		expect(tokenStore.get()).toBe('abc123');
	});

	it('set() overwrites a previously stored token', () => {
		tokenStore.set('first');
		tokenStore.set('second');
		expect(tokenStore.get()).toBe('second');
	});

	it('clear() removes the token', () => {
		tokenStore.set('abc123');
		tokenStore.clear();
		expect(tokenStore.get()).toBeNull();
	});
});

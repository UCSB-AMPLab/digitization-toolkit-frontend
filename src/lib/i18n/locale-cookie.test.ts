import { describe, expect, it } from 'vitest';
import { LEGACY_LOCALE_COOKIE, LOCALE_COOKIE, localeCookies, localeFromCookies } from './index';

const jar = (values: Record<string, string>) => (name: string) => values[name];

describe('localeFromCookies', () => {
	it('reads the current cookie', () => {
		expect(localeFromCookies(jar({ [LOCALE_COOKIE]: 'en' }))).toBe('en');
	});

	it('falls back to the old cookie when the current one is absent', () => {
		expect(localeFromCookies(jar({ [LEGACY_LOCALE_COOKIE]: 'en' }))).toBe('en');
	});

	it('prefers the current cookie when both are present', () => {
		expect(localeFromCookies(jar({ [LOCALE_COOKIE]: 'es', [LEGACY_LOCALE_COOKIE]: 'en' }))).toBe('es');
	});

	it('falls back to the old cookie when the current value is not a language', () => {
		expect(localeFromCookies(jar({ [LOCALE_COOKIE]: 'fr', [LEGACY_LOCALE_COOKIE]: 'en' }))).toBe('en');
	});

	it('uses the default when neither is set', () => {
		expect(localeFromCookies(jar({}))).toBe('es');
	});

	it('names the cookies as expected', () => {
		expect([LOCALE_COOKIE, LEGACY_LOCALE_COOKIE]).toEqual(['captua_locale', 'dtk_locale']);
	});
});

describe('localeCookies', () => {
	it('writes both names with the same value and attributes', () => {
		const attrs = '; path=/; max-age=31536000; samesite=lax';
		expect(localeCookies('en')).toEqual([`captua_locale=en${attrs}`, `dtk_locale=en${attrs}`]);
	});
});

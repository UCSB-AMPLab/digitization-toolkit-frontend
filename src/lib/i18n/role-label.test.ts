// roleLabel translates the role the backend sends, the testing role (NEH-391)
// included.
//
// Version: 0.3.0
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { locale, roleLabel } from './index';

afterEach(() => locale.set('es'));

describe('roleLabel', () => {
	it('labels the testing role in English and Spanish', () => {
		locale.set('en');
		expect(get(roleLabel)('testing')).toBe('Testing');
		locale.set('es');
		expect(get(roleLabel)('testing')).toBe('Pruebas');
	});
});

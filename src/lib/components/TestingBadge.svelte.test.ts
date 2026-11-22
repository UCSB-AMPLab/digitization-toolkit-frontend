// The badge that marks a testing project or volume (NEH-391).
//
// Version: 0.3.0
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { locale } from '$lib/i18n';
import TestingBadge from './TestingBadge.svelte';

afterEach(() => locale.set('es'));

describe('TestingBadge', () => {
	it('shows "Testing" in English', async () => {
		locale.set('en');
		const screen = render(TestingBadge);
		await expect.element(screen.getByText('Testing')).toBeInTheDocument();
	});

	it('shows "Pruebas" in Spanish and takes an extra class', async () => {
		locale.set('es');
		const screen = render(TestingBadge, { class: 'extra' });
		await expect.element(screen.getByText('Pruebas')).toBeInTheDocument();
		expect(screen.container.querySelector('.testing-badge.extra')).not.toBeNull();
	});
});

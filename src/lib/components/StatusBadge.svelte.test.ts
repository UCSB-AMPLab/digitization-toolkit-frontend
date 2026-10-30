// The status badge names every record status, Fisqua's "excluded" (contract
// 1.6) included.
//
// Version: 0.2.1
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { locale } from '$lib/i18n';
import StatusBadge from './StatusBadge.svelte';

afterEach(() => locale.set('es'));

describe('StatusBadge', () => {
	it('shows an excluded record as "Excluido", with the muted status class', async () => {
		locale.set('es');
		const screen = render(StatusBadge, { status: 'excluded' });
		await expect.element(screen.getByText('Excluido')).toBeInTheDocument();
		expect(screen.container.querySelector('.status-badge.status-excluded')).not.toBeNull();
	});

	it('shows it as "Excluded" in English', async () => {
		locale.set('en');
		const screen = render(StatusBadge, { status: 'excluded' });
		await expect.element(screen.getByText('Excluded')).toBeInTheDocument();
	});
});

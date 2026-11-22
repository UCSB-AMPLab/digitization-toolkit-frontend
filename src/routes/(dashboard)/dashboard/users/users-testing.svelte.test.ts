// The testing role (NEH-391) on the Users page: an administrator cannot
// choose it when creating or re-roling a user, and a testing account's row
// shows its translated role and no actions, because the backend refuses
// every change to it.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import '../../../../app.css';
import UsersPage from './+page.svelte';

const users = [
	{
		id: 1,
		username: 'ana',
		email: null,
		role: 'operator',
		is_active: true,
		created_at: '2026-01-01T00:00:00Z'
	},
	{
		id: 2,
		username: 'unit-testing',
		email: null,
		role: 'testing',
		is_active: true,
		created_at: '2026-01-01T00:00:00Z'
	}
];

beforeEach(() => {
	locale.set('en');
	authStore.setSession({ id: 3, username: 'admin', email: null, role: 'admin', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () =>
			new Response(JSON.stringify(users), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

function rowOf(container: HTMLElement, name: string) {
	return [...container.querySelectorAll('tr.table-row')].find((r) =>
		r.textContent?.includes(name)
	) as HTMLElement;
}

describe('Users page and the testing role', () => {
	it('shows a testing row with the label "Testing" and no actions button', async () => {
		const screen = render(UsersPage);
		await expect.element(screen.getByText('unit-testing')).toBeVisible();
		const row = rowOf(screen.container, 'unit-testing');
		expect(row.querySelector('.role-badge')?.textContent?.trim()).toBe('Testing');
		expect(row.querySelector('.btn-actions')).toBeNull();
		expect(rowOf(screen.container, 'ana').querySelector('.btn-actions')).not.toBeNull();
	});

	it('offers no testing option in the create form or the role filter', async () => {
		const screen = render(UsersPage);
		await expect.element(screen.getByText('unit-testing')).toBeVisible();
		await screen.getByRole('button', { name: /new user/i }).click();
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		const dialog = screen.container.querySelector('[role="dialog"]')!;
		expect(dialog.textContent).not.toContain('Testing');
		const optionValues = [...screen.container.querySelectorAll('option')].map((o) =>
			o.getAttribute('value')
		);
		expect(optionValues).not.toContain('testing');
	});
});

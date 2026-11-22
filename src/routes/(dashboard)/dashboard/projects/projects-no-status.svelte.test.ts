// The project list has no Status column for any role: the backend has no
// project status, so a row's text depends on the project alone and never on
// its position in the list.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import { recordRequests, TESTING_USER } from '$lib/test-support/testing-routes';
import ProjectsPage from './+page.svelte';

const alpha = { id: 1, name: 'Alpha', created_at: '2026-11-01T00:00:00' };
const beta = { id: 2, name: 'Beta', created_at: '2026-11-02T00:00:00' };

const ROLES: [string, AuthUser][] = [
	['admin', { id: 1, username: 'admin1', email: null, role: 'admin', is_active: true }],
	['operator', { id: 2, username: 'op', email: null, role: 'operator', is_active: true }],
	['reviewer', { id: 3, username: 'rev', email: null, role: 'reviewer', is_active: true }],
	['testing', TESTING_USER]
];

beforeEach(() => {
	locale.set('en');
	resetUnit();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

function rowText(container: Element, name: string): string {
	const row = [...container.querySelectorAll('tbody tr')].find((r) =>
		r.textContent?.includes(name)
	);
	return row?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('project list, no Status column', () => {
	for (const [label, user] of ROLES) {
		it(`${label}: no Status header and no status badge`, async () => {
			authStore.setSession(user);
			recordRequests({ 'GET /projects/': [alpha, beta] });
			const screen = render(ProjectsPage);
			await expect.element(page.getByText('Alpha')).toBeVisible();
			const heads = [...screen.container.querySelectorAll('th')].map((t) => t.textContent?.trim());
			expect(heads).not.toContain(en.common_status);
			expect(screen.container.querySelector('.status-badge')).toBeNull();
		});

		it(`${label}: a row's text does not change when the order changes`, async () => {
			authStore.setSession(user);
			recordRequests({ 'GET /projects/': [alpha, beta] });
			const first = render(ProjectsPage);
			await expect.element(page.getByText('Alpha')).toBeVisible();
			const a1 = rowText(first.container, 'Alpha');
			const b1 = rowText(first.container, 'Beta');
			first.unmount();

			recordRequests({ 'GET /projects/': [beta, alpha] });
			const second = render(ProjectsPage);
			await expect.element(page.getByText('Alpha')).toBeVisible();
			expect(rowText(second.container, 'Alpha')).toBe(a1);
			expect(rowText(second.container, 'Beta')).toBe(b1);
		});
	}
});

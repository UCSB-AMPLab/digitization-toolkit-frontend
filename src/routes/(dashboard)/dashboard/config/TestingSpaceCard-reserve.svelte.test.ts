// Settings → Testing (NEH-391): the free space kept for real work and the
// clearing of the testing space, on the administrator's card. Every request
// is recorded; the backend's text is never shown.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import TestingSpaceCard from './TestingSpaceCard.svelte';

type Call = { method: string; path: string; body: unknown };
let calls: Call[];
let state: { [k: string]: unknown };
let answers: { [route: string]: () => Response };

const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function serve() {
	calls = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost:8000').pathname;
		const method = (init?.method ?? 'GET').toUpperCase();
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ method, path, body });
		const answer = answers[`${method} ${path}`];
		if (answer) return answer();
		if (method === 'GET' && path === '/system/testing') return json(state);
		if (method === 'PUT' && path === '/system/testing') {
			state = { ...state, ...(body as object) };
			return json(state);
		}
		return json({ detail: 'unexpected' }, 500);
	});
}

beforeEach(() => {
	locale.set('en');
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	state = {
		enabled: true,
		username: 'unit-testing',
		account_active: true,
		expiry_days: 30,
		projects: 2,
		volumes: 5,
		reserve_gb: 20,
		free_gb: 41.5
	};
	answers = {};
	serve();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

const reserveInput = () => page.getByLabelText(en.testing_reserve_label);

describe('the reserve kept for real work', () => {
	it('shows the reserve and the free space, and saves the reserve alone', async () => {
		render(TestingSpaceCard);
		await expect.element(reserveInput()).toHaveValue('20');
		await expect.element(page.getByText(en.testing_reserve_free('41.5'))).toBeVisible();
		await userEvent.fill(reserveInput(), '35');
		await page.getByRole('button', { name: en.testing_reserve_save }).click();
		await expect.poll(() => calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
		expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ enabled: true, reserve_gb: 35 });
		await expect.element(page.getByText(en.testing_saved)).toBeVisible();
	});

	it('says when the free space cannot be read', async () => {
		state = { ...state, free_gb: null };
		render(TestingSpaceCard);
		await expect.element(page.getByText(en.testing_reserve_free_unknown)).toBeVisible();
	});

	for (const bad of ['0', '10001', '2.5', 'abc', '']) {
		it(`refuses "${bad}" without a request`, async () => {
			render(TestingSpaceCard);
			await expect.element(reserveInput()).toHaveValue('20');
			await userEvent.fill(reserveInput(), bad);
			await page.getByRole('button', { name: en.testing_reserve_save }).click();
			await expect.element(page.getByText(en.testing_err_reserve_value)).toBeVisible();
			expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
		});
	}

	it('reads the state again after a refusal, and shows the generic line, never the backend text', async () => {
		answers['PUT /system/testing'] = () => json({ detail: 'BACKEND-TEXT' }, 422);
		const screen = render(TestingSpaceCard);
		await expect.element(reserveInput()).toHaveValue('20');
		await userEvent.fill(reserveInput(), '35');
		await page.getByRole('button', { name: en.testing_reserve_save }).click();
		await expect.element(page.getByText(en.testing_err_generic)).toBeVisible();
		expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
		expect(screen.container.textContent).not.toContain('BACKEND-TEXT');
	});
});

describe('clearing the testing space', () => {
	it('asks first, says what it does, and Cancel sends nothing', async () => {
		render(TestingSpaceCard);
		await page.getByRole('button', { name: en.testing_clear }).click();
		await expect.element(page.getByText(en.testing_clear_confirm_text)).toBeVisible();
		await expect.element(page.getByRole('button', { name: en.common_cancel })).toHaveFocus();
		await page.getByRole('button', { name: en.common_cancel }).click();
		expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: en.testing_clear })).toHaveFocus();
	});

	it('clears, shows what was removed and what was left, and reads the state again', async () => {
		answers['POST /system/testing/clear'] = () => {
			state = { ...state, projects: 0, volumes: 1 };
			return json({ projects: 2, volumes: 4, skipped: 1 });
		};
		render(TestingSpaceCard);
		await page.getByRole('button', { name: en.testing_clear }).click();
		await page.getByRole('button', { name: en.testing_clear_confirm }).click();
		await expect.element(page.getByText(en.testing_cleared(2, 4))).toBeVisible();
		await expect.element(page.getByText(en.testing_cleared_skipped(1))).toBeVisible();
		await expect.element(page.getByText(en.testing_counts(0, 1))).toBeVisible();
		expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
			'/system/testing/clear'
		]);
	});

	it('says nothing of volumes left when none was skipped', async () => {
		answers['POST /system/testing/clear'] = () => json({ projects: 1, volumes: 1, skipped: 0 });
		const screen = render(TestingSpaceCard);
		await page.getByRole('button', { name: en.testing_clear }).click();
		await page.getByRole('button', { name: en.testing_clear_confirm }).click();
		await expect.element(page.getByText(en.testing_cleared(1, 1))).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.testing_cleared_skipped(0));
	});

	it('shows its own line when the clearing fails, and reads the state again', async () => {
		answers['POST /system/testing/clear'] = () => json({ detail: 'BACKEND-TEXT' }, 500);
		const screen = render(TestingSpaceCard);
		await page.getByRole('button', { name: en.testing_clear }).click();
		await page.getByRole('button', { name: en.testing_clear_confirm }).click();
		await expect.element(page.getByText(en.testing_err_clear)).toBeVisible();
		expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
		expect(screen.container.textContent).not.toContain('BACKEND-TEXT');
	});

	it('shows its own line when the clearing is refused because a purge is running', async () => {
		answers['POST /system/testing/clear'] = () =>
			json({ detail: { code: 'testing_purge_running', message: 'BACKEND-TEXT' } }, 409);
		const screen = render(TestingSpaceCard);
		await page.getByRole('button', { name: en.testing_clear }).click();
		await page.getByRole('button', { name: en.testing_clear_confirm }).click();
		await expect.element(page.getByText(en.testing_err_purge_running)).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.testing_err_clear);
		expect(screen.container.textContent).not.toContain('BACKEND-TEXT');
	});

	it('keeps the generic line for a 409 with another code', async () => {
		answers['POST /system/testing/clear'] = () =>
			json({ detail: { code: 'other', message: 'x' } }, 409);
		render(TestingSpaceCard);
		await page.getByRole('button', { name: en.testing_clear }).click();
		await page.getByRole('button', { name: en.testing_clear_confirm }).click();
		await expect.element(page.getByText(en.testing_err_clear)).toBeVisible();
	});
});

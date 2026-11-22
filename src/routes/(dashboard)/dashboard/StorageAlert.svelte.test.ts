// The overview's low-storage banner (NEH-290), from the GET /system/storage
// answer; fixtures are shaped as get_storage_info in app/api/system.py.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import StorageAlert from './StorageAlert.svelte';

const GIB = 1024 ** 3;

function storage(usedGB: number, totalGB: number, available = true) {
	return {
		projects_path: '/data/projects',
		is_override: false,
		override_invalid: false,
		total_bytes: available ? totalGB * GIB : 0,
		used_bytes: available ? usedGB * GIB : 0,
		free_bytes: available ? (totalGB - usedGB) * GIB : 0,
		available,
		unavailable_reason: available ? null : 'The storage path for projects cannot be read.'
	};
}

function respond(...bodies: Array<{ status: number; body: unknown }>) {
	const spy = vi.spyOn(globalThis, 'fetch');
	for (const { status, body } of bodies) {
		spy.mockImplementationOnce(
			async () =>
				new Response(JSON.stringify(body), {
					status,
					headers: { 'Content-Type': 'application/json' }
				})
		);
	}
	return spy;
}

const banner = (container: HTMLElement) => container.querySelector('.storage-alert-banner');

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('dashboard storage banner', () => {
	it('appears at 85% with the figures the unit reported', async () => {
		const fetchSpy = respond({ status: 200, body: storage(51, 60) });
		const { container } = render(StorageAlert);
		await expect.poll(() => banner(container)).not.toBeNull();
		expect(banner(container)!.textContent).toContain('85%');
		expect(banner(container)!.textContent).toContain('51 GB');
		expect(banner(container)!.textContent).toContain('60 GB');
		expect(String(fetchSpy.mock.calls[0][0])).toContain('/system/storage');
	});

	it('stays hidden below 85%', async () => {
		const fetchSpy = respond({ status: 200, body: storage(50, 60) });
		const { container } = render(StorageAlert);
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
		await new Promise((r) => setTimeout(r, 50));
		expect(banner(container)).toBeNull();
	});

	it('stays hidden when the request fails', async () => {
		const fetchSpy = respond({ status: 500, body: { detail: 'boom' } });
		const { container } = render(StorageAlert);
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
		await new Promise((r) => setTimeout(r, 50));
		expect(banner(container)).toBeNull();
	});

	it('stays hidden when the backend marks the storage root unavailable', async () => {
		const fetchSpy = respond({ status: 200, body: storage(0, 0, false) });
		const { container } = render(StorageAlert);
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
		await new Promise((r) => setTimeout(r, 50));
		expect(banner(container)).toBeNull();
	});

	it('reads again when the page becomes visible, and drops the banner if that read fails', async () => {
		const fetchSpy = respond(
			{ status: 200, body: storage(57, 60) },
			{ status: 503, body: { detail: 'down' } }
		);
		const { container } = render(StorageAlert);
		await expect.poll(() => banner(container)).not.toBeNull();

		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(2);
		await expect.poll(() => banner(container)).toBeNull();
	});
});

describe('dashboard storage banner: the Settings link (NEH-253, NEH-380)', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`links the ${role} to Settings > Storage to free space there`, async () => {
			locale.set('en');
			authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
			respond({ status: 200, body: storage(51, 60) });
			const { container } = render(StorageAlert);
			await expect.poll(() => banner(container)).not.toBeNull();
			const link = banner(container)!.querySelector('a');
			expect(link?.getAttribute('href')).toBe('/dashboard/config?section=storage');
			expect(link?.textContent).toBe(en.nav_settings);
			expect(banner(container)!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
				`${en.dash_storage_alert_p1}85%${en.dash_storage_alert_p2('51 GB', '60 GB')}${en.nav_settings}${en.dash_storage_alert_p3}`
			);
		});
	}

	it('tells the reviewer to ask an administrator or an operator, with no Settings text or link', async () => {
		locale.set('en');
		authStore.setSession({
			id: 2,
			username: 'reviewer',
			email: null,
			role: 'reviewer',
			is_active: true
		});
		respond({ status: 200, body: storage(51, 60) });
		const { container } = render(StorageAlert);
		await expect.poll(() => banner(container)).not.toBeNull();
		expect(banner(container)!.querySelector('a')).toBeNull();
		expect(banner(container)!.textContent).not.toContain(en.nav_settings);
		expect(en.dash_storage_alert_ask_admin('51 GB', '60 GB')).toContain(
			'an administrator or an operator'
		);
		expect(banner(container)!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			`${en.dash_storage_alert_p1}85%${en.dash_storage_alert_ask_admin('51 GB', '60 GB')}`
		);
	});

	it('counts the storage reserve in the percentage', async () => {
		locale.set('en');
		authStore.setSession({
			id: 1,
			username: 'admin1',
			email: null,
			role: 'admin',
			is_active: true
		});
		// 49 of 60 GiB used is 82%; with 2 GB kept back it is 85%.
		respond({ status: 200, body: { ...storage(49, 60), reserve_bytes: 2 * 10 ** 9 } });
		const { container } = render(StorageAlert);
		await expect.poll(() => banner(container)).not.toBeNull();
		expect(banner(container)!.textContent).toContain('85%');
		expect(banner(container)!.textContent).toContain('49 GB');
	});
});

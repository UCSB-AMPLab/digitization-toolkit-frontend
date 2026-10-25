// Configuración → Copia externa: the Fisqua row, from `fisqua` on the same
// GET /system/catalogue-backup answer the card already polls. Fixtures are
// shaped as unit_fisqua_summary in app/core/fisqua_outbox.py.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { es } from '$lib/i18n/es';
import Card from '../../routes/(dashboard)/dashboard/config/CatalogueBackupCard.svelte';

const NOW = new Date('2026-10-24T17:00:00Z');

function body(fisqua: unknown) {
	return { enabled: true, last_verified_at: '2026-10-24T15:00:00Z', object: null, detail: null, ...(fisqua === undefined ? {} : { fisqua }) };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

function answer(b: unknown) {
	fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function row(b: unknown) {
	answer(b);
	const screen = render(Card);
	await expect.poll(() => screen.container.querySelector('.state')).not.toBeNull();
	return { screen, el: screen.container.querySelector('[data-fisqua-unit]') as HTMLElement | null };
}

describe('Configuración Fisqua row', () => {
	it('is absent for a backend that sends no Fisqua summary', async () => {
		const { el } = await row(body(undefined));
		expect(el).toBeNull();
	});

	it('says Fisqua is not configured', async () => {
		const { el } = await row(body({ configured: false, environment: null, config_error: null, last_send: null, last_poll: null }));
		expect(el!.dataset.level).toBe('off');
		expect(el!.textContent).toContain(es.fisqua_unit_off);
	});

	it('shows the environment, the last send and the last poll', async () => {
		const { el } = await row(
			body({
				configured: true,
				environment: 'staging',
				config_error: null,
				last_send: { status: 'done', promoted: 0, not_exportable: 0, delivered: 2, refused: 0, failed: 1, waiting: 0 },
				last_poll: { status: 'done', asked: 3, calls: 1, answered: 3, recovered: 0 }
			})
		);
		expect(el!.dataset.level).toBe('on');
		const text = el!.textContent ?? '';
		expect(text).toContain(es.fisqua_unit_title);
		expect(text).toContain(es.fisqua_unit_env_staging);
		expect(text).toContain(es.fisqua_unit_send_done(2, 0, 1, 0));
		expect(text).toContain(es.fisqua_unit_poll_done(3, 3));
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('warns about the configuration error', async () => {
		const { el } = await row(
			body({
				configured: true,
				environment: 'production',
				config_error: { at: '2026-10-24T09:30:00', status_code: 302, reason: 'redirect', config_fingerprint: 'ab12cd34' },
				last_send: { status: 'config_error', promoted: 0, not_exportable: 0, delivered: 0, refused: 0, failed: 0, waiting: 0 },
				last_poll: { status: 'config_error', asked: 1, calls: 1, answered: 0, recovered: 0 }
			})
		);
		expect(el!.dataset.level).toBe('attention');
		expect(el!.querySelector('.offsite-unit-warning')!.textContent).toContain(es.fisqua_cfg_redirect);
		expect(el!.textContent).toContain(es.fisqua_unit_send_config_error);
	});
});

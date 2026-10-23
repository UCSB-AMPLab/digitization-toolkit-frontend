// NEH-266: what the sidebar indicator and the Configuración card show for each
// answer of GET /system/catalogue-backup, and that a failed request shows
// "could not check", never one of the four levels (NEH-138).
//
// The browser runs in America/Bogota (vite.config.ts). NOW is 12:00 local on
// 22 October 2026. Only Date is faked, so the poll's timers stay real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import Indicator from './CatalogueBackupIndicator.svelte';
import Card from '../../routes/(dashboard)/dashboard/config/CatalogueBackupCard.svelte';

const NOW = new Date('2026-10-22T17:00:00Z');
const HOUR = 60 * 60 * 1000;

type Body = { enabled: boolean; last_verified_at: string | null; object: string | null; detail: string | null };

function body(over: Partial<Body> = {}): Body {
	return { enabled: true, last_verified_at: null, object: null, detail: null, ...over };
}
function ago(ms: number): string {
	return new Date(NOW.getTime() - ms).toISOString();
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

function answer(b: Body) {
	// A fresh Response per call: a body can be read only once.
	fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
}
function fail() {
	fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
		new Response(JSON.stringify({ detail: 'Bad Gateway' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
	);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// [name, body, level, indicator text, card headline]
const cases: [string, Body | 'fail', string, string, string][] = [
	['green, today', body({ last_verified_at: ago(2 * HOUR) }), 'current', 'Catálogo copiado hoy', 'Copia verificada hoy a las 10:00.'],
	// 30 h old: green, but from yesterday, which the design's "hoy" got wrong.
	['green, yesterday', body({ last_verified_at: ago(30 * HOUR) }), 'current', 'Catálogo copiado ayer', 'Copia verificada ayer a las 06:00.'],
	['amber', body({ last_verified_at: ago(48 * HOUR) }), 'late', 'Catálogo sin copia desde el 20 de octubre', 'La última copia verificada es del 20 de octubre.'],
	['red, stale', body({ last_verified_at: ago(96 * HOUR) }), 'overdue', 'Catálogo sin copia desde el 18 de octubre', 'La última copia verificada es del 18 de octubre.'],
	['red, never verified', body(), 'overdue', 'Catálogo sin copia verificada', 'Todavía no se ha verificado ninguna copia.'],
	['grey, not configured', body({ enabled: false }), 'off', 'Copia externa sin configurar', 'La copia externa no está configurada en este equipo.'],
	['request failed', 'fail', 'unknown', 'No se pudo consultar la copia externa', 'No se pudo consultar el estado de la copia externa.']
];

describe('sidebar indicator', () => {
	it.each(cases)('%s', async (_name, b, level, text) => {
		if (b === 'fail') fail();
		else answer(b);
		const screen = render(Indicator, { expanded: true, href: '/dashboard/config#offsite-copy' });

		await expect.element(screen.getByText(text, { exact: true })).toBeVisible();
		expect(screen.container.querySelector('[data-level]')?.getAttribute('data-level')).toBe(level);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/system\/catalogue-backup$/);
	});

	it('shows nothing until the first answer arrives', async () => {
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
		const screen = render(Indicator, { expanded: true, href: null });
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
		expect(screen.container.querySelector('[data-level]')).toBeNull();
	});

	it('links to Configuración only when given an href', async () => {
		answer(body({ last_verified_at: ago(HOUR) }));
		const linked = render(Indicator, { expanded: true, href: '/dashboard/config#offsite-copy' });
		await expect.element(linked.getByRole('link')).toHaveAttribute('href', '/dashboard/config#offsite-copy');
		linked.unmount();

		const plain = render(Indicator, { expanded: true, href: null });
		await expect.element(plain.getByText('Catálogo copiado hoy')).toBeVisible();
		expect(plain.container.querySelector('a')).toBeNull();
	});

	it('keeps the text for screen readers and as a tooltip when collapsed', async () => {
		answer(body({ last_verified_at: ago(48 * HOUR) }));
		const screen = render(Indicator, { expanded: false, href: null });
		const text = 'Catálogo sin copia desde el 20 de octubre';
		await expect.element(screen.getByText(text)).toBeInTheDocument();
		expect(screen.container.querySelector('[data-level]')?.getAttribute('title')).toBe(text);
	});
});

describe('Configuración card', () => {
	it.each(cases)('%s', async (_name, b, level, _text, headline) => {
		if (b === 'fail') fail();
		else answer(b);
		const screen = render(Card);

		await expect.element(screen.getByText(headline, { exact: true })).toBeVisible();
		expect(screen.container.querySelector('[data-level]')?.getAttribute('data-level')).toBe(level);
		// Read-only, and never a claim that the images are copied.
		await expect.element(screen.getByText(/no se puede cambiar desde aquí/)).toBeVisible();
		await expect.element(screen.getByText(/no incluye los archivos de imagen/)).toBeVisible();
		expect(screen.container.querySelector('button, input, select')).toBeNull();
	});

	it('says the appliance retries only on a late or overdue copy', async () => {
		answer(body({ last_verified_at: ago(48 * HOUR) }));
		const late = render(Card);
		await expect.element(late.getByText(/vuelve a intentar la copia/)).toBeVisible();
		late.unmount();

		answer(body({ last_verified_at: ago(HOUR) }));
		const fresh = render(Card);
		await expect.element(fresh.getByText('Copia verificada hoy a las 11:00.')).toBeVisible();
		expect(fresh.container.textContent).not.toMatch(/vuelve a intentar/);
	});

	it('shows the last verified file and its detail', async () => {
		answer(body({ last_verified_at: ago(HOUR), object: 'catalogue-2026-10-22.sql.gz', detail: 'verified at remote:dtk: 1024 bytes gzipped' }));
		const screen = render(Card);
		await expect.element(screen.getByText(/catalogue-2026-10-22\.sql\.gz/)).toBeVisible();
		await expect.element(screen.getByText(/1024 bytes gzipped/)).toBeVisible();
	});

	it('writes "a la" for one o’clock', async () => {
		// 01:30 local on the 22nd is 06:30 UTC.
		answer(body({ last_verified_at: '2026-10-22T06:30:00Z' }));
		const screen = render(Card);
		await expect.element(screen.getByText('Copia verificada hoy a la 01:30.')).toBeVisible();
	});
});

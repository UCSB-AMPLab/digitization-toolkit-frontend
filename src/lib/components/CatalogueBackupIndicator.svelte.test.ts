// NEH-266: what the sidebar indicator and the Configuración card show for each
// answer of GET /system/catalogue-backup, and that a failed request shows
// "could not check", never one of the four levels (NEH-138).
//
// The browser runs in America/Bogota (vite.config.ts). NOW is 12:00 local on
// 22 October 2026. Date and setInterval (the re-classifying clock) are faked;
// setTimeout stays real, so the 5-minute poll never fires during a test and
// the request timeout is tested in catalogue-backup.test.ts instead.
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
	vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
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
	['request failed', 'fail', 'unknown', 'No se pudo consultar el estado de la copia externa', 'No se pudo consultar el estado de la copia externa.']
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

describe('re-classifying as time passes, with no new answer', () => {
	it('turns a held green answer amber once the copy passes 36 h', async () => {
		// 35 h 59 min 30 s old when the answer arrives.
		answer(body({ last_verified_at: ago(36 * HOUR - 30 * 1000) }));
		const screen = render(Indicator, { expanded: true, href: null });
		await expect.element(screen.getByText('Catálogo copiado ayer')).toBeVisible();

		vi.advanceTimersByTime(60 * 1000);
		await expect.element(screen.getByText('Catálogo sin copia desde ayer')).toBeVisible();
		expect(screen.container.querySelector('[data-level]')?.getAttribute('data-level')).toBe('late');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('turns the card amber the same way', async () => {
		answer(body({ last_verified_at: ago(36 * HOUR - 30 * 1000) }));
		const screen = render(Card);
		await expect.element(screen.getByText('Copia verificada ayer a las 00:00.')).toBeVisible();

		vi.advanceTimersByTime(60 * 1000);
		await expect.element(screen.getByText('La última copia verificada es de ayer.')).toBeVisible();
	});

	it('shows unknown once the held answer is older than two poll intervals', async () => {
		answer(body({ last_verified_at: ago(HOUR) }));
		const screen = render(Indicator, { expanded: true, href: null });
		await expect.element(screen.getByText('Catálogo copiado hoy')).toBeVisible();

		vi.advanceTimersByTime(10 * 60 * 1000);
		await expect.element(screen.getByText('Catálogo copiado hoy')).toBeVisible();
		vi.advanceTimersByTime(60 * 1000);
		await expect.element(screen.getByText('No se pudo consultar el estado de la copia externa')).toBeVisible();
		expect(screen.container.querySelector('[data-level]')?.getAttribute('data-level')).toBe('unknown');
	});

	it('passes the request an abort signal', async () => {
		answer(body({ last_verified_at: ago(HOUR) }));
		render(Indicator, { expanded: true, href: null });
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
		expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
	});
});

describe('waking from sleep (wall clock jumps, no timer fires)', () => {
	function wake(event: 'visibilitychange' | 'pageshow') {
		vi.setSystemTime(new Date(NOW.getTime() + 8 * HOUR));
		if (event === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
		else window.dispatchEvent(new Event('pageshow'));
	}

	it.each(['visibilitychange', 'pageshow'] as const)('on %s, shows unknown while the new request is pending', async (event) => {
		let calls = 0;
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			calls++;
			if (calls > 1) return new Promise<Response>(() => {});
			return new Response(JSON.stringify(body({ last_verified_at: ago(HOUR) })), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		const screen = render(Indicator, { expanded: true, href: null });
		await expect.element(screen.getByText('Catálogo copiado hoy')).toBeVisible();

		wake(event);
		await expect.element(screen.getByText('No se pudo consultar el estado de la copia externa')).toBeVisible();
		await expect.poll(() => fetchSpy.mock.calls.length).toBe(2);
	});

	it('shows the fresh answer once the request made at wake returns', async () => {
		let calls = 0;
		fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			calls++;
			// The copy stopped on the night of the 22nd; at wake it is 48 h old.
			const b = calls === 1 ? body({ last_verified_at: ago(HOUR) }) : body({ last_verified_at: ago(40 * HOUR) });
			return new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
		});
		const screen = render(Indicator, { expanded: true, href: null });
		await expect.element(screen.getByText('Catálogo copiado hoy')).toBeVisible();

		wake('visibilitychange');
		await expect.element(screen.getByText('Catálogo sin copia desde el 20 de octubre')).toBeVisible();
		expect(screen.container.querySelector('[data-level]')?.getAttribute('data-level')).toBe('late');
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it('does not ask again on becoming visible when the answer is recent', async () => {
		answer(body({ last_verified_at: ago(HOUR) }));
		const screen = render(Indicator, { expanded: true, href: null });
		await expect.element(screen.getByText('Catálogo copiado hoy')).toBeVisible();

		vi.setSystemTime(new Date(NOW.getTime() + 60 * 1000));
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.element(screen.getByText('Catálogo copiado hoy')).toBeVisible();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
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

	it('shows the last verified file and never the backend detail', async () => {
		answer(body({ last_verified_at: ago(48 * HOUR), object: 'catalogue-2026-10-20.sql.gz', detail: 'verified at remote:dtk: 1024 bytes gzipped' }));
		const screen = render(Card);
		await expect.element(screen.getByText('Archivo de la última copia')).toBeVisible();
		await expect.element(screen.getByText(/catalogue-2026-10-20\.sql\.gz/)).toBeVisible();
		expect(screen.container.textContent).not.toMatch(/1024 bytes gzipped|Detalle/);
	});

	it('writes "a la" for one o’clock', async () => {
		// 01:30 local on the 22nd is 06:30 UTC.
		answer(body({ last_verified_at: '2026-10-22T06:30:00Z' }));
		const screen = render(Card);
		await expect.element(screen.getByText('Copia verificada hoy a la 01:30.')).toBeVisible();
	});
});

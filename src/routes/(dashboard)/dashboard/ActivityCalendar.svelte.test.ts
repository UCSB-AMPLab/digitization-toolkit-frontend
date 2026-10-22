// The dashboard's activity calendar: the client call, the two views, the
// day line, keyboard navigation and the error state.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { activityApi, type DailyActivity } from '$lib/api';
import ActivityCalendar from './ActivityCalendar.svelte';

// 182 days ending Thursday 2026-10-22; the 26 weeks shown start on 2026-04-27.
function series(overrides: { [date: string]: Partial<DailyActivity> } = {}): DailyActivity[] {
	return Array.from({ length: 182 }, (_, i) => {
		const d = new Date(2026, 9, 22 - (181 - i));
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		return { date, captured_images: 0, reviewed_records: 0, ...overrides[date] };
	});
}

describe('activityApi.daily', () => {
	afterEach(() => vi.restoreAllMocks());

	it('requests the window with the browser time zone offset', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
			async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
		);
		await activityApi.daily(182, 300);
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/activity\/daily\?days=182&tz_offset_minutes=300$/);
		await activityApi.daily();
		expect(String(fetchSpy.mock.calls[1][0])).toContain(`tz_offset_minutes=${new Date().getTimezoneOffset()}`);
	});
});

describe('ActivityCalendar', () => {
	let dailySpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		try { localStorage.removeItem('dtk_activity_view'); } catch {}
		dailySpy = vi.spyOn(activityApi, 'daily').mockResolvedValue(
			series({
				'2026-10-22': { captured_images: 212, reviewed_records: 1 },
				'2026-10-21': { captured_images: 1, reviewed_records: 40 }
			})
		);
	});
	afterEach(() => {
		dailySpy.mockRestore();
		try { localStorage.removeItem('dtk_activity_view'); } catch {}
	});

	it('asks for 182 days with the browser offset and shows captures by default, ending today', async () => {
		const screen = render(ActivityCalendar);
		await expect.element(screen.getByText('Imágenes capturadas por día en los últimos seis meses')).toBeVisible();
		expect(dailySpy).toHaveBeenCalledWith(182, new Date().getTimezoneOffset());
		await expect.element(screen.getByText(/^212 imágenes capturadas el 22 de octubre de 2026$/)).toBeVisible();
		await expect.element(screen.getByRole('grid', { name: 'Imágenes capturadas por día' })).toBeVisible();
		await expect.element(screen.getByText('Días con capturas')).toBeVisible();
		await expect.element(screen.getByText('Menos')).toBeVisible();
		await expect.element(screen.getByText('Más')).toBeVisible();
	});

	it('shows the figures for the days shown, formatted for the locale', async () => {
		const screen = render(ActivityCalendar);
		await expect.element(screen.getByText('Imágenes capturadas', { exact: true })).toBeVisible();
		// 2 days with captures, 213 images.
		await expect.element(screen.getByText('213', { exact: true })).toBeVisible();
	});

	it('switches to reviews, with its own subtitle, map name, figures and a singular line', async () => {
		const screen = render(ActivityCalendar);
		await expect.element(screen.getByText('Días con capturas')).toBeVisible();
		await screen.getByRole('button', { name: 'Revisiones' }).click();
		await expect.element(screen.getByText('Registros aprobados o rechazados por día en los últimos seis meses')).toBeVisible();
		await expect.element(screen.getByRole('grid', { name: 'Registros revisados por día' })).toBeVisible();
		await expect.element(screen.getByText('Días con revisiones')).toBeVisible();
		await expect.element(screen.getByText('1 registro revisado el 22 de octubre de 2026')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Revisiones' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(screen.getByRole('button', { name: 'Capturas' })).toHaveAttribute('aria-pressed', 'false');
		expect(localStorage.getItem('dtk_activity_view')).toBe('reviews');
	});

	it('restores the remembered view', async () => {
		localStorage.setItem('dtk_activity_view', 'reviews');
		const screen = render(ActivityCalendar);
		await expect.element(screen.getByText('Días con revisiones')).toBeVisible();
	});

	it('uses the singular for one image and the plural otherwise', async () => {
		const screen = render(ActivityCalendar);
		await screen.getByRole('gridcell', { name: /^1 imagen capturada el 21 de octubre de 2026$/ }).hover();
		await expect.element(screen.getByText('1 imagen capturada el 21 de octubre de 2026', { exact: true }).first()).toBeVisible();
	});

	it('is one tab stop and moves by day and week with the arrow keys, Home and End', async () => {
		const screen = render(ActivityCalendar);
		await expect.element(screen.getByRole('grid')).toBeVisible();
		const cells = Array.from(document.querySelectorAll<HTMLElement>('[role="gridcell"][tabindex]'));
		expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);
		const today = document.querySelector<HTMLElement>('[data-date="2026-10-22"]')!;
		expect(today.tabIndex).toBe(0);

		today.focus();
		await userEvent.keyboard('{ArrowUp}');
		expect(document.activeElement).toBe(document.querySelector('[data-date="2026-10-21"]'));
		await expect.element(screen.getByText('1 imagen capturada el 21 de octubre de 2026', { exact: true }).first()).toBeVisible();
		await userEvent.keyboard('{ArrowLeft}');
		expect(document.activeElement).toBe(document.querySelector('[data-date="2026-10-14"]'));
		await userEvent.keyboard('{ArrowRight}');
		expect(document.activeElement).toBe(document.querySelector('[data-date="2026-10-21"]'));
		await userEvent.keyboard('{ArrowDown}');
		expect(document.activeElement).toBe(today);
		await userEvent.keyboard('{Home}');
		expect(document.activeElement).toBe(document.querySelector('[data-date="2026-04-27"]'));
		await userEvent.keyboard('{End}');
		expect(document.activeElement).toBe(today);
		expect(document.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
	});

	it('reports an error and offers a retry', async () => {
		dailySpy.mockRejectedValueOnce(new Error('boom'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const screen = render(ActivityCalendar);
		await expect.element(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el calendario de actividad.');
		await screen.getByRole('button', { name: 'Reintentar' }).click();
		await expect.element(screen.getByRole('grid')).toBeVisible();
		errSpy.mockRestore();
	});
});

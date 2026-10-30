// The capture instruction band: the list item's notes, labelled with its
// action, in the page flow above the capture screen. Collapsed it shows at
// most two lines and stays under 15% of the screen height, so the preview
// keeps its room on the 800x480 kiosk; "Mostrar todo" opens the whole text and
// "Mostrar menos" closes it. Without an instruction, nothing is drawn.
//
// Version: 0.2.0
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { locale } from '$lib/i18n';
import '../../app.css';
import CaptureInstruction from './CaptureInstruction.svelte';

const LONG = Array.from({ length: 40 }, (_, i) => `${100 + i}r, ${99 + i}v`).join('; ');

describe('CaptureInstruction', () => {
	beforeEach(async () => {
		locale.set('es');
		await page.viewport(800, 480);
	});

	it('shows the notes with the action as their label', async () => {
		const screen = render(CaptureInstruction, { instruction: { notes: '117r, 116v; 193r, 192v', action: 'spot-recapture' } });
		const band = screen.getByRole('note', { name: 'Recaptura puntual' });
		await expect.element(band).toBeVisible();
		await expect.element(band.getByText('117r, 116v; 193r, 192v')).toBeVisible();
		// Short notes need no toggle.
		await expect.element(screen.getByRole('button', { name: 'Mostrar todo' })).not.toBeInTheDocument();
	});

	it('uses a general label when the item has no action, and shows an unknown action as given', async () => {
		const plain = render(CaptureInstruction, { instruction: { notes: 'Todo el tomo', action: null } });
		await expect.element(plain.getByRole('note', { name: 'Instrucción de la lista' })).toBeVisible();
		plain.unmount();

		const odd = render(CaptureInstruction, { instruction: { notes: 'Todo el tomo', action: 'rescan-cover' } });
		await expect.element(odd.getByRole('note', { name: 'rescan-cover' })).toBeVisible();
	});

	it('shows an action alone when the item has no notes', async () => {
		const screen = render(CaptureInstruction, { instruction: { notes: null, action: 'full-rescan' } });
		const band = screen.getByRole('note', { name: 'Reescaneo completo' });
		await expect.element(band).toBeVisible();
		expect(band.element().querySelector('.ci-notes')).toBeNull();
	});

	it('collapsed, keeps long notes to two lines and under 15vh, with Mostrar todo to open them', async () => {
		const screen = render(CaptureInstruction, { instruction: { notes: LONG, action: 'spot-recapture' } });
		const band = screen.getByRole('note').element() as HTMLElement;
		const toggle = screen.getByRole('button', { name: 'Mostrar todo' });
		await expect.element(toggle).toBeVisible();
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');

		expect(band.getBoundingClientRect().height).toBeLessThanOrEqual(480 * 0.15 + 1);
		const notes = screen.getByText(LONG).element() as HTMLElement;
		const lineHeight = parseFloat(getComputedStyle(notes).lineHeight);
		expect(notes.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight * 2 + 1);
		expect(getComputedStyle(notes).whiteSpace).not.toBe('nowrap');

		await toggle.click();
		const close = screen.getByRole('button', { name: 'Mostrar menos' });
		await expect.element(close).toHaveAttribute('aria-expanded', 'true');
		expect(notes.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 2 + 1);

		await close.click();
		await expect.element(screen.getByRole('button', { name: 'Mostrar todo' })).toBeVisible();
		expect(band.getBoundingClientRect().height).toBeLessThanOrEqual(480 * 0.15 + 1);
	});

	it('is in the page flow, not laid over what follows', async () => {
		const screen = render(CaptureInstruction, { instruction: { notes: LONG, action: null } });
		const band = screen.getByRole('note').element() as HTMLElement;
		expect(['static', 'relative']).toContain(getComputedStyle(band).position);
		expect(getComputedStyle(band).flexShrink).toBe('0');
	});

	it('renders nothing without an instruction', async () => {
		const screen = render(CaptureInstruction, { instruction: null });
		expect(screen.container.querySelector('[role="note"]')).toBeNull();
	});
});

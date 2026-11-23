// NEH-186: the banner's Reload stays reachable by keyboard while a dialog
// with a focus trap is open (lib/dialog.ts, trapFocus): with "Which camera
// is this?", the camera check or the Refocus dialog open and the banner
// showing, Tab reaches Reload and Enter presses it. With no banner, Tab
// goes round the dialog's own controls exactly as it did before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { Component } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { unitNotAnswering } from '$lib/unit-watch';
import UnitNotAnswering from '$lib/components/UnitNotAnswering.svelte';
import '../../app.css';
import WhichCamera from './WhichCamera.svelte';
import CameraCheck from './CameraCheck.svelte';
import RefocusModal from './RefocusModal.svelte';

const DIALOGS: [string, Component<any>, Record<string, unknown>][] = [
	[
		'Which camera is this?',
		WhichCamera,
		{
			setup: { needs_setup: true, reasons: [], confirmed_pair: null },
			cancellable: false,
			rotateDeg: { 0: 0, 1: 0 },
			onSaved: vi.fn(),
			onCancel: vi.fn(),
			onReread: vi.fn(async () => {}),
			onRotateDegChange: vi.fn(),
			onLeave: vi.fn(),
			onDevices: vi.fn()
		}
	],
	[
		'the camera check',
		CameraCheck,
		{
			leftIndex: 0,
			rotateDeg: { 0: 0, 1: 0 },
			onClose: vi.fn(),
			onRefocusClosed: vi.fn(),
			onRotateDegChange: vi.fn()
		}
	],
	['the Refocus dialog', RefocusModal, { leftIndex: 0, onClose: vi.fn() }]
];

beforeEach(() => {
	locale.set('en');
	vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
});
afterEach(() => {
	unitNotAnswering.set(false);
	vi.restoreAllMocks();
	document.querySelectorAll('[role="dialog"]').forEach((n) => n.remove());
});

const FOCUSABLE =
	'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

async function openDialog(component: Component<any>, props: Record<string, unknown>) {
	render(component, props);
	await expect.element(page.getByRole('dialog')).toBeVisible();
	const dialog = document.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement;
	// The trap puts the focus on the first control once one is enabled.
	await expect.poll(() => dialog.querySelectorAll(FOCUSABLE).length).toBeGreaterThan(0);
	return dialog;
}

async function tabs(n: number, shift = false): Promise<(Element | null)[]> {
	const seen: (Element | null)[] = [];
	for (let i = 0; i < n; i++) {
		await userEvent.keyboard(shift ? '{Shift>}{Tab}{/Shift}' : '{Tab}');
		seen.push(document.activeElement);
	}
	return seen;
}

describe('the banner and the focus trap', () => {
	for (const [name, component, props] of DIALOGS) {
		it(`Tab reaches Reload with ${name} open, and Enter presses it`, async () => {
			const onReload = vi.fn();
			unitNotAnswering.set(true);
			render(UnitNotAnswering, { props: { onReload } });
			const reload = page.getByRole('button', { name: en.unit_not_answering_reload });
			await expect.element(reload).toBeVisible();
			const dialog = await openDialog(component, props);
			const stops = dialog.querySelectorAll(FOCUSABLE).length;
			const seen = await tabs(stops + 2);
			expect(seen).toContain(reload.element());
			while (document.activeElement !== reload.element()) await userEvent.keyboard('{Tab}');
			await userEvent.keyboard('{Enter}');
			expect(onReload).toHaveBeenCalledTimes(1);
			// From Reload, Tab goes back into the dialog.
			await userEvent.keyboard('{Tab}');
			expect(dialog.contains(document.activeElement)).toBe(true);
		});

		it(`with no banner, Tab goes round ${name}'s own controls only`, async () => {
			const dialog = await openDialog(component, props);
			const seen = await tabs(12);
			expect(seen.every((el) => dialog.contains(el))).toBe(true);
			const back = await tabs(12, true);
			expect(back.every((el) => dialog.contains(el))).toBe(true);
		});
	}
});

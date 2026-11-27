// Settings > Capture key (NEH-336), for administrators and operators: the
// unit's key, assigned by pressing the key or pedal once, or the default
// (the space bar and b). Each change is PUT /system/unit/capture-key; the
// key is the unit's, for every browser.
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import { clearChord } from '$lib/capture-key';
import { captureChords } from '$lib/capture-key-unit';
import { get } from 'svelte/store';
import { dismissible } from '$lib/dialog';
import '../../../../app.css';
import CaptureKeySection from './CaptureKeySection.svelte';

const UNIT = {
	mode: 'offline',
	projectsEnabled: true,
	projectsShown: true,
	defaultProjectId: null,
	prerequisites: { backup: [], fisqua: [] }
};

let unitKey: unknown;
let puts: unknown[];
let failPut: boolean;
// PUTs of this key wait for the gate.
let heldKey: string | null;
let putGate: Promise<void> | null;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

beforeEach(() => {
	locale.set('en');
	resetUnit();
	clearChord();
	unitKey = null;
	puts = [];
	failPut = false;
	heldKey = null;
	putGate = null;
	authStore.setSession({ id: 2, username: 'op', email: null, role: 'operator', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		if (url.pathname === '/system/unit/capture-key') {
			const body = JSON.parse(init!.body as string);
			puts.push(body);
			if (failPut) return json({ detail: 'x' }, 500);
			unitKey = body.capture_key;
			// The answer is what the backend held when it answered this request.
			const answer = { ...UNIT, captureKey: body.capture_key };
			if (body.capture_key?.key === heldKey && putGate) await putGate;
			return json(answer);
		}
		if (url.pathname.startsWith('/system/unit')) return json({ ...UNIT, captureKey: unitKey });
		return json({});
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	clearChord();
});

const DEFAULTS = () => en.lv_capture_key_current(`${en.lv_capture_key_space} / b`);
const assign = () => page.getByRole('button', { name: en.lv_capture_key_learn });

describe('Settings > Capture key', () => {
	it('shows the default keys while the unit has none', async () => {
		render(CaptureKeySection);
		await expect.element(page.getByText(DEFAULTS())).toBeVisible();
		await expect.element(page.getByText(en.lv_capture_key_desc)).toBeVisible();
	});

	it("shows the unit's key", async () => {
		unitKey = { key: 'F7', ctrl: false, alt: false, meta: false, shift: false };
		render(CaptureKeySection);
		await expect.element(page.getByText(en.lv_capture_key_current('F7'))).toBeVisible();
	});

	it('assigns the next key pressed to the unit', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		await expect.element(page.getByText(en.lv_capture_key_learning)).toBeVisible();
		const press = new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', cancelable: true });
		window.dispatchEvent(press);
		expect(press.defaultPrevented).toBe(true);
		await expect.element(page.getByText(en.lv_capture_key_current('x'))).toBeVisible();
		expect(puts).toEqual([
			{ capture_key: { key: 'x', ctrl: false, alt: false, meta: false, shift: false } }
		]);
		expect(document.body.textContent).not.toContain(en.lv_capture_key_learning);
	});

	it('says so for a device that sends only a modifier, and keeps waiting', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', cancelable: true }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
		await expect.element(page.getByText(en.lv_capture_key_modifier_only('Shift'))).toBeVisible();
		expect(puts).toEqual([]);
	});

	it('Cancel stops waiting, and a key pressed afterwards assigns nothing', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		await userEvent.click(page.getByRole('button', { name: en.common_cancel }));
		const press = new KeyboardEvent('keydown', { key: 'x', cancelable: true });
		window.dispatchEvent(press);
		expect(press.defaultPrevented).toBe(false);
		await expect.element(assign()).toBeVisible();
		expect(puts).toEqual([]);
	});

	it('Use the default clears the unit’s key', async () => {
		unitKey = { key: 'F7', ctrl: false, alt: false, meta: false, shift: false };
		render(CaptureKeySection);
		await expect.element(page.getByText(en.lv_capture_key_current('F7'))).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: en.lv_capture_key_reset }));
		await expect.element(page.getByText(DEFAULTS())).toBeVisible();
		expect(puts).toEqual([{ capture_key: null }]);
	});

	it('says so when the key cannot be saved, and keeps the one before', async () => {
		failPut = true;
		render(CaptureKeySection);
		await userEvent.click(assign());
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', cancelable: true }));
		await expect.element(page.getByText(en.config_capture_key_error)).toBeVisible();
		await expect.element(page.getByText(DEFAULTS())).toBeVisible();
	});

	// Review round 1: the assignment takes only keys meant for it.
	it('cancels when another dialog opens, and leaves typing in its password field alone', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		await expect.element(page.getByText(en.lv_capture_key_learning)).toBeVisible();
		// A dialog opened from the account menu, with a password field.
		const dialog = document.createElement('div');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.innerHTML = '<label>Current password <input type="password" id="pw" /></label>';
		document.body.appendChild(dialog);
		const registration = dismissible(dialog, { onDismiss: () => {} });
		await expect.element(assign()).toBeVisible();
		expect(document.body.textContent).not.toContain(en.lv_capture_key_learning);
		const field = page.getByLabelText('Current password');
		await userEvent.click(field);
		await userEvent.keyboard('abc');
		await expect.element(field).toHaveValue('abc');
		expect(puts).toEqual([]);
		registration?.destroy?.();
		dialog.remove();
	});

	it('ignores a key typed into a text field on the page while it waits', async () => {
		const input = document.createElement('input');
		input.type = 'text';
		document.body.appendChild(input);
		render(CaptureKeySection);
		await userEvent.click(assign());
		const typed = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true });
		input.dispatchEvent(typed);
		expect(typed.defaultPrevented).toBe(false);
		await expect.element(page.getByText(en.lv_capture_key_learning)).toBeVisible();
		expect(puts).toEqual([]);
		input.remove();
	});

	it('Escape cancels, and Tab is neither taken nor assigned', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		document.body.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(false);
		await expect.element(page.getByText(en.lv_capture_key_learning)).toBeVisible();
		const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		document.body.dispatchEvent(escape);
		await expect.element(assign()).toBeVisible();
		expect(document.body.textContent).not.toContain(en.lv_capture_key_learning);
		expect(puts).toEqual([]);
	});

	it('takes a pedal press with the focus on the page body', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		(document.activeElement as HTMLElement | null)?.blur();
		const press = new KeyboardEvent('keydown', {
			key: 'F9',
			code: 'F9',
			bubbles: true,
			cancelable: true
		});
		document.body.dispatchEvent(press);
		expect(press.defaultPrevented).toBe(true);
		await expect.element(page.getByText(en.lv_capture_key_current('F9'))).toBeVisible();
		expect(puts).toEqual([
			{ capture_key: { key: 'F9', ctrl: false, alt: false, meta: false, shift: false } }
		]);
	});

	it('cancels when the page is hidden', async () => {
		render(CaptureKeySection);
		await userEvent.click(assign());
		const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.element(assign()).toBeVisible();
		hidden.mockRestore();
	});

	it("a save's late answer, after the section was left and opened again for a newer save, does not put the older key back", async () => {
		heldKey = 'F7';
		let release!: () => void;
		putGate = new Promise<void>((resolve) => (release = resolve));
		onTestFinished(() => release());
		const first = render(CaptureKeySection);
		await userEvent.click(assign());
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7', code: 'F7', cancelable: true }));
		await expect.poll(() => puts.length).toBe(1);
		first.unmount();
		render(CaptureKeySection);
		await userEvent.click(assign());
		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', cancelable: true })
		);
		// The reopened section's read and the save of x wait behind F7's save.
		expect(puts).toHaveLength(1);
		putGate = null;
		release();
		await expect.poll(() => puts.length).toBe(2);
		await expect.element(page.getByText(en.lv_capture_key_current('x'))).toBeVisible();
		expect(get(captureChords)).toEqual([
			{ key: 'x', ctrl: false, alt: false, meta: false, shift: false }
		]);
	});

	for (const [w, h] of [
		[800, 480],
		[1280, 800]
	] as const) {
		it(`fits ${w} wide while waiting for a key, every button at least 44px tall`, async () => {
			await page.viewport(w, h);
			const target = document.createElement('div');
			target.style.cssText = `width: ${w >= 1000 ? w - 300 : w - 64}px;`;
			document.body.appendChild(target);
			render(CaptureKeySection, { target });
			await userEvent.click(assign());
			await expect.element(page.getByText(en.lv_capture_key_learning)).toBeVisible();
			for (const b of target.querySelectorAll('button')) {
				const r = b.getBoundingClientRect();
				expect(r.height).toBeGreaterThanOrEqual(44);
				expect(r.right).toBeLessThanOrEqual(target.getBoundingClientRect().right + 1);
			}
			expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth + 1);
			target.remove();
			await page.viewport(414, 896);
		});
	}
});

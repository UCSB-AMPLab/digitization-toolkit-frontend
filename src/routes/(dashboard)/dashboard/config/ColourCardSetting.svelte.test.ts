// NEH-340: Settings > Cameras, "Ask for colour card shots". One row with a
// switch, for the administrator only, below the camera kind card. Turning it
// on or off sends PUT /system/unit {colourCardShots} through the unit's
// serial queue (writeUnit), and the answer becomes the unit's state. A
// failure leaves the switch as the unit has it, with one line saying so.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, systemApi } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { ensureUnit, reloadUnit, resetUnit, unitState } from '$lib/unit-mode';
import { get } from 'svelte/store';
import '../../../../app.css';
import ColourCardSetting from './ColourCardSetting.svelte';

function unit(colourCardShots?: boolean) {
	return {
		mode: 'offline',
		projectsEnabled: true,
		projectsShown: true,
		defaultProjectId: null,
		prerequisites: { backup: [], fisqua: [] },
		...(colourCardShots === undefined ? {} : { colourCardShots })
	};
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

const toggle = () => page.getByRole('switch', { name: en.cc_setting_label });

beforeEach(() => {
	locale.set('en');
	resetUnit();
	signIn('admin');
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Settings > Cameras: Ask for colour card shots', () => {
	it('shows the unit setting, with what it does and how volumes go to Fisqua with it off', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(false) as never);
		render(ColourCardSetting);
		await expect.element(toggle()).not.toBeChecked();
		await expect.element(toggle()).toBeEnabled();
		await expect.element(page.getByText(en.cc_setting_desc)).toBeVisible();
	});

	it('turns it on through PUT /system/unit, and the answer becomes the state', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(false) as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit(true) as never);
		render(ColourCardSetting);
		await expect.element(toggle()).toBeEnabled();
		await userEvent.click(toggle());
		await expect.element(toggle()).toBeChecked();
		expect(put).toHaveBeenCalledWith({ colourCardShots: true });
		expect(get(unitState)?.colourCardShots).toBe(true);
	});

	it('turns it off again', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(true) as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit(false) as never);
		render(ColourCardSetting);
		await expect.element(toggle()).toBeChecked();
		await userEvent.click(toggle());
		await expect.element(toggle()).not.toBeChecked();
		expect(put).toHaveBeenCalledWith({ colourCardShots: false });
	});

	it('a failure keeps the unit setting on screen and says so', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(false) as never);
		vi.spyOn(systemApi, 'setUnit').mockRejectedValue(new ApiError('x', undefined, 500));
		render(ColourCardSetting);
		await expect.element(toggle()).toBeEnabled();
		await userEvent.click(toggle());
		await expect.element(page.getByText(en.cc_setting_error)).toBeVisible();
		await expect.element(toggle()).not.toBeChecked();
		await expect.element(toggle()).toBeEnabled();
	});

	it('the switch waits while the unit setting is not known (an older backend)', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit() as never);
		render(ColourCardSetting);
		await expect.poll(() => get(unitState)).not.toBeNull();
		await expect.element(toggle()).toBeDisabled();
	});

	it('reads the unit afresh when it mounts, so a change made from another browser shows', async () => {
		vi.spyOn(systemApi, 'unit')
			.mockResolvedValueOnce(unit(false) as never)
			.mockResolvedValue(unit(true) as never);
		await ensureUnit();
		expect(get(unitState)?.colourCardShots).toBe(false);
		render(ColourCardSetting);
		await expect.element(toggle()).toBeChecked();
	});

	it('sends the value chosen at the click, even when a read answered in between changes the state', async () => {
		let release!: () => void;
		const held = new Promise<void>((r) => (release = r));
		let reads = 0;
		vi.spyOn(systemApi, 'unit').mockImplementation(async () => {
			reads += 1;
			if (reads === 1) return unit(false) as never;
			await held;
			return unit(true) as never;
		});
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit(true) as never);
		render(ColourCardSetting);
		await expect.element(toggle()).toBeEnabled();
		await expect.element(toggle()).not.toBeChecked();
		// A read queued before the click, answered after it.
		void reloadUnit();
		await expect.poll(() => reads).toBe(2);
		await userEvent.click(toggle());
		release();
		await expect.poll(() => put.mock.calls.length).toBe(1);
		expect(put).toHaveBeenCalledWith({ colourCardShots: true });
	});

	it('in Spanish', async () => {
		locale.set('es');
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(true) as never);
		render(ColourCardSetting);
		await expect.element(page.getByRole('switch', { name: es.cc_setting_label })).toBeChecked();
	});

	for (const role of ['operator', 'reviewer'] as UserRole[]) {
		it(`is not shown to ${role}`, async () => {
			signIn(role);
			const read = vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(true) as never);
			const { container } = render(ColourCardSetting);
			// The section mounted and read nothing for the row.
			await expect.poll(() => container.isConnected).toBe(true);
			expect(container.querySelector('[role="switch"]')).toBeNull();
			expect(container.textContent).not.toContain(en.cc_setting_label);
			expect(read).not.toHaveBeenCalled();
		});
	}
});

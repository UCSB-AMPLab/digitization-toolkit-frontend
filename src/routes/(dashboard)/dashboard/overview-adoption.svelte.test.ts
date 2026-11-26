// NEH-420 on the rebuilt Overview (NEH-350): the notice for a move of
// captures the unit could not settle is one of the "Needs attention"
// notices, in the error tone, right above the storage notice; with it the
// block shows its title. Operators get no notice and no request.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import { resetCameraKind } from '$lib/camera-kind';
import { systemApi, type UnfinishedAdoptionReport } from '$lib/api';
import '../../../app.css';
import Overview from './+page.svelte';
import { hideProjects, serveOverview, signIn } from './overview-fixtures';

const REPORT: UnfinishedAdoptionReport = {
	unfinished: {
		source: { id: 7, name: 'Volumen de origen', filename_stem: 'src' },
		target: { id: 8, name: 'Volumen de destino', filename_stem: 'tgt' },
		state: 'blocked',
		reason: 'file_at_neither_path',
		missing: [],
		repair_available: false,
		repair_refusal: 'no_read_remote'
	}
};

const attention = () => document.querySelector<HTMLElement>('[data-attention]');
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

beforeEach(async () => {
	localStorage.clear();
	locale.set('es');
	await hideProjects();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	resetCameraKind();
});

describe('Overview: the move of captures left unsettled', () => {
	it('admin: a red notice of the attention block, above the storage notice, and the block title shows', async () => {
		signIn('admin');
		serveOverview('notices');
		vi.spyOn(systemApi, 'getUnfinishedAdoption').mockResolvedValue(REPORT);
		render(Overview);
		const ours = () =>
			[...document.querySelectorAll<HTMLElement>('[data-attention-notice]')].find((n) =>
				text(n).includes(es.unsettled_heading)
			);
		await expect.poll(ours).toBeTruthy();
		const notice = ours()!;
		expect(attention()!.contains(notice)).toBe(true);
		expect(notice.classList.contains('tone-error')).toBe(true);
		expect(attention()!.offsetParent).not.toBeNull();
		expect(text(attention()!.querySelector('h2'))).toBe(es.dash_attention_title);
		// Right above the storage notice.
		const all = [...attention()!.querySelectorAll<HTMLElement>('[data-attention-notice]')];
		const storageAt = all.findIndex((n) => text(n).includes(es.dash_storage_alert_p1.trim()));
		expect(storageAt).toBeGreaterThan(-1);
		expect(all.indexOf(notice)).toBe(storageAt - 1);
	});

	it('operator: no notice of the move and no request for it', async () => {
		signIn('operator');
		serveOverview('notices');
		const spy = vi.spyOn(systemApi, 'getUnfinishedAdoption');
		render(Overview);
		await expect.poll(() => vi.mocked(systemApi.getStorage).mock.settledResults.length).toBe(1);
		expect(text(document.body)).not.toContain(es.unsettled_heading);
		expect(spy).not.toHaveBeenCalled();
	});
});

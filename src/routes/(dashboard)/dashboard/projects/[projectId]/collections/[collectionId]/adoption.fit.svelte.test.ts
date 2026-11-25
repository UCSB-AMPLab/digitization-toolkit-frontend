// NEH-419 and NEH-420 at the unit's 800x480 screen and at 1280x800, with
// app.css, in both languages: the dialog's longest refusal list (every
// sentence the plan can give) scrolls inside the dialog, never the page,
// and its title and buttons stay on screen; the notice's fullest state
// (three missing files and Repair) fits the width, on the Overview and on a
// volume's page, with a Repair button at least 44px tall.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { collectionsApi, recordsApi, systemApi, type AdoptPlan, type Collection } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../../../../../../app.css';
import VolumeAdoptActions from './VolumeAdoptActions.svelte';
import AdoptionNotice from '$lib/components/AdoptionNotice.svelte';

// Every code of REFUSAL_CODES in app/core/adopt_captures.py: the longest list a plan can give.
const ALL_CODES = [
	'adoption_unfinished',
	'source_not_found',
	'target_not_found',
	'same_volume',
	'source_testing_volume',
	'target_testing_volume',
	'source_has_no_stem',
	'target_has_no_stem',
	'target_not_assigned',
	'target_withdrawn',
	'source_sent_to_fisqua',
	'target_sent_to_fisqua',
	'source_kept_on_unit',
	'target_kept_on_unit',
	'source_has_sub_volumes',
	'source_has_no_images',
	'source_has_open_colour_card_set',
	'target_has_records',
	'target_has_images',
	'target_counter_raised',
	'target_has_colour_card_sets',
	'target_has_offsite_keys',
	'offsite_tenant_not_configured',
	'storage_unavailable',
	'source_outside_storage',
	'target_outside_storage',
	'source_records_handed_over',
	'source_files_freed',
	'source_file_outside_own_folder',
	'source_file_missing',
	'source_not_verified_offsite',
	'source_capture_line_missing',
	'source_manifest_path_unmapped',
	'source_digest_missing',
	'source_preview_digest_missing',
	'source_name_not_contract',
	'source_thumbnail_shared',
	'source_has_unowned_files',
	'new_name_collides'
];

const SOURCE = 'Volumen de prueba de origen, volumen de prueba de origen, prueba 0001';
const TARGET = 'Volumen de prueba de destino 007, asignado prueba';

const box = (el: Element) => el.getBoundingClientRect();

function plan(): AdoptPlan {
	return {
		source_id: 7,
		target_id: 20,
		may_adopt: false,
		refusals: ALL_CODES,
		details: {},
		project_changes: false,
		records: 0,
		images_current: 0,
		images_superseded: 0,
		renames_count: 0,
		renames_truncated: false,
		renames: [],
		colour_card_set_ids: [],
		shot_renames: []
	};
}

const target: Collection = {
	id: 20,
	name: TARGET,
	created_at: '2026-11-01T00:00:00',
	external_id: 'co-007',
	filename_stem: 'volumen-prueba-007',
	queue_hidden_at: null,
	kept_on_unit: false,
	record_count: 0
};

afterEach(() => {
	// A move left unresolved keeps its id in the session (VolumeAdoptActions).
	sessionStorage.clear();
	vi.restoreAllMocks();
	authStore.clearSession();
});

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		describe(`at ${w}x${h}, ${lang}`, () => {
			beforeEach(async () => {
				await browserPage.viewport(w, h);
				locale.set(lang as Locale);
			});

			it('the longest refusal list scrolls inside the dialog, not the page', async () => {
				vi.spyOn(recordsApi, 'count').mockResolvedValue(7);
				vi.spyOn(collectionsApi, 'listAll').mockResolvedValue([target]);
				vi.spyOn(collectionsApi, 'planAdoptInto').mockResolvedValue(plan());
				render(VolumeAdoptActions, {
					collectionId: 7,
					collectionName: SOURCE,
					volume: { external_id: null, kept_on_unit: false, captures_adopted_at: null },
					onAdopted: vi.fn()
				});
				await expect.poll(() => document.querySelector('button.adopt-btn')).not.toBeNull();
				document.querySelector<HTMLButtonElement>('button.adopt-btn')!.click();
				await expect.poll(() => document.querySelector('input[type="radio"]')).not.toBeNull();
				document.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
				const go = () =>
					[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
						(b) => b.textContent?.trim() === msgs.focus_continue
					)!;
				await expect.poll(() => go().disabled).toBe(false);
				go().click();
				await expect
					.poll(() => document.querySelectorAll('.adopt-refusals li').length)
					.toBeGreaterThan(25);

				const card = document.querySelector<HTMLElement>('[role="dialog"]')!;
				const r = box(card);
				expect(r.top).toBeGreaterThanOrEqual(0);
				expect(r.bottom).toBeLessThanOrEqual(h);
				expect(r.right).toBeLessThanOrEqual(w);
				// The card scrolls; the page does not.
				expect(card.scrollHeight).toBeGreaterThan(card.clientHeight);
				expect(getComputedStyle(card).overflowY).toBe('auto');
				expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(h);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
				expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
				// Its title is on screen at the top, and its buttons at the end of the scroll.
				const title = box(card.querySelector('h3')!);
				expect(title.top).toBeGreaterThanOrEqual(r.top);
				card.scrollTop = card.scrollHeight;
				for (const b of card.querySelectorAll('.offsite-dialog-actions button')) {
					const bb = box(b);
					expect(bb.bottom).toBeLessThanOrEqual(r.bottom + 0.5);
					expect(bb.height).toBeGreaterThanOrEqual(44);
				}
			});

			for (const onVolume of [false, true]) {
				it(`the notice fits the width${onVolume ? ' on a volume page' : ' on the Overview'}`, async () => {
					authStore.setSession({
						id: 1,
						username: 'admin',
						email: null,
						role: 'admin',
						is_active: true
					});
					vi.spyOn(systemApi, 'getUnfinishedAdoption').mockResolvedValue({
						unfinished: {
							source: { id: 7, name: SOURCE, filename_stem: 'src' },
							target: { id: 20, name: TARGET, filename_stem: 'volumen-prueba-007' },
							state: 'blocked',
							reason: 'file_at_neither_path',
							missing: [1, 2, 3].map((i) => ({
								kind: 'master',
								name: `volumen-de-prueba-de-origen-largo-img_000${i}_c1.cr2`,
								repairable: true,
								why_not: null,
								needs_storage: true
							})),
							run_id: 'run-fit',
							repair_available: true,
							repair_refusal: null
						}
					});
					const host = document.createElement('div');
					host.style.width = `${w - 32}px`;
					host.style.padding = '0 16px';
					document.body.appendChild(host);
					render(AdoptionNotice, { target: host, props: { onVolume } });
					const notice = () => host.querySelector<HTMLElement>('[data-adoption-notice]');
					await expect.poll(notice).not.toBeNull();
					await expect.poll(() => notice()!.querySelector('button')).not.toBeNull();
					// On the Overview the box is the attention block's notice (AttentionNotice).
					const n = host.querySelector<HTMLElement>('[data-attention-notice]') ?? notice()!;
					expect(n.scrollWidth).toBeLessThanOrEqual(n.clientWidth + 1);
					expect(box(n).right).toBeLessThanOrEqual(w);
					expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
					const button = n.querySelector('button')!;
					expect(box(button).height).toBeGreaterThanOrEqual(44);
					expect(box(button).right).toBeLessThanOrEqual(box(n).right);
					host.remove();
				});
			}
		});
	}
}

// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import { formatBackupDate } from './catalogue-backup';
import { unitOffsiteView, unitUploadState, volumeOffsiteView, type UnitImageUploadSummary, type VolumeOffsiteState } from './offsite-state';

// Noon local time, so "today" and "yesterday" do not depend on the host's zone.
const NOW = new Date(2026, 9, 24, 12, 0, 0);
const TODAY_0905 = new Date(2026, 9, 24, 9, 5, 0).toISOString();
const YESTERDAY_1730 = new Date(2026, 9, 23, 17, 30, 0).toISOString();

function volume(over: Partial<VolumeOffsiteState> = {}): VolumeOffsiteState {
	return {
		collection_id: 7,
		filename_stem: 'co-ahrb-aht-003',
		uploadable: true,
		total: 412,
		verified: 412,
		pending: 0,
		refused: 0,
		last_verified_at: TODAY_0905,
		received: true,
		refusals: [],
		...over
	};
}

function unit(over: Partial<UnitImageUploadSummary> = {}): UnitImageUploadSummary {
	return {
		enabled: true,
		tenant: 'rionegro',
		misconfigured: null,
		volumes: 5,
		volumes_received: 3,
		total: 2000,
		verified: 1800,
		pending: 198,
		refused: 2,
		last_verified_at: YESTERDAY_1730,
		last_run: null,
		...over
	};
}

const loaded = (state: VolumeOffsiteState) => ({ kind: 'loaded' as const, state });

describe('volumeOffsiteView', () => {
	it('is null while no answer has arrived', () => {
		expect(volumeOffsiteView({ kind: 'loading' }, 'on', NOW, 'es', es)).toBeNull();
	});

	it('says a received volume is stored offsite, with the time of the last verification', () => {
		const view = volumeOffsiteView(loaded(volume()), 'on', NOW, 'es', es);
		expect(view).toEqual({
			kind: 'received',
			headline: es.offsite_vol_received(412, 412),
			lastVerified: es.offsite_last_verified('today', formatBackupDate(new Date(TODAY_0905), NOW, 'es'), '09:05'),
			help: null,
			freed: null
		});
	});

	it('says a volume with pending files is uploading, with the counts', () => {
		const state = volume({ verified: 300, pending: 112, received: false });
		const view = volumeOffsiteView(loaded(state), 'on', NOW, 'en', en);
		expect(view?.kind).toBe('uploading');
		expect(view?.headline).toBe(en.offsite_vol_uploading(300, 412, 112));
		expect(view?.help).toBeNull();
	});

	it('shows refused files as needing attention, before any other count', () => {
		const state = volume({ verified: 300, pending: 110, refused: 2, received: false });
		const view = volumeOffsiteView(loaded(state), 'on', NOW, 'es', es);
		expect(view?.kind).toBe('attention');
		expect(view?.headline).toBe(es.offsite_vol_attention(2, 300, 412, 110));
		expect(view?.help).toBe(es.offsite_attention_help);
	});

	it('gives no last verification when no file has been verified', () => {
		const state = volume({ verified: 0, pending: 412, received: false, last_verified_at: null });
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'es', es)?.lastVerified).toBeNull();
	});

	it('reads a naive timestamp as UTC, as the backend sends it', () => {
		const naive = '2026-10-23T22:30:00';
		const state = volume({ last_verified_at: naive });
		const when = new Date(`${naive}Z`);
		const time = when.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'es', es)?.lastVerified).toContain(time);
	});

	it('says when a volume has nothing to store offsite yet', () => {
		const state = volume({ total: 0, verified: 0, received: false, last_verified_at: null });
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'es', es)).toEqual({
			kind: 'empty',
			headline: es.offsite_vol_empty,
			lastVerified: null,
			help: null,
			freed: null
		});
	});

	it('says a volume without a stem is not stored offsite', () => {
		const state = volume({ filename_stem: null, uploadable: false, total: 0, verified: 0, received: false });
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'es', es)?.kind).toBe('no_stem');
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'es', es)?.headline).toBe(es.offsite_vol_no_stem);
	});

	it('says the copy is not configured when the unit has it off', () => {
		const state = volume({ verified: 0, pending: 412, received: false, last_verified_at: null });
		const view = volumeOffsiteView(loaded(state), 'off', NOW, 'es', es);
		expect(view?.kind).toBe('off');
		expect(view?.headline).toBe(es.offsite_vol_off);
	});

	it('says the copy is misconfigured when the unit reports a reason, not that it is off', () => {
		const state = volume({ verified: 0, pending: 412, received: false, last_verified_at: null });
		expect(volumeOffsiteView(loaded(state), 'misconfigured', NOW, 'es', es)).toEqual({
			kind: 'misconfigured',
			headline: es.offsite_vol_misconfigured,
			lastVerified: null,
			help: null,
			freed: null
		});
	});

	it('shows the counts when the unit state is not known', () => {
		expect(volumeOffsiteView(loaded(volume()), null, NOW, 'es', es)?.kind).toBe('received');
	});

	it('says it could not check after a failed request, never a guessed state', () => {
		expect(volumeOffsiteView({ kind: 'failed' }, 'on', NOW, 'es', es)).toEqual({
			kind: 'unknown',
			headline: es.offsite_vol_unknown,
			lastVerified: null,
			help: null,
			freed: null
		});
	});
});

describe('volumeOffsiteView, for a volume freed from the card', () => {
	const freedVolume = (over: Partial<VolumeOffsiteState> = {}) =>
		volume({ freed_files: 412, freed_bytes: 12_300_000_000, ...over });

	it('says a received volume whose files were freed is stored offsite, with the files and bytes freed', () => {
		const view = volumeOffsiteView(loaded(freedVolume()), 'on', NOW, 'en', en);
		expect(view?.kind).toBe('freed');
		expect(view?.headline).toBe(en.offsite_vol_stored);
		expect(view?.freed).toBe(en.offsite_vol_freed(412, 12_300_000_000));
		expect(view?.freed).toBe('412 files freed from the SD card (12.3\u00a0GB)');
		expect(view?.lastVerified).not.toBeNull();
		expect(view?.help).toBeNull();
	});

	it('writes the count and the size as Spanish does', () => {
		const view = volumeOffsiteView(loaded(freedVolume({ freed_files: 12345 })), 'on', NOW, 'es', es);
		expect(view?.freed).toBe('12.345 archivos liberados de la tarjeta (12,3\u00a0GB)');
		expect(es.offsite_vol_freed(1, 2_000_000)).toBe('1 archivo liberado de la tarjeta (2\u00a0MB)');
	});

	it('keeps the counts of a volume with new files to copy, and says what was freed', () => {
		const state = freedVolume({ total: 420, verified: 412, pending: 8, received: false });
		const view = volumeOffsiteView(loaded(state), 'on', NOW, 'es', es);
		expect(view?.kind).toBe('uploading');
		expect(view?.headline).toBe(es.offsite_vol_uploading(412, 420, 8));
		expect(view?.freed).toBe(es.offsite_vol_freed(412, 12_300_000_000));
	});

	it('says what was freed even when the unit has the copy off', () => {
		expect(volumeOffsiteView(loaded(freedVolume()), 'off', NOW, 'es', es)?.freed).toBe(
			es.offsite_vol_freed(412, 12_300_000_000)
		);
	});

	it('has no freed line when nothing was freed, or the backend does not send the counts', () => {
		expect(volumeOffsiteView(loaded(volume({ freed_files: 0, freed_bytes: 0 })), 'on', NOW, 'es', es)?.freed).toBeNull();
		expect(volumeOffsiteView(loaded(volume()), 'on', NOW, 'es', es)?.kind).toBe('received');
	});
});

describe('unitOffsiteView', () => {
	it('is null when the backend sends no image summary', () => {
		expect(unitOffsiteView(undefined, NOW, 'es', es)).toBeNull();
	});

	it('says the image copy is not configured', () => {
		expect(unitOffsiteView(unit({ enabled: false }), NOW, 'es', es)).toEqual({
			level: 'off',
			lines: [es.offsite_unit_off]
		});
	});

	it('says a misconfigured copy needs attention when the backend also reports it disabled', () => {
		// is_enabled() is false for an invalid tenant prefix, while
		// unit_upload_summary() gives the reason (app/core/image_upload.py).
		const view = unitOffsiteView(unit({ enabled: false, misconfigured: 'DTK_OFFSITE_TENANT is invalid' }), NOW, 'es', es);
		expect(view).toEqual({ level: 'attention', lines: [es.offsite_unit_misconfigured] });
	});

	it('says a misconfigured copy needs attention, without the backend text', () => {
		const view = unitOffsiteView(unit({ misconfigured: 'OFFSITE_TENANT is not set' }), NOW, 'es', es);
		expect(view).toEqual({ level: 'attention', lines: [es.offsite_unit_misconfigured] });
	});

	it('says when there is nothing to copy yet', () => {
		const view = unitOffsiteView(unit({ total: 0, verified: 0, pending: 0, refused: 0, volumes_received: 0, last_verified_at: null }), NOW, 'es', es);
		expect(view).toEqual({ level: 'empty', lines: [es.offsite_unit_empty] });
	});

	it('gives volumes, files, refusals and the last verification', () => {
		const view = unitOffsiteView(unit(), NOW, 'es', es);
		expect(view?.level).toBe('attention');
		expect(view?.lines).toEqual([
			es.offsite_unit_volumes(3, 5),
			es.offsite_unit_files(1800, 2000, 198),
			es.offsite_unit_refused(2),
			es.offsite_attention_help,
			es.offsite_cfg_last_verified('yesterday', formatBackupDate(new Date(YESTERDAY_1730), NOW, 'es'), '17:30')
		]);
	});

	it('is received when every file is verified, uploading otherwise', () => {
		const all = unit({ verified: 2000, pending: 0, refused: 0, volumes_received: 5 });
		expect(unitOffsiteView(all, NOW, 'es', es)?.level).toBe('received');
		const some = unit({ refused: 0, pending: 200 });
		expect(unitOffsiteView(some, NOW, 'es', es)?.level).toBe('uploading');
		expect(unitOffsiteView(unit({ refused: 0, last_verified_at: null }), NOW, 'en', en)?.lines.at(-1)).toBe(
			en.offsite_cfg_never
		);
	});
});

describe('counts in the offsite lines', () => {
	it('separate thousands as each language does', () => {
		const state = volume({ total: 12345, verified: 1786, pending: 10559, received: false });
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'es', es)?.headline).toBe(
			'Copia externa en curso: 1786 de 12.345 archivos verificados, 10.559 pendientes'
		);
		expect(volumeOffsiteView(loaded(state), 'on', NOW, 'en', en)?.headline).toBe(
			'Uploading: 1,786 of 12,345 files verified, 10,559 pending'
		);
		expect(es.vol_err_stored_offsite(12345)).toContain('12.345 registros');
		expect(en.vol_err_stored_offsite(1786)).toContain('1,786 records');
		expect(en.offsite_unit_files(1786, 12345, 0)).toBe('1,786 of 12,345 files verified, 0 pending.');
	});
});

describe('unitUploadState', () => {
	it('puts a misconfiguration before the enabled flag', () => {
		expect(unitUploadState(unit({ enabled: false, misconfigured: 'bad prefix' }))).toBe('misconfigured');
		expect(unitUploadState(unit({ enabled: true, misconfigured: 'bad prefix' }))).toBe('misconfigured');
		expect(unitUploadState(unit({ enabled: false }))).toBe('off');
		expect(unitUploadState(unit())).toBe('on');
		expect(unitUploadState(undefined)).toBeNull();
	});
});

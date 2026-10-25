import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import { formatBackupDate, formatBackupTime } from './catalogue-backup';
import { unitFisquaView, volumeFisquaView } from './fisqua-state';
import type { FisquaOutboxEntry, FisquaVolumeStatus, UnitFisquaSummary, VolumeFisquaState } from '$lib/api';

// Noon local time, so "today" does not depend on the host's zone.
const NOW = new Date(2026, 9, 24, 12, 0, 0);
// The backend sends naive UTC (DateTime columns, no zone).
function naiveUtc(d: Date): string {
	return d.toISOString().replace('Z', '').replace(/\.\d{3}$/, '');
}
const TODAY_1405 = new Date(2026, 9, 24, 14, 5, 0);
const TODAY_0930 = new Date(2026, 9, 24, 9, 30, 0);

// Shaped as volume_fisqua_state's rows (_OUTBOX_FIELDS in app/core/fisqua_outbox.py).
function row(over: Partial<FisquaOutboxEntry> = {}): FisquaOutboxEntry {
	return {
		manifest_id: '7f0c1f9e-2b1a-4f3e-9a51-3d1f0a2b9c11',
		stem: 'co-ahrb-aht-003',
		state: 'waiting_for_upload',
		created_at: naiveUtc(TODAY_0930),
		attempts: 0,
		next_attempt_at: null,
		last_attempt_at: null,
		last_error: null,
		refusal: null,
		problems: null,
		response: null,
		external_id: null,
		delivered_at: null,
		...over
	};
}

function status(over: Partial<FisquaVolumeStatus> = {}): FisquaVolumeStatus {
	return {
		status: 'registered',
		status_at: naiveUtc(TODAY_0930),
		status_checked_at: naiveUtc(TODAY_0930),
		problems: null,
		manifest_id: '7f0c1f9e-2b1a-4f3e-9a51-3d1f0a2b9c11',
		...over
	};
}

function fisqua(over: Partial<VolumeFisquaState> = {}): VolumeFisquaState {
	return { environment: 'production', config_error: null, outbox: [], status: null, ...over };
}

const delivered = row({ state: 'delivered', attempts: 1, delivered_at: naiveUtc(TODAY_0930), external_id: 'fq-1' });

describe('volumeFisquaView', () => {
	it('renders nothing when the unit has no Fisqua configured', () => {
		expect(volumeFisquaView(null, NOW, 'en', en)).toBeNull();
		expect(volumeFisquaView(undefined, NOW, 'en', en)).toBeNull();
	});

	it('says the volume has not been sent when it has no manifest', () => {
		const view = volumeFisquaView(fisqua(), NOW, 'en', en)!;
		expect(view.kind).toBe('none');
		expect(view.label).toBe(en.fisqua_out_none);
		expect(view.problems).toEqual([]);
		expect(view.history).toEqual([]);
	});

	it('waits for the offsite copy', () => {
		const view = volumeFisquaView(fisqua({ outbox: [row()] }), NOW, 'en', en)!;
		expect(view.kind).toBe('waiting_for_upload');
		expect(view.label).toBe(en.fisqua_out_waiting);
		expect(view.tone).toBe('progress');
	});

	it.each(['ready', 'sending'])('shows %s as being sent', (state) => {
		const view = volumeFisquaView(fisqua({ outbox: [row({ state })] }), NOW, 'en', en)!;
		expect(view.kind).toBe('sending');
		expect(view.label).toBe(en.fisqua_out_sending);
	});

	it('shows a failed send with its next attempt, and that Captua will retry', () => {
		const next = naiveUtc(TODAY_1405);
		const view = volumeFisquaView(fisqua({ outbox: [row({ state: 'failed', attempts: 2, next_attempt_at: next, last_error: 'ConnectError: boom' })] }), NOW, 'en', en)!;
		expect(view.kind).toBe('failed');
		expect(view.tone).toBe('attention');
		expect(view.label).toBe(en.fisqua_out_failed('today', formatBackupDate(TODAY_1405, NOW, 'en'), formatBackupTime(TODAY_1405, 'en')));
		expect(view.label).toContain('14:05');
		expect(view.label).toContain('try again');
		// The backend's English error is never shown.
		expect(JSON.stringify(view)).not.toContain('ConnectError');
	});

	it('shows a failed send with no next attempt time as retrying all the same', () => {
		const view = volumeFisquaView(fisqua({ outbox: [row({ state: 'failed' })] }), NOW, 'en', en)!;
		expect(view.label).toBe(en.fisqua_out_failed_no_time);
	});

	it('lists a refusal by Captua in the catalogue words, with no_reference_code', () => {
		const problems = [
			{ rule: 'no_reference_code', message: 'The volume has no Fisqua reference code, so it is not sent', record_ids: [], image_ids: [] },
			{ rule: 'sha256_missing', message: 'x', record_ids: [4, 2], image_ids: [9] },
			{ rule: 'brand_new_rule', message: 'Something new.', record_ids: [], image_ids: [] }
		];
		const view = volumeFisquaView(fisqua({ outbox: [row({ state: 'refused', refusal: 'not_exportable', problems })] }), NOW, 'en', en)!;
		expect(view.kind).toBe('not_exportable');
		expect(view.label).toBe(en.fisqua_out_not_exportable);
		expect(view.problems).toEqual([
			{ text: en.col_manifest_rule_no_reference_code, records: null, fromFisqua: false },
			{ text: en.col_manifest_rule_sha256_missing, records: en.col_manifest_records([2, 4]), fromFisqua: false },
			{ text: en.col_manifest_rule_other, records: null, fromFisqua: false }
		]);
		// The backend's English texts are not shown.
		expect(JSON.stringify(view)).not.toContain('it is not sent');
	});

	it("lists a refusal by Fisqua in Fisqua's own words, marked as Fisqua's", () => {
		const problems = [
			{ rule: 'run-started', message: 'A run has started on the older manifest.', recordIds: [1] },
			{ rule: 'payload-too-large' }
		];
		const view = volumeFisquaView(fisqua({ outbox: [row({ state: 'refused', refusal: 'fisqua', problems, attempts: 1 })] }), NOW, 'en', en)!;
		expect(view.kind).toBe('refused_by_fisqua');
		expect(view.label).toBe(en.fisqua_out_refused_by_fisqua);
		expect(view.problems).toEqual([
			{ text: en.fisqua_problem_from_fisqua('A run has started on the older manifest.'), records: null, fromFisqua: true },
			{ text: en.fisqua_problem_from_fisqua('payload-too-large'), records: null, fromFisqua: true }
		]);
	});

	it('shows a delivered manifest with no status yet as waiting for its status', () => {
		const view = volumeFisquaView(fisqua({ outbox: [delivered] }), NOW, 'en', en)!;
		expect(view.kind).toBe('delivered');
		expect(view.label).toBe(en.fisqua_out_delivered);
	});

	const labels: Record<string, string> = {
		received: en.fisqua_st_received,
		registered: en.fisqua_st_registered,
		queued: en.fisqua_st_queued,
		running: en.fisqua_st_running,
		review_pending: en.fisqua_st_review_pending,
		published: en.fisqua_st_published,
		refused: en.fisqua_st_refused,
		superseded: en.fisqua_st_superseded,
		failed: en.fisqua_st_failed,
		unknown: en.fisqua_st_unknown
	};

	it.each(Object.keys(labels))("shows Fisqua's status %s with its label", (st) => {
		const view = volumeFisquaView(fisqua({ outbox: [delivered], status: status({ status: st }) }), NOW, 'en', en)!;
		expect(view.kind).toBe(`status_${st}`);
		expect(view.label).toBe(labels[st]);
		expect(view.detail).toBe(en.fisqua_checked('today', formatBackupDate(TODAY_0930, NOW, 'en'), formatBackupTime(TODAY_0930, 'en')));
	});

	it('gives every status a distinct label, in both languages', () => {
		const states = Object.keys(labels);
		for (const msgs of [en, es]) {
			const seen = new Set(
				states.map((st) => volumeFisquaView(fisqua({ outbox: [delivered], status: status({ status: st }) }), NOW, 'en', msgs)!.label)
			);
			expect(seen.size).toBe(states.length);
		}
	});

	it("lists Fisqua's problems whatever the status", () => {
		const problems = [{ rule: 'blur', message: 'page 3' }];
		const view = volumeFisquaView(fisqua({ outbox: [delivered], status: status({ status: 'published', problems }) }), NOW, 'en', en)!;
		expect(view.problems).toEqual([{ text: en.fisqua_problem_from_fisqua('page 3'), records: null, fromFisqua: true }]);
		expect(view.tone).toBe('ok');
	});

	it('shows a status Fisqua names but this build does not know', () => {
		const view = volumeFisquaView(fisqua({ outbox: [delivered], status: status({ status: 'archived' }) }), NOW, 'en', en)!;
		expect(view.kind).toBe('status_other');
		expect(view.label).toBe(en.fisqua_st_other);
	});

	it('takes a status with no manifest id as the latest one', () => {
		const view = volumeFisquaView(fisqua({ outbox: [delivered], status: status({ status: 'unknown', manifest_id: null }) }), NOW, 'en', en)!;
		expect(view.kind).toBe('status_unknown');
	});

	it("does not show the status of an older manifest as the newer one's", () => {
		const newer = row({ manifest_id: 'b2', state: 'waiting_for_upload' });
		const older = { ...delivered, manifest_id: 'a1' };
		const view = volumeFisquaView(fisqua({ outbox: [newer, older], status: status({ manifest_id: 'a1', status: 'published' }) }), NOW, 'en', en)!;
		expect(view.kind).toBe('waiting_for_upload');
	});

	it('keeps withdrawn and superseded manifests in the history, never as the current line', () => {
		const withdrawn = row({ manifest_id: 'c3', state: 'withdrawn' });
		const superseded = row({ manifest_id: 'b2', state: 'superseded' });
		const view = volumeFisquaView(fisqua({ outbox: [withdrawn, superseded, delivered], status: status({ status: 'queued' }) }), NOW, 'en', en)!;
		expect(view.kind).toBe('status_queued');
		expect(view.history.map((h) => h.kind)).toEqual(['withdrawn', 'superseded']);
		expect(view.history.map((h) => h.label)).toEqual([en.fisqua_out_withdrawn, en.fisqua_out_superseded]);
		expect(view.history[0].when).toContain('09:30');
	});

	it('shows only withdrawn manifests as not sent, with them in the history', () => {
		const view = volumeFisquaView(fisqua({ outbox: [row({ state: 'withdrawn' })] }), NOW, 'en', en)!;
		expect(view.kind).toBe('none');
		expect(view.history).toHaveLength(1);
	});

	it.each([
		['token', 401, 'fisqua_cfg_token'],
		['token', 403, 'fisqua_cfg_token'],
		['not_found', 404, 'fisqua_cfg_not_found'],
		['redirect', 302, 'fisqua_cfg_redirect'],
		['something_else', 401, 'fisqua_cfg_other']
	] as const)('warns that sending is stopped for a configuration error (%s)', (reason, code, key) => {
		const config_error = { at: naiveUtc(TODAY_0930), status_code: code, reason, config_fingerprint: 'ab12cd34' };
		const view = volumeFisquaView(fisqua({ outbox: [row({ state: 'ready' })], config_error }), NOW, 'en', en)!;
		expect(view.configError).toBe(en[key]);
		expect(view.configError).toContain('Ask whoever manages the scanner');
		expect(view.tone).toBe('attention');
	});

	it('has no warning without a configuration error', () => {
		expect(volumeFisquaView(fisqua({ outbox: [row()] }), NOW, 'en', en)!.configError).toBeNull();
	});
});

// Shaped as unit_fisqua_summary in app/core/fisqua_outbox.py.
function summary(over: Partial<UnitFisquaSummary> = {}): UnitFisquaSummary {
	return { configured: true, environment: 'production', config_error: null, last_send: null, last_poll: null, ...over };
}

describe('unitFisquaView', () => {
	it('is null for a backend that sends no Fisqua summary', () => {
		expect(unitFisquaView(undefined, en)).toBeNull();
	});

	it('says Fisqua is not configured', () => {
		const view = unitFisquaView(summary({ configured: false, environment: null }), en)!;
		expect(view.level).toBe('off');
		expect(view.lines).toEqual([en.fisqua_unit_off]);
		expect(view.warning).toBeNull();
	});

	it('names the environment, and that nothing has run yet', () => {
		const view = unitFisquaView(summary(), en)!;
		expect(view.level).toBe('on');
		expect(view.lines).toEqual([en.fisqua_unit_env_production, en.fisqua_unit_send_none, en.fisqua_unit_poll_none]);
		expect(unitFisquaView(summary({ environment: 'staging' }), en)!.lines[0]).toBe(en.fisqua_unit_env_staging);
	});

	it('gives the last send and the last poll', () => {
		const view = unitFisquaView(
			summary({
				last_send: { status: 'done', promoted: 1, not_exportable: 0, delivered: 2, refused: 1, failed: 0, waiting: 3 },
				last_poll: { status: 'done', asked: 4, calls: 1, answered: 4, recovered: 0 }
			}),
			en
		)!;
		expect(view.lines[1]).toBe(en.fisqua_unit_send_done(2, 1, 0, 3));
		expect(view.lines[2]).toBe(en.fisqua_unit_poll_done(4, 4));
	});

	it.each([
		['config_error', 'fisqua_unit_send_config_error', 'fisqua_unit_poll_config_error'],
		['error', 'fisqua_unit_send_error', 'fisqua_unit_poll_error'],
		['stopped', 'fisqua_unit_send_stopped', 'fisqua_unit_poll_other'],
		['no_transport', 'fisqua_unit_send_other', 'fisqua_unit_poll_other']
	] as const)('words a %s run', (st, sendKey, pollKey) => {
		const view = unitFisquaView(summary({ last_send: { status: st }, last_poll: { status: st } }), en)!;
		expect(view.lines[1]).toBe(en[sendKey]);
		expect(view.lines[2]).toBe(en[pollKey]);
	});

	it('warns about the configuration error', () => {
		const view = unitFisquaView(
			summary({ config_error: { at: '2026-10-24T09:30:00', status_code: 404, reason: 'not_found', config_fingerprint: 'ab12cd34' } }),
			en
		)!;
		expect(view.level).toBe('attention');
		expect(view.warning).toBe(en.fisqua_cfg_not_found);
	});
});

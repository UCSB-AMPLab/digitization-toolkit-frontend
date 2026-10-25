import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import {
	CAPTURE_MANIFEST_RULES,
	canDownloadCaptureManifest,
	captureManifestErrorText,
	captureManifestFilename,
	captureManifestRefusal
} from './capture-manifest';

// A stand-in for api.ts's ApiError, as in volume-refusals.test.ts.
class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.detail = detail;
		this.status = status;
	}
}

// The 409 of GET /collections/{id}/capture-manifest (app/api/collections.py):
// detail = {message, problems: [Problem.as_dict()]} (app/core/capture_manifest.py).
function refused(problems: { rule: string; message: string; record_ids: number[]; image_ids: number[] }[]) {
	const message = 'The capture manifest cannot be exported, because Fisqua would refuse it: ...';
	return new ApiError(message, { message, problems }, 409);
}

describe('canDownloadCaptureManifest', () => {
	it('allows the roles allow_contributor admits', () => {
		expect(canDownloadCaptureManifest('admin')).toBe(true);
		expect(canDownloadCaptureManifest('operator')).toBe(true);
	});

	it('refuses every other role and no role', () => {
		expect(canDownloadCaptureManifest('reviewer')).toBe(false);
		expect(canDownloadCaptureManifest('read_only')).toBe(false);
		expect(canDownloadCaptureManifest(null)).toBe(false);
		expect(canDownloadCaptureManifest(undefined)).toBe(false);
	});
});

describe('captureManifestFilename', () => {
	const body = JSON.stringify({ generatedAt: '2026-10-24T18:03:00Z', volumes: [{ stem: 'co-agn-saa-i-1' }] });

	it('takes the server filename from Content-Disposition', () => {
		expect(
			captureManifestFilename('attachment; filename="capture-manifest_co-agn-saa-i-1_2026-10-24.json"', body)
		).toBe('capture-manifest_co-agn-saa-i-1_2026-10-24.json');
	});

	it('builds the same name from the body when the header cannot be read (cross-origin)', () => {
		expect(captureManifestFilename(null, body)).toBe('capture-manifest_co-agn-saa-i-1_2026-10-24.json');
	});

	it('falls back to a plain name when neither says', () => {
		expect(captureManifestFilename(null, 'not json')).toBe('capture-manifest.json');
		expect(captureManifestFilename('attachment', '{}')).toBe('capture-manifest.json');
	});

	it('never keeps a path from the header', () => {
		expect(captureManifestFilename('attachment; filename="../x/evil.json"', body)).toBe('evil.json');
	});
});

describe('captureManifestRefusal', () => {
	it('is null for anything but the 409 with problems', () => {
		expect(captureManifestRefusal(new ApiError('Collection 9 not found', undefined, 404), en)).toBeNull();
		expect(captureManifestRefusal(new ApiError('x', { message: 'x' }, 409), en)).toBeNull();
		expect(captureManifestRefusal(new Error('network'), en)).toBeNull();
	});

	it('maps each known rule to its catalogue text, never the backend English', () => {
		const error = refused([
			{ rule: 'records_captured', message: '2 record(s) are still captured ...', record_ids: [4, 3], image_ids: [] },
			{ rule: 'no_project', message: 'The volume is not in a project ...', record_ids: [], image_ids: [] }
		]);
		const view = captureManifestRefusal(error, es)!;
		expect(view.problems).toHaveLength(2);
		expect(view.problems[0].text).toBe(es.col_manifest_rule_records_captured);
		expect(view.problems[0].records).toBe(es.col_manifest_records([3, 4]));
		expect(view.problems[1].text).toBe(es.col_manifest_rule_no_project);
		expect(view.problems[1].records).toBeNull();
		expect(JSON.stringify(view)).not.toContain('still captured');
	});

	it('falls back to the generic line for a rule this build does not know', () => {
		const view = captureManifestRefusal(
			refused([{ rule: 'brand_new_rule', message: 'Something new.', record_ids: [7], image_ids: [] }]),
			en
		)!;
		expect(view.problems).toEqual([{ rule: 'brand_new_rule', text: en.col_manifest_rule_other, records: en.col_manifest_records([7]) }]);
	});

	it('has a catalogue text for every rule of app/core/capture_manifest.py RULES', () => {
		for (const rule of CAPTURE_MANIFEST_RULES) {
			const view = captureManifestRefusal(refused([{ rule, message: 'x', record_ids: [], image_ids: [] }]), en)!;
			expect(view.problems[0].text).not.toBe(en.col_manifest_rule_other);
			expect(view.problems[0].text.length).toBeGreaterThan(0);
		}
	});

	it("has a catalogue text for the outbox's no_reference_code, in both languages", () => {
		for (const msgs of [en, es]) {
			const view = captureManifestRefusal(refused([{ rule: 'no_reference_code', message: 'x', record_ids: [], image_ids: [] }]), msgs)!;
			expect(view.problems[0].text).toBe(msgs.col_manifest_rule_no_reference_code);
		}
	});

	it('skips malformed problem entries', () => {
		const error = new ApiError('x', { message: 'x', problems: [null, 'x', { rule: 'no_stem' }] }, 409);
		const view = captureManifestRefusal(error, en)!;
		expect(view.problems).toEqual([{ rule: 'no_stem', text: en.col_manifest_rule_no_stem, records: null }]);
	});
});

describe('col_manifest_records', () => {
	it('lists up to 20 records, then counts the rest', () => {
		const ids = Array.from({ length: 23 }, (_, i) => i + 1);
		expect(en.col_manifest_records([5])).toBe('Record 5');
		expect(en.col_manifest_records([3, 4])).toBe('Records 3, 4');
		expect(en.col_manifest_records(ids)).toContain('and 3 more');
		expect(es.col_manifest_records(ids)).toContain('y 3 más');
	});
});

describe('captureManifestErrorText', () => {
	it('names a missing volume on 404', () => {
		expect(captureManifestErrorText(new ApiError('Collection 9 not found', undefined, 404), es)).toBe(
			es.col_manifest_err_not_found
		);
	});

	it('uses the generic text for anything else, never the backend English', () => {
		expect(captureManifestErrorText(new ApiError('Internal Server Error', undefined, 500), en)).toBe(en.col_manifest_err);
		expect(captureManifestErrorText(new Error('Failed to fetch'), en)).toBe(en.col_manifest_err);
	});
});

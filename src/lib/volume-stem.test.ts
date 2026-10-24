import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import {
	FILENAME_STEM_MAX_LENGTH,
	deleteRefused,
	isConflict,
	isVolumeRequired,
	needsStem,
	stemConflict,
	stemConflictText,
	stemProblem,
	stemProblemText
} from './volume-stem';

// A stand-in for api.ts's ApiError: importing the real one would pull in
// SvelteKit and force this out of the node test project.
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

describe('stemProblem', () => {
	it('accepts lowercase slugs of letters and digits joined by single hyphens', () => {
		for (const stem of ['co-ahr-con-t055', 'co-ahr-con-caj001-car001', 'abc', '2026', 'a-1']) {
			expect(stemProblem(stem, true)).toBeNull();
		}
	});

	it('accepts a stem of exactly the maximum length and refuses one longer', () => {
		expect(FILENAME_STEM_MAX_LENGTH).toBe(27);
		expect(stemProblem('a'.repeat(27), true)).toBeNull();
		expect(stemProblem('a'.repeat(28), true)).toBe('too_long');
	});

	it('refuses uppercase, accents, ñ, underscores, spaces, dots and stray hyphens', () => {
		for (const stem of [
			'CO-AHR',
			'co-ahr-concejo-tomo-ñ',
			'código',
			'co_ahr',
			'co ahr',
			'co.ahr',
			'-co',
			'co-',
			'co--ahr'
		]) {
			expect(stemProblem(stem, true), stem).toBe('pattern');
		}
	});

	it('checks the trimmed value', () => {
		expect(stemProblem('  co-ahr-jud-t221 ', true)).toBeNull();
		expect(stemProblem('   ', true)).toBe('required');
	});

	it('requires a stem only when asked to', () => {
		expect(stemProblem('', true)).toBe('required');
		expect(stemProblem('', false)).toBeNull();
	});

	it('has a message for each problem in both catalogues', () => {
		for (const msgs of [es, en]) {
			for (const p of ['required', 'too_long', 'pattern'] as const) {
				expect(stemProblemText(p, msgs)).toBeTruthy();
			}
			expect(stemProblemText('too_long', msgs)).toContain('27');
		}
	});
});

describe('stemConflict', () => {
	it('reads a duplicate stem from the constraint name', () => {
		const err = new ApiError(
			'Another volume already uses this file name stem.',
			{ message: 'Another volume already uses this file name stem.', constraint: 'collections_filename_stem_key' },
			409
		);
		expect(stemConflict(err)).toBe('stem_taken');
	});

	it('reads a stem change after capture from the backend message', () => {
		const message = 'The volume has already captured images, so its file name stem cannot be changed.';
		expect(stemConflict(new ApiError(message, { message }, 409))).toBe('stem_fixed');
	});

	it('reads a refused delete from the backend message', () => {
		const message =
			'This volume has a file name stem and has captured images, so it cannot be ' +
			'deleted; it keeps its stem so the name is never issued again.';
		expect(stemConflict(new ApiError(message, { message }, 409))).toBe('stem_reserved');
	});

	it('returns null for any other error', () => {
		// The non-empty-volume 409 carries a string detail.
		expect(stemConflict(new ApiError('Cannot delete a non-empty collection', undefined, 409))).toBeNull();
		expect(
			stemConflict(new ApiError('x', { message: 'x', constraint: 'ix_collections_external_id' }, 409))
		).toBeNull();
		expect(stemConflict(new ApiError('nope', { message: 'nope' }, 422))).toBeNull();
		expect(stemConflict(new Error('network'))).toBeNull();
		expect(stemConflict(null)).toBeNull();
	});

	it('maps each conflict to a catalogue message, never the backend text', () => {
		expect(stemConflictText('stem_taken', es)).toBe(es.pd_err_stem_taken);
		expect(stemConflictText('stem_fixed', es)).toBe(es.pd_err_stem_fixed);
		expect(stemConflictText('stem_reserved', es)).toBe(es.pd_delete_stem_reserved);
		expect(stemConflictText('stem_taken', en)).toBe(en.pd_err_stem_taken);
		for (const c of ['stem_taken', 'stem_fixed', 'stem_reserved'] as const) {
			expect(stemConflictText(c, es)).not.toMatch(/file name stem/);
		}
	});
});

describe('isConflict, needsStem and deleteRefused', () => {
	it('recognises a 409 by its status', () => {
		expect(isConflict(new ApiError('x', { message: 'x' }, 409))).toBe(true);
		expect(isConflict(new ApiError('x', undefined, 500))).toBe(false);
		expect(isConflict(new Error('x'))).toBe(false);
	});

	it('marks a volume with no stem', () => {
		expect(needsStem({ filename_stem: null })).toBe(true);
		expect(needsStem({})).toBe(true);
		expect(needsStem({ filename_stem: '' })).toBe(true);
		expect(needsStem({ filename_stem: 'co-ahr-jud-t221' })).toBe(false);
		expect(needsStem(null)).toBe(false);
	});

	it('refuses the delete only when the stem is reserved', () => {
		expect(deleteRefused({ stem_reserved: true })).toBe(true);
		expect(deleteRefused({ stem_reserved: false })).toBe(false);
		expect(deleteRefused({})).toBe(false);
		expect(deleteRefused(null)).toBe(false);
	});
});

describe('isVolumeRequired', () => {
	it('recognises the 409 for a capture that names no volume by its exact text', () => {
		expect(isVolumeRequired(new ApiError('Captures must go into a volume.', undefined, 409))).toBe(true);
	});

	it('does not take the no-stem 409 or other errors for it', () => {
		const noStem = 'This volume has no file name stem. Give it one before capturing into it.';
		expect(isVolumeRequired(new ApiError(noStem, undefined, 409))).toBe(false);
		expect(isVolumeRequired(new ApiError('Captures must go into a volume.', undefined, 422))).toBe(false);
		expect(isVolumeRequired(null)).toBe(false);
	});
});

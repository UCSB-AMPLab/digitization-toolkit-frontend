// The capture format selector's explanatory lines (cam_format_note_). There
// are two formats, JPEG and RAW+JPEG, and the RAW+JPEG line differs by camera
// type: a T7 writes one CR2 holding the JPEG, a CHDK compact sends a DNG and
// a JPEG of the same capture.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

const keys = (catalogue: Record<string, unknown>) =>
	Object.keys(catalogue).filter((k) => k.startsWith('cam_format_note_')).sort();

describe('capture format strings', () => {
	it('the two catalogues have the same cam_format_note_ keys, all strings', () => {
		expect(keys(en)).toEqual(['cam_format_note_jpeg', 'cam_format_note_raw_chdk', 'cam_format_note_raw_dslr']);
		expect(keys(es)).toEqual(keys(en));
		for (const key of keys(es)) {
			const value = (es as Record<string, unknown>)[key];
			expect(typeof value, key).toBe('string');
			expect(String(value).length, key).toBeGreaterThan(0);
			expect(String(value), key).not.toMatch(/[«»]/);
		}
	});

	it('English', () => {
		expect(en.cam_format_note_raw_dslr).toBe(
			'The camera saves a RAW file (CR2). The JPEG is inside it, and Captua copies it out for viewing.'
		);
		expect(en.cam_format_note_raw_chdk).toBe(
			'The camera sends a RAW file (DNG) and a JPEG of the same picture. Captua keeps both.'
		);
		expect(en.cam_format_note_jpeg).toBe('The camera saves a JPEG only.');
	});
});

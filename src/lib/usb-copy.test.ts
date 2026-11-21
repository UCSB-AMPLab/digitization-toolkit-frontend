// Copying a testing volume's pictures to a USB drive (NEH-391): who may do
// it, the message for each failure code in both languages, and the
// request recorder's route table.
//
// Version: 0.1.0
import { describe, expect, it } from 'vitest';
import { canCopyToUsb } from './unit-mode';
import { testingRefusalText, usbFailureCode, usbFailureText } from './testing-space';
import { ROUTES, routeOf } from './test-support/testing-routes';
import { en } from './i18n/en';
import { es } from './i18n/es';

const CODES = [
	'usb_not_eligible',
	'usb_copy_busy',
	'usb_mount',
	'usb_full',
	'usb_write',
	'usb_name',
	'usb_unmount',
	'usb_volume_empty',
	'usb_real_volume',
	'usb_read',
	'usb_exists'
] as const;

describe('canCopyToUsb', () => {
	it('is for the testing account and the administrator, on a testing volume', () => {
		expect(canCopyToUsb('testing', true)).toBe(true);
		expect(canCopyToUsb('admin', true)).toBe(true);
	});
	it('is not for a real volume', () => {
		expect(canCopyToUsb('testing', false)).toBe(false);
		expect(canCopyToUsb('admin', false)).toBe(false);
	});
	it('is not for operators, reviewers or no role', () => {
		expect(canCopyToUsb('operator', true)).toBe(false);
		expect(canCopyToUsb('reviewer', true)).toBe(false);
		expect(canCopyToUsb(null, true)).toBe(false);
		expect(canCopyToUsb(undefined, true)).toBe(false);
	});
});

describe('the failure messages', () => {
	it('has one message per code in both languages', () => {
		for (const code of CODES) {
			const key = `testing_usb_err_${code.slice(4)}` as keyof typeof en;
			expect(typeof en[key], key).toBe('string');
			expect(typeof es[key], key).toBe('string');
			expect(usbFailureText(code, en), code).toBe(en[key]);
			expect(usbFailureText(code, es), code).toBe(es[key]);
			expect(en[key] as string, key).not.toMatch(/!|please|oops|collection/i);
		}
	});
	it('maps the refusals the start can give that are not usb_ codes', () => {
		expect(usbFailureText('testing_volume_busy', en)).toBe(en.testing_usb_err_volume_busy);
		expect(usbFailureText('testing_volume_busy', es)).toBe(es.testing_usb_err_volume_busy);
		expect(usbFailureText('not_found', en)).toBe(en.testing_err_not_found);
		expect(usbFailureText('not_found', es)).toBe(es.testing_err_not_found);
		expect(en.testing_usb_err_volume_busy).toBe('Captua is working on this volume right now. Wait a moment and try again.');
		expect(en.testing_usb_err_real_volume).toBe('Only a testing volume can be copied to a USB drive.');
		expect(en.testing_usb_err_read).toBe('Captua could not read one of the pictures on the unit. Tell an administrator, who has to look into it.');
		expect(en.testing_usb_err_exists).toBe(
			'The USB drive already has a folder with the name Captua needs. Wait a minute and try again.'
		);
		expect(en.testing_usb_status_unreachable).toBe(
			'Captua cannot read the progress of the copy right now. The copy may still be running. Do not pull the drive out.'
		);
		expect(en.testing_usb_err_lost).toBe(
			'Captua lost track of this copy. Do not pull the drive out. Tell an administrator, who has to unmount it.'
		);
		expect('testing_usb_left_mounted' in en).toBe(false);
		expect('testing_usb_left_mounted' in es).toBe(false);
		expect(en.testing_usb_skipped(3)).toBe('3 pictures could not be copied. Tell an administrator.');
	});
	it('returns null for a code it does not know', () => {
		expect(usbFailureText('usb_something_else', en)).toBeNull();
		expect(usbFailureText(null, en)).toBeNull();
	});
	it('reads the code from a refusal detail', () => {
		expect(usbFailureCode({ status: 409, detail: { code: 'usb_copy_busy', message: 'x' } })).toBe('usb_copy_busy');
		expect(usbFailureCode({ status: 500, detail: 'text' })).toBeNull();
		expect(usbFailureCode(new Error('x'))).toBeNull();
	});
	it('the testing account sees the two refusals the start can give, at their statuses', () => {
		const busy = { status: 409, detail: { code: 'usb_copy_busy' } };
		const eligible = { status: 422, detail: { code: 'usb_not_eligible' } };
		expect(testingRefusalText(busy, en, 'testing')).toBe(en.testing_usb_err_copy_busy);
		expect(testingRefusalText(eligible, es, 'testing')).toBe(es.testing_usb_err_not_eligible);
		expect(testingRefusalText({ status: 500, detail: { code: 'usb_copy_busy' } }, en, 'testing')).toBeNull();
		expect(testingRefusalText(busy, en, 'admin')).toBeNull();
	});
});

describe('the dialog strings', () => {
	it('have the same testing_usb_ keys in both catalogues', () => {
		const keys = (c: object) => Object.keys(c).filter((k) => k.startsWith('testing_usb_')).sort();
		expect(keys(en).length).toBeGreaterThan(CODES.length);
		expect(keys(es)).toEqual(keys(en));
	});
});

describe('the route table', () => {
	it('admits the three routes to the testing account', () => {
		for (const [method, path] of [
			['GET', '/system/testing/usb'],
			['POST', '/collections/{collection_id}/usb-copy'],
			['GET', '/collections/{collection_id}/usb-copy/status/{job_id}']
		] as const) {
			const found = ROUTES.find(([m, p]) => m === method && p === path);
			expect(found?.[2], `${method} ${path}`).toBe(true);
			expect(routeOf(method, path.replace(/\{[^}]+\}/g, '5'))?.template).toBe(path);
		}
	});
});

// NEH-340: the flag a volume carries in its lists and on its page while it
// is asked for colour card shots and they are not all there: "No colour
// card shots" with none, "Colour card shots skipped" when a request was
// skipped (or a page went before the shots). Nothing with the setting off,
// for a volume whose shots are present, or from an older backend.
//
// Version: 0.3.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import ColourCardFlag from './ColourCardFlag.svelte';

afterEach(() => locale.set('en'));

describe('ColourCardFlag', () => {
	it('none: "No colour card shots", saying how Fisqua receives the volume', () => {
		locale.set('en');
		const { container } = render(ColourCardFlag, {
			summary: { enabled: true, status: 'none', sets: 0 }
		});
		const flag = container.querySelector('[data-colour-card-flag]');
		expect(flag?.textContent?.trim()).toBe(en.cc_flag_none);
		expect(flag?.getAttribute('title')).toBe(en.cc_flag_title);
	});

	it('skipped, in Spanish', () => {
		locale.set('es');
		const { container } = render(ColourCardFlag, {
			summary: { enabled: true, status: 'skipped', sets: 1 }
		});
		expect(container.querySelector('[data-colour-card-flag]')?.textContent?.trim()).toBe(
			es.cc_flag_skipped
		);
	});

	for (const summary of [
		{ enabled: true, status: 'present', sets: 1 },
		{ enabled: false },
		null,
		undefined
	]) {
		it(`nothing for ${JSON.stringify(summary)}`, () => {
			const { container } = render(ColourCardFlag, { summary: summary as never });
			expect(container.querySelector('[data-colour-card-flag]')).toBeNull();
		});
	}
});

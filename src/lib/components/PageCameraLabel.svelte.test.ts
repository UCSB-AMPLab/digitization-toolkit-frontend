// PageCameraLabel: the words where the labelled element is at least 280px
// wide, the badge form below that; the words always the title, and the
// accessible name of the badge form; the caller's class and id on the
// element; never wrapping.
//
// Version: 0.3.0
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';

import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import PageCameraLabel from './PageCameraLabel.svelte';

const text = (el: Element) =>
	(el.textContent ?? '')
		.replace(/photo_camera/, '')
		.replace(/\s+/g, ' ')
		.trim();

afterEach(() => locale.set('en'));

for (const [lang, t] of [
	['en', en],
	['es', es]
] as const) {
	describe(`PageCameraLabel, ${lang}`, () => {
		const cases = [
			{
				role: 'left' as const,
				words: t.cam_page_even,
				letter: t.badge_cam_right,
				term: t.page_term_even
			},
			{
				role: 'right' as const,
				words: t.cam_page_odd,
				letter: t.badge_cam_left,
				term: t.page_term_odd
			}
		];
		for (const c of cases) {
			it(`role ${c.role} in 279px: the badge form`, () => {
				locale.set(lang as Locale);
				const { container } = render(PageCameraLabel, {
					role: c.role,
					width: 279,
					class: 'feed-label right',
					id: 'x-label'
				});
				const el = container.querySelector('.feed-label') as HTMLElement;
				expect(el.classList.contains('right')).toBe(true);
				expect(el.id).toBe('x-label');
				expect(text(el)).toBe(`${c.letter} · ${c.term}`);
				expect(el.getAttribute('role')).toBe('img');
				expect(el.getAttribute('aria-label')).toBe(c.words);
				expect(el.getAttribute('title')).toBe(c.words);
				const icon = el.querySelector('.material-symbols-outlined');
				expect(icon?.textContent).toBe('photo_camera');
				expect(icon?.getAttribute('aria-hidden')).toBe('true');
				expect(getComputedStyle(el).whiteSpace).toBe('nowrap');
			});

			it(`role ${c.role} in 280px: the words`, () => {
				locale.set(lang as Locale);
				const { container } = render(PageCameraLabel, {
					role: c.role,
					width: 280,
					class: 'feed-label'
				});
				const el = container.querySelector('.feed-label') as HTMLElement;
				expect(text(el)).toBe(c.words);
				expect(el.getAttribute('role')).toBeNull();
				expect(el.querySelector('.material-symbols-outlined')).toBeNull();
				expect(el.getAttribute('title')).toBe(c.words);
				expect(getComputedStyle(el).whiteSpace).toBe('nowrap');
			});
		}

		it('before it is measured (width 0): the badge form', () => {
			locale.set(lang as Locale);
			const { container } = render(PageCameraLabel, {
				role: 'left',
				width: 0,
				class: 'feed-label'
			});
			expect(container.querySelector('.feed-label')?.getAttribute('role')).toBe('img');
		});

		it('extra title text follows the words in the title', () => {
			locale.set(lang as Locale);
			const { container } = render(PageCameraLabel, {
				role: 'right',
				width: 100,
				title: 'Canon EOS Rebel T7',
				class: 'feed-label'
			});
			const el = container.querySelector('.feed-label') as HTMLElement;
			expect(el.getAttribute('title')).toBe(`${t.cam_page_odd} · Canon EOS Rebel T7`);
			expect(el.getAttribute('aria-label')).toBe(t.cam_page_odd);
		});
	});
}

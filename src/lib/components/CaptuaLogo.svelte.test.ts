// The logo draws the seedling and the wordmark from their own SVG files with
// <use>, picks the descriptor by locale, and takes its inks from the
// --logo-* properties in app.css.
//
// Version: 0.1.0
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { locale } from '$lib/i18n';
import CaptuaLogo from './CaptuaLogo.svelte';

afterEach(() => locale.set('es'));

function hrefs(container: HTMLElement): string[] {
	return [...container.querySelectorAll('use')].map((u) => u.getAttribute('href') ?? '');
}

describe('CaptuaLogo', () => {
	it('draws the thick seedling beside the plain wordmark by default, named Captua', async () => {
		const screen = render(CaptuaLogo);
		await expect.element(screen.getByRole('img', { name: 'Captua' })).toBeInTheDocument();
		const [seedling, wordmark] = hrefs(screen.container);
		expect(seedling).toContain('captua-seedling-thick');
		expect(seedling.endsWith('#captua-seedling')).toBe(true);
		expect(wordmark).toContain('captua-wordmark.');
		expect(wordmark.endsWith('#captua-wordmark')).toBe(true);
	});

	it('uses the Spanish descriptor in Spanish and the English one in English', async () => {
		locale.set('es');
		const es = render(CaptuaLogo, { wordmark: 'descriptor' });
		expect(hrefs(es.container)[1]).toContain('captua-wordmark-descriptor-es');

		locale.set('en');
		const en = render(CaptuaLogo, { wordmark: 'descriptor' });
		expect(hrefs(en.container)[1]).toContain('captua-wordmark-descriptor-en');
	});

	it('draws the thin seedling alone, hidden from assistive technology without a label', async () => {
		const screen = render(CaptuaLogo, { wordmark: 'none', weight: 'thin', label: '' });
		const svg = screen.container.querySelector('svg.captua-logo');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(svg?.getAttribute('role')).toBeNull();
		const uses = hrefs(screen.container);
		expect(uses).toHaveLength(1);
		expect(uses[0]).toContain('captua-seedling-thin');
	});

	it('stacks the seedling above the wordmark at 0.85 when asked', async () => {
		const screen = render(CaptuaLogo, { wordmark: 'descriptor', weight: 'thin', layout: 'stacked' });
		const svg = screen.container.querySelector('svg.captua-logo');
		expect(svg?.getAttribute('viewBox')).toBe('0 2 349 346');
		const [seedling, wordmark] = [...screen.container.querySelectorAll('use')];
		expect(seedling.getAttribute('x')).toBe('54.5');
		expect(seedling.getAttribute('width')).toBe('240');
		expect(wordmark.parentElement?.getAttribute('transform')).toBe('translate(26.6 255) scale(0.85)');
	});

	it('takes the seedling and wordmark inks from the --logo-* properties', async () => {
		document.documentElement.style.setProperty('--logo-seedling-ink', 'rgb(90, 140, 98)');
		document.documentElement.style.setProperty('--logo-wordmark-ink', 'rgb(237, 232, 220)');
		try {
			const screen = render(CaptuaLogo);
			const [seedling, wordmark] = [...screen.container.querySelectorAll('use')];
			expect(getComputedStyle(seedling).color).toBe('rgb(90, 140, 98)');
			expect(getComputedStyle(wordmark).color).toBe('rgb(237, 232, 220)');
		} finally {
			document.documentElement.style.removeProperty('--logo-seedling-ink');
			document.documentElement.style.removeProperty('--logo-wordmark-ink');
		}
	});
});

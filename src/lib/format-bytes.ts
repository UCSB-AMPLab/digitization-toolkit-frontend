// Sizes in catalogue messages ("12,3 GB" / "12.3 GB"), in the locale style of
// format-count.ts: decimal units (1 GB = 1000³ bytes, as cards and drives are
// sold), one decimal below 100 and none from 100 up, a trailing zero dropped,
// and the thousands separator of each language. The unit symbols are the same
// in both languages. A no-break space keeps the number with its unit.
//
// No import of the catalogue index, which imports the catalogues.

type ByteLocale = 'es' | 'en';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

// 'min2' is ES2023; the cast is for TypeScript libs that predate it (see format-count.ts).
const grouping = { es: 'min2' as unknown as boolean, en: true };
const tags = { es: 'es-CO', en: 'en-US' };

function formatter(locale: ByteLocale, digits: number): Intl.NumberFormat {
	return new Intl.NumberFormat(tags[locale], { maximumFractionDigits: digits, useGrouping: grouping[locale] });
}

const formatters: Record<ByteLocale, [Intl.NumberFormat, Intl.NumberFormat]> = {
	es: [formatter('es', 0), formatter('es', 1)],
	en: [formatter('en', 0), formatter('en', 1)]
};

/** `bytes` as a size is written in `locale`. */
export function formatBytes(bytes: number, locale: ByteLocale): string {
	let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
	let unit = 0;
	while (unit < UNITS.length - 1) {
		// Rounded as it will be shown, so 999.96 KB reads "1 MB", not "1000 KB".
		const shown = value < 100 ? Math.round(value * 10) / 10 : Math.round(value);
		if (shown < 1000) break;
		value /= 1000;
		unit += 1;
	}
	const [whole, oneDecimal] = formatters[locale];
	const text = (unit === 0 || value >= 100 ? whole : oneDecimal).format(value);
	return `${text} ${UNITS[unit]}`;
}

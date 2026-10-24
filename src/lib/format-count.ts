// Counts in catalogue messages, with the thousands separator of each
// language: Spanish leaves four digits unseparated and puts a period from
// five up (9999, 12.345); English puts a comma from four up (1,786).
//
// 'es-CO' alone groups four digits in the ICU that Node and Chromium ship
// ("9.999"), so the Spanish formatter asks for grouping from five digits
// with useGrouping 'min2'. The catalogues call this, so every caller of a
// count message gets the same format. No import of the catalogue index,
// which imports the catalogues.

type CountLocale = 'es' | 'en';

const formatters: Record<CountLocale, Intl.NumberFormat> = {
	// 'min2' is ES2023; the cast is for TypeScript libs that predate it.
	es: new Intl.NumberFormat('es-CO', { useGrouping: 'min2' as unknown as boolean }),
	en: new Intl.NumberFormat('en-US')
};

/** `n` as the count is written in `locale`. */
export function formatCount(n: number, locale: CountLocale): string {
	return formatters[locale].format(n);
}

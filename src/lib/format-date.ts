// API dates written in the interface language. Spanish follows Colombian
// conventions (es-CO), as format-count.ts and format-bytes.ts do for numbers,
// so a time reads "05:05 p. m." rather than Spain's "17:05".
//
// No import of the catalogue index, which imports the catalogues.

import { parseApiDate } from './pipeline';

type DateLocale = 'es' | 'en';

const tags: Record<DateLocale, string> = { es: 'es-CO', en: 'en-US' };

/**
 * `iso`, a datetime from the API, formatted in `locale` with `options`. The
 * string goes through parseApiDate, so a naive UTC value is shown in the
 * browser's time zone instead of being read as local time.
 */
export function formatApiDate(iso: string, locale: DateLocale, options: Intl.DateTimeFormatOptions): string {
	return parseApiDate(iso).toLocaleString(tags[locale], options);
}

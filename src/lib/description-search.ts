// The search of Fisqua's descriptions behind the new-volume form's
// reference-code field (NEH-321, contract 1.10), apart from the form so it
// can be tested in plain node.
//
// From SEARCH_MIN_CHARS characters, the search waits SEARCH_DELAY_MS after
// the last keystroke, then asks the backend (GET /fisqua/descriptions). A
// newer query aborts the older request and the older answer is ignored. A
// Fisqua without 1.10 answers `search: false`: the form stops searching and
// shows nothing. Saving the volume still runs the exact 1.8 check.
//
// Version: 0.3.3

import type { Messages } from './i18n';
import type { DescriptionMatch, DescriptionSearchAnswer } from './api';

export type { DescriptionMatch, DescriptionSearchAnswer };

export const SEARCH_MIN_CHARS = 3;
export const SEARCH_DELAY_MS = 400;
export const SEARCH_MAX_RESULTS = 20;

/**
 * What the field shows: `idle` nothing (under three characters, or a
 * query Fisqua found too short); `searching` a quiet line; `results` the
 * list; `none` a line saying nothing matches; `unavailable` a line saying
 * Captua can't search Fisqua now; `off` nothing, for a Fisqua without search.
 */
export type SearchState = 'idle' | 'searching' | 'results' | 'none' | 'unavailable' | 'off';
export interface SearchView {
	state: SearchState;
	results: DescriptionMatch[];
}

type Search = (q: string, signal: AbortSignal) => Promise<DescriptionSearchAnswer>;

function isQueryTooShort(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const e = error as { status?: unknown; detail?: unknown };
	return e.status === 400 && typeof e.detail === 'object' && e.detail !== null
		&& (e.detail as { code?: unknown }).code === 'query_too_short';
}

/** The debounced search: `input` on every change of the field, `cancel` when the field stops searching. */
export function createDescriptionSearch(
	search: Search,
	onView: (view: SearchView) => void,
	{ delay = SEARCH_DELAY_MS, min = SEARCH_MIN_CHARS }: { delay?: number; min?: number } = {}
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | null = null;
	// Each input takes a number; an answer counts only while its number is the latest.
	let latest = 0;
	let off = false;

	function stop() {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		controller?.abort();
		controller = null;
		latest += 1;
	}

	function input(value: string) {
		stop();
		if (off) return;
		const mine = latest;
		const q = value.trim();
		// Characters, as the backend counts them, not UTF-16 units.
		if ([...q].length < min) {
			onView({ state: 'idle', results: [] });
			return;
		}
		timer = setTimeout(async () => {
			timer = undefined;
			const request = new AbortController();
			controller = request;
			onView({ state: 'searching', results: [] });
			try {
				const answer = await search(q, request.signal);
				if (mine !== latest) return;
				controller = null;
				if (answer.search === false) {
					off = true;
					onView({ state: 'off', results: [] });
					return;
				}
				const results = (answer.results ?? []).slice(0, SEARCH_MAX_RESULTS);
				onView(results.length > 0 ? { state: 'results', results } : { state: 'none', results: [] });
			} catch (error) {
				if (mine !== latest) return;
				controller = null;
				onView({ state: isQueryTooShort(error) ? 'idle' : 'unavailable', results: [] });
			}
		}, delay);
	}

	return { input, cancel: stop };
}

// Fisqua's ISAD(G) description levels, each with its catalogue key.
const LEVEL_KEYS = {
	fonds: 'pd_level_fonds',
	subfonds: 'pd_level_subfonds',
	series: 'pd_level_series',
	subseries: 'pd_level_subseries',
	file: 'pd_level_file',
	item: 'pd_level_item',
	collection: 'pd_level_collection',
	section: 'pd_level_section',
	volume: 'pd_level_volume'
} as const satisfies Record<string, keyof Messages>;

/** A description level in the interface's language; any other value as Fisqua sends it, and '' for none. */
export function levelLabel(level: string | null | undefined, m: Messages): string {
	if (!level) return '';
	return Object.hasOwn(LEVEL_KEYS, level) ? m[LEVEL_KEYS[level as keyof typeof LEVEL_KEYS]] : level;
}

// The volume name's limit: the backend's collections.name is String(255).
// Counted in UTF-16 units, as the name input's maxlength counts them.
export const NAME_MAX_LENGTH = 255;

/**
 * A title as a volume name: as it is up to NAME_MAX_LENGTH, else cut at the
 * last word boundary within it, with no ellipsis (the admin can edit it). A
 * title with no space in its first NAME_MAX_LENGTH is cut at the limit,
 * never inside a surrogate pair.
 */
export function nameFromTitle(title: string): string {
	if (title.length <= NAME_MAX_LENGTH) return title;
	let cut = title.slice(0, NAME_MAX_LENGTH);
	if (/\s/.test(title[NAME_MAX_LENGTH])) return cut.trimEnd();
	const space = cut.search(/\s\S*$/);
	if (space > 0) return cut.slice(0, space).trimEnd();
	if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
	return cut;
}

/** A match's dates and level, joined with " · ", leaving out either when empty. */
export function matchMeta(match: DescriptionMatch, m: Messages): string {
	return [match.dates?.display ?? '', levelLabel(match.level, m)].filter((part) => part.trim() !== '').join(' · ');
}

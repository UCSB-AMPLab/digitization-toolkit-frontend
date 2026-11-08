// The search of Fisqua's descriptions behind the new-volume form's
// reference-code field (NEH-321, contract 1.10): the wait after the last
// keystroke, answers to older queries ignored, each answer's state, and the
// level labels.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	SEARCH_DELAY_MS,
	createDescriptionSearch,
	NAME_MAX_LENGTH,
	levelLabel,
	matchMeta,
	nameFromTitle,
	type DescriptionMatch,
	type SearchView
} from './description-search';
import { es } from './i18n/es';
import { en } from './i18n/en';

function match(code: string, extra: Partial<DescriptionMatch> = {}): DescriptionMatch {
	return { referenceCode: code, title: `Title of ${code}`, level: 'file', dates: { display: '1790', start: '1790', end: '1790' }, ...extra };
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
}

function setup() {
	const views: SearchView[] = [];
	const calls: { q: string; signal: AbortSignal; answer: ReturnType<typeof deferred<{ results: DescriptionMatch[]; search?: boolean }>> }[] = [];
	const search = vi.fn((q: string, signal: AbortSignal) => {
		const answer = deferred<{ results: DescriptionMatch[]; search?: boolean }>();
		calls.push({ q, signal, answer });
		return answer.promise;
	});
	const controller = createDescriptionSearch(search, (v) => views.push(v));
	const last = () => views[views.length - 1];
	return { views, calls, search, controller, last };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the wait after the last keystroke', () => {
	it('is 400 ms', () => {
		expect(SEARCH_DELAY_MS).toBe(400);
	});

	it('searches once, 400 ms after the last keystroke, with the query trimmed', async () => {
		const { controller, search } = setup();
		controller.input('co-');
		await vi.advanceTimersByTimeAsync(200);
		controller.input('co-a');
		await vi.advanceTimersByTimeAsync(200);
		controller.input(' co-ahr ');
		await vi.advanceTimersByTimeAsync(399);
		expect(search).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(search).toHaveBeenCalledTimes(1);
		expect(search.mock.calls[0][0]).toBe('co-ahr');
	});

	it('does not search under three characters, and clears what was shown', async () => {
		const { controller, search, last, calls } = setup();
		controller.input('co-a');
		await vi.advanceTimersByTimeAsync(400);
		calls[0].answer.resolve({ results: [match('co-ahr')] });
		await vi.advanceTimersByTimeAsync(0);
		expect(last().state).toBe('results');
		controller.input('co');
		await vi.advanceTimersByTimeAsync(1000);
		expect(search).toHaveBeenCalledTimes(1);
		expect(last()).toEqual({ state: 'idle', results: [] });
		controller.input('  ab  ');
		await vi.advanceTimersByTimeAsync(1000);
		expect(search).toHaveBeenCalledTimes(1);
	});

	it('counts characters, not UTF-16 units', async () => {
		const { controller, search } = setup();
		controller.input('𝒜𝒜');
		await vi.advanceTimersByTimeAsync(400);
		expect(search).not.toHaveBeenCalled();
		controller.input('año');
		await vi.advanceTimersByTimeAsync(400);
		expect(search).toHaveBeenCalledTimes(1);
	});

	it('cancel stops a pending search', async () => {
		const { controller, search } = setup();
		controller.input('co-ahr');
		controller.cancel();
		await vi.advanceTimersByTimeAsync(1000);
		expect(search).not.toHaveBeenCalled();
	});
});

describe('answers to older queries', () => {
	it('are ignored, and the older request is aborted', async () => {
		const { controller, calls, last } = setup();
		controller.input('co-ahr');
		await vi.advanceTimersByTimeAsync(400);
		controller.input('co-ahr-con');
		await vi.advanceTimersByTimeAsync(400);
		expect(calls).toHaveLength(2);
		expect(calls[0].signal.aborted).toBe(true);
		calls[1].answer.resolve({ results: [match('co-ahr-con-caj002')] });
		await vi.advanceTimersByTimeAsync(0);
		calls[0].answer.resolve({ results: [match('co-ahr-old')] });
		await vi.advanceTimersByTimeAsync(0);
		expect(last().results.map((r) => r.referenceCode)).toEqual(['co-ahr-con-caj002']);
	});

	it('are ignored once the field drops under three characters', async () => {
		const { controller, calls, last } = setup();
		controller.input('co-ahr');
		await vi.advanceTimersByTimeAsync(400);
		controller.input('co');
		calls[0].answer.resolve({ results: [match('co-ahr')] });
		await vi.advanceTimersByTimeAsync(0);
		expect(last()).toEqual({ state: 'idle', results: [] });
	});

	it('a failure of an older query is ignored too', async () => {
		const { controller, calls, last } = setup();
		controller.input('co-ahr');
		await vi.advanceTimersByTimeAsync(400);
		controller.input('co-ahr-con');
		await vi.advanceTimersByTimeAsync(400);
		calls[1].answer.resolve({ results: [match('co-ahr-con')] });
		await vi.advanceTimersByTimeAsync(0);
		calls[0].answer.reject(Object.assign(new Error('x'), { status: 503 }));
		await vi.advanceTimersByTimeAsync(0);
		expect(last().state).toBe('results');
	});
});

describe('the states', () => {
	it('searching while the request is out, then the matches, at most 20', async () => {
		const { controller, calls, last } = setup();
		controller.input('co-ahr');
		await vi.advanceTimersByTimeAsync(400);
		expect(last()).toEqual({ state: 'searching', results: [] });
		calls[0].answer.resolve({ results: Array.from({ length: 25 }, (_, i) => match(`xx-${i}`)) });
		await vi.advanceTimersByTimeAsync(0);
		expect(last().state).toBe('results');
		expect(last().results).toHaveLength(20);
	});

	it('none when Fisqua has no match', async () => {
		const { controller, calls, last } = setup();
		controller.input('zzz');
		await vi.advanceTimersByTimeAsync(400);
		calls[0].answer.resolve({ results: [] });
		await vi.advanceTimersByTimeAsync(0);
		expect(last()).toEqual({ state: 'none', results: [] });
	});

	for (const status of [429, 503, 409, undefined]) {
		it(`unavailable on ${status ?? 'a network failure'}`, async () => {
			const { controller, calls, last } = setup();
			controller.input('co-ahr');
			await vi.advanceTimersByTimeAsync(400);
			calls[0].answer.reject(Object.assign(new Error('x'), status ? { status } : {}));
			await vi.advanceTimersByTimeAsync(0);
			expect(last()).toEqual({ state: 'unavailable', results: [] });
		});
	}

	it('idle on a 400 query_too_short', async () => {
		const { controller, calls, last } = setup();
		controller.input('---');
		await vi.advanceTimersByTimeAsync(400);
		calls[0].answer.reject(Object.assign(new Error('x'), { status: 400, detail: { code: 'query_too_short' } }));
		await vi.advanceTimersByTimeAsync(0);
		expect(last()).toEqual({ state: 'idle', results: [] });
	});

	it('off for a Fisqua without search, and no more searches after it', async () => {
		const { controller, calls, last, search } = setup();
		controller.input('co-ahr');
		await vi.advanceTimersByTimeAsync(400);
		calls[0].answer.resolve({ results: [], search: false });
		await vi.advanceTimersByTimeAsync(0);
		expect(last()).toEqual({ state: 'off', results: [] });
		controller.input('co-ahr-con');
		await vi.advanceTimersByTimeAsync(1000);
		expect(search).toHaveBeenCalledTimes(1);
		expect(last().state).toBe('off');
	});
});

describe('levelLabel', () => {
	const levels = [
		['fonds', 'Fondo', 'Fonds'],
		['subfonds', 'Subfondo', 'Subfonds'],
		['series', 'Serie', 'Series'],
		['subseries', 'Subserie', 'Subseries'],
		['file', 'Unidad documental compuesta', 'File'],
		['item', 'Unidad documental simple', 'Item'],
		['collection', 'Colección', 'Collection'],
		['section', 'Sección', 'Section'],
		['volume', 'Volumen', 'Volume']
	] as const;

	for (const [level, esLabel, enLabel] of levels) {
		it(`names ${level}`, () => {
			expect(levelLabel(level, es)).toBe(esLabel);
			expect(levelLabel(level, en)).toBe(enLabel);
		});
	}

	it('shows any other value as Fisqua sends it, and nothing for none', () => {
		expect(levelLabel('otherlevel', es)).toBe('otherlevel');
		expect(levelLabel('box', en)).toBe('box');
		expect(levelLabel(null, es)).toBe('');
		expect(levelLabel('', es)).toBe('');
	});
});

describe('the approved wording', () => {
	it('of the search lines and the search help', () => {
		expect(es.pd_search_none).toBe('Fisqua no tiene ninguna descripción que coincida con lo que escribiste.');
		expect(en.pd_search_none).toBe('Fisqua has no description that matches.');
		expect(es.pd_search_unavailable).toBe(
			'Captua no puede buscar en Fisqua en este momento. De todos modos, puedes escribir el código de referencia completo.'
		);
		expect(en.pd_search_unavailable).toBe("Captua can't search Fisqua right now. You can still type the full reference code.");
		expect(es.pd_stem_search_help).toBe(
			'Escribe al menos 3 caracteres del código de referencia o del título y elige la descripción de Fisqua que corresponda.'
		);
		expect(en.pd_stem_search_help).toBe(
			'Type at least 3 characters of the reference code or of the title, and choose the Fisqua description that matches.'
		);
	});
});

describe('pd_search_count', () => {
	it('counts descriptions in each language', () => {
		expect(es.pd_search_count(1)).toBe('1 descripción');
		expect(es.pd_search_count(3)).toBe('3 descripciones');
		expect(en.pd_search_count(1)).toBe('1 description');
		expect(en.pd_search_count(20)).toBe('20 descriptions');
	});
});

describe('nameFromTitle', () => {
	it('keeps a title of up to 255 characters as it is', () => {
		expect(NAME_MAX_LENGTH).toBe(255);
		const t = 'a'.repeat(255);
		expect(nameFromTitle(t)).toBe(t);
		expect(nameFromTitle('Caja 2')).toBe('Caja 2');
	});

	it('cuts a longer title at the last word boundary, with no ellipsis', () => {
		const words = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ');
		const name = nameFromTitle(words);
		expect(name.length).toBeLessThanOrEqual(255);
		expect(words.startsWith(name)).toBe(true);
		expect(words[name.length]).toBe(' ');
		expect(name.endsWith(' ')).toBe(false);
		expect(name).not.toContain('…');
	});

	it('keeps a word that ends exactly at 255', () => {
		const t = 'x'.repeat(250) + ' abcd' + ' tail';
		expect(nameFromTitle(t)).toBe('x'.repeat(250) + ' abcd');
	});

	it('cuts a title with no space at 255, never inside a surrogate pair', () => {
		expect(nameFromTitle('y'.repeat(300))).toBe('y'.repeat(255));
		const t = 'z'.repeat(254) + '𝒜' + 'z'.repeat(10);
		const name = nameFromTitle(t);
		expect(name).toBe('z'.repeat(254));
	});
});

describe('matchMeta', () => {
	it('joins the dates and the level with " · "', () => {
		expect(matchMeta(match('a', { level: 'file', dates: { display: '1790-1795', start: null, end: null } }), es))
			.toBe('1790-1795 · Unidad documental compuesta');
	});

	it('leaves out empty dates or level', () => {
		expect(matchMeta(match('a', { level: 'item', dates: { display: '', start: null, end: null } }), es)).toBe('Unidad documental simple');
		expect(matchMeta(match('a', { level: 'item', dates: { display: null, start: null, end: null } }), en)).toBe('Item');
		expect(matchMeta(match('a', { level: null, dates: { display: '1801', start: null, end: null } }), en)).toBe('1801');
	});
});

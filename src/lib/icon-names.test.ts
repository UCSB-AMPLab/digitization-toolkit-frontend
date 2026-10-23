import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import names from './icon-names.json';

// static/fonts/MaterialSymbolsOutlined.woff2 is a subset built from
// icon-names.json by scripts/subset-icon-font.py. An icon name used in a
// template but missing from the list renders as plain text.

const SRC = join(__dirname, '..');

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return path.endsWith('.svelte') ? [path] : [];
	});
}

/** Icon names a file can render, read from the elements with the icon class. */
function iconsIn(source: string): { names: string[]; unresolved: string[] } {
	const found: string[] = [];
	const unresolved: string[] = [];
	const element = /<span\b[^>]*material-symbols-outlined[^>]*>([\s\S]*?)<\/span>/g;
	for (const match of source.matchAll(element)) {
		const body = match[1];
		const expressions = [...body.matchAll(/\{([^}]*)\}/g)];
		const literal = body.replace(/\{[^}]*\}/g, '').trim();
		if (literal) found.push(literal);
		for (const expr of expressions) {
			const strings = [...expr[1].matchAll(/'([a-z0-9_]+)'/g)].map((s) => s[1]);
			if (strings.length) found.push(...strings);
			else unresolved.push(expr[1].trim());
		}
	}
	if (unresolved.length) {
		// Names held in a lookup object, as in StatusBadge: const icons = { key: 'name', ... }
		const lookup = source.match(/const icons\b[^=]*=\s*\{([^}]*)\}/);
		if (lookup) {
			found.push(...[...lookup[1].matchAll(/:\s*'([a-z0-9_]+)'/g)].map((s) => s[1]));
			unresolved.length = 0;
		}
	}
	return { names: found, unresolved };
}

describe('icon font subset', () => {
	const used = new Map<string, Set<string>>();
	const unresolved: string[] = [];
	for (const file of svelteFiles(SRC)) {
		const result = iconsIn(readFileSync(file, 'utf8'));
		unresolved.push(...result.unresolved.map((e) => `${file}: {${e}}`));
		for (const name of result.names) {
			if (!used.has(name)) used.set(name, new Set());
			used.get(name)!.add(file.slice(SRC.length + 1));
		}
	}

	it('finds icons in the templates', () => {
		expect(used.size).toBeGreaterThan(10);
	});

	it('has no icon name computed in a way the scan cannot read', () => {
		expect(unresolved).toEqual([]);
	});

	it('lists every icon name the templates use', () => {
		const listed = new Set<string>(names);
		const missing = [...used].filter(([name]) => !listed.has(name));
		expect(
			missing.map(([name, files]) => `${name} (${[...files].join(', ')})`),
			'add these to src/lib/icon-names.json and rerun scripts/subset-icon-font.py'
		).toEqual([]);
	});

	it('lists no name the templates do not use', () => {
		expect(names.filter((name) => !used.has(name))).toEqual([]);
	});

	it('keeps the list sorted and without duplicates', () => {
		expect(names).toEqual([...new Set(names)].sort());
	});
});

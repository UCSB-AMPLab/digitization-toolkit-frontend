// The production image runs `node build` with no node_modules: the Dockerfile's
// runner stage copies only build/ and package.json. adapter-node leaves every
// package under "dependencies" out of the server bundle and imports it from
// node_modules at runtime, so a page that imports one returns 500 whenever it is
// rendered on the server. Every package belongs in devDependencies, which the
// build bundles.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('package.json', () => {
	it('lists no runtime dependencies, since the production image has no node_modules', () => {
		const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
		expect(pkg.dependencies ?? {}).toEqual({});
	});
});

// Every request path in api.ts that reaches a route the backend declares as
// "/" ends with a slash. The expected paths are written out by hand, each
// with the backend declaration it comes from; a literal that names the same
// prefix without the slash fails the second test.
//
// Version: 0.1.0
import { describe, expect, it } from 'vitest';
import source from './api.ts?raw';

// [method, full path, backend declaration]. Cameras' "/" routes (POST and GET
// /cameras/, app/api/cameras.py) are not called from the frontend.
const SLASH_ROUTES: [string, string, string][] = [
	['GET', '/records/', 'app/api/records.py: @router.get("/") under prefix /records (app/main.py)'],
	[
		'POST',
		'/records/',
		'app/api/records.py: @router.post("/") under prefix /records (app/main.py)'
	],
	[
		'GET',
		'/collections/',
		'app/api/collections.py: @router.get("/") under prefix /collections (app/main.py)'
	],
	[
		'POST',
		'/collections/',
		'app/api/collections.py: @router.post("/") under prefix /collections (app/main.py)'
	],
	[
		'GET',
		'/projects/',
		'app/api/projects.py: @router.get("/") under prefix /projects (app/main.py)'
	],
	[
		'POST',
		'/projects/',
		'app/api/projects.py: @router.post("/") under prefix /projects (app/main.py)'
	]
];

// A request path literal: a quoted or template string that begins with the
// path, followed by the end of the string, a query string or a template
// substitution.
const literal = (path: string) =>
	new RegExp("['`]" + path.replace(/\//g, '\\/') + "(?:['`?]|\\$\\{)", 'g');

describe('api.ts request paths', () => {
	it.each(SLASH_ROUTES)('%s %s is requested with its slash (%s)', (_method, path) => {
		expect(source.match(literal(path))?.length ?? 0).toBeGreaterThan(0);
	});

	it.each(['/records', '/collections', '/projects', '/cameras'])(
		'no request path ends at the bare prefix %s',
		(prefix) => {
			const bare = new RegExp("['`]" + prefix.replace(/\//g, '\\/') + "(?:['`?]|\\$\\{)", 'g');
			expect(source.match(bare) ?? []).toEqual([]);
		}
	);
});

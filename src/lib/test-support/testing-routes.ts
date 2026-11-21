// Request recording for the testing account's screens (NEH-391). Used by
// tests only.
//
// ROUTES is the backend's route table (app/core/space_routes.py, ROUTES),
// written out here: every route with whether the testing account is admitted
// to it. `true` is an entry with `testing=True` or a PUBLIC entry (a route
// that needs no session, which the backend leaves to everyone); `false` is
// every other entry, which the backend answers with a 403 for this account.
// Routes the table does not list are refused too, as the backend refuses
// them. A path matches only with the slash the backend declares: `/projects`
// does not reach `/projects/`.
//
// recordRequests() replaces fetch: a request to an admitted route is answered
// by the test's handler for that route (or an empty 200 when the test gives
// none); any other request is answered 403, as the backend answers it, and is
// kept in `refused`, so a test asserts that list is empty.
//
// Version: 0.1.1

import { vi } from 'vitest';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// [method, path template, admitted for the testing account]
export const ROUTES: [Method, string, boolean][] = [
	// FastAPI's documentation routes and the health check: PUBLIC.
	['GET', '/openapi.json', true],
	['GET', '/docs', true],
	['GET', '/docs/oauth2-redirect', true],
	['GET', '/redoc', true],
	['GET', '/health', true],

	// Records and their images.
	['POST', '/records/', true],
	['GET', '/records/', true],
	['GET', '/records/count', true],
	['GET', '/records/to-retake', false],
	['GET', '/records/to-retake/count', false],
	['GET', '/records/to-retake/summary', false],
	['GET', '/records/{rec_id}', true],
	['PATCH', '/records/{rec_id}', true],
	['DELETE', '/records/{rec_id}', true],
	['POST', '/records/{rec_id}/images', true],
	['GET', '/records/{rec_id}/images', true],
	['GET', '/records/images/{img_id}', true],
	['PATCH', '/records/images/{img_id}', true],
	['DELETE', '/records/images/{img_id}', true],
	['GET', '/records/images/{img_id}/file', true],
	['GET', '/records/images/{img_id}/preview', true],
	['GET', '/records/images/{img_id}/thumbnail', true],
	['GET', '/records/{rec_id}/annotations', true],
	['POST', '/records/{rec_id}/annotations', false],
	['DELETE', '/records/annotations/{annotation_id}', false],
	['PATCH', '/records/{rec_id}/status', false],
	['POST', '/records/bulk-status', false],
	['POST', '/records/{rec_id}/reject', false],
	['POST', '/records/{rec_id}/missing-page', true],
	['POST', '/records/{rec_id}/close-missing', true],
	['GET', '/records/{rec_id}/rejections', true],

	// Cameras: the testing account reads them and captures; it changes none of their configuration.
	['GET', '/cameras/devices', true],
	['GET', '/cameras/setup', true],
	['PUT', '/cameras/roles', false],
	['POST', '/cameras/rescan', false],
	['POST', '/cameras/side/{camera_index}', false],
	['GET', '/cameras/capabilities', true],
	['GET', '/cameras/preview/{camera_index}', true],
	['DELETE', '/cameras/preview/tmp', false],
	['GET', '/cameras/focus/{camera_index}', true],
	['POST', '/cameras/focus/{camera_index}', false],
	['POST', '/cameras/focus-lock/{camera_index}', false],
	['DELETE', '/cameras/focus-lock/{camera_index}', false],
	['POST', '/cameras/settings/{camera_index}', false],
	['POST', '/cameras/test-capture/{camera_index}', true],
	['POST', '/cameras/capture', true],
	['POST', '/cameras/capture/dual', true],
	['POST', '/cameras/calibrate', false],
	['POST', '/cameras/calibrate/white-balance', false],
	['POST', '/cameras/calibrate/white-balance/manual', false],
	['GET', '/cameras/dslr/{camera_index}/settings', true],
	['PUT', '/cameras/dslr/{camera_index}/settings', false],
	['PUT', '/cameras/{camera_index}/orientation', false],
	['POST', '/cameras/', false],
	['GET', '/cameras/', false],
	['GET', '/cameras/{id}', false],
	['PUT', '/cameras/settings/{id}', false],
	['DELETE', '/cameras/settings/{id}', false],

	// Projects.
	['POST', '/projects/', true],
	['GET', '/projects/', true],
	['GET', '/projects/{project_id}', true],
	['POST', '/projects/{project_id}/add_record/{rec_id}', true],
	['POST', '/projects/{project_id}/remove_record/{rec_id}', false],
	['PUT', '/projects/{project_id}', true],
	['POST', '/projects/{project_id}/move-collections', true],
	['DELETE', '/projects/{project_id}', true],
	['POST', '/projects/{project_id}/initialize', false],
	['GET', '/projects/{project_id}/records', true],
	['GET', '/projects/{project_id}/members', false],
	['POST', '/projects/{project_id}/members', false],
	['DELETE', '/projects/{project_id}/members/{user_id}', false],

	// Volumes.
	['POST', '/collections/', true],
	['GET', '/collections/', true],
	['GET', '/collections/count', true],
	['GET', '/collections/{collection_id}', true],
	['GET', '/collections/{collection_id}/offsite', false],
	['POST', '/collections/{collection_id}/release-from-unit', false],
	['POST', '/collections/{collection_id}/keep-on-unit', false],
	['GET', '/collections/{collection_id}/offsite/free', false],
	['POST', '/collections/{collection_id}/offsite/free', false],
	['POST', '/collections/{collection_id}/offsite/restore', false],
	['GET', '/collections/{collection_id}/offsite/jobs/{job_id}', false],
	['GET', '/collections/{collection_id}/capture-manifest', false],
	['GET', '/collections/{collection_id}/hierarchy', true],
	['PATCH', '/collections/{collection_id}', true],
	['POST', '/collections/{collection_id}/move-records', true],
	['DELETE', '/collections/{collection_id}', true],
	['PATCH', '/collections/{collection_id}/records/reorder', true],
	['POST', '/collections/{collection_id}/records/missing-opening', true],
	['POST', '/collections/{collection_id}/images/renumber', true],
	['POST', '/collections/{collection_id}/promote', false],
	['POST', '/collections/{collection_id}/take-back', false],
	['GET', '/collections/{collection_id}/status-changes', true],
	['POST', '/collections/{collection_id}/usb-copy', true],
	['GET', '/collections/{collection_id}/usb-copy/status/{job_id}', true],
	['POST', '/collections/{collection_id}/export', false],
	['GET', '/collections/{collection_id}/export/status/{job_id}', false],
	['GET', '/collections/{collection_id}/export/download', false],

	// Sessions and users.
	['GET', '/auth/setup/status', true],
	['POST', '/auth/register', true],
	['POST', '/auth/login', true],
	['POST', '/auth/logout', true],
	['POST', '/auth/refresh', true],
	['POST', '/auth/password-reset', true],
	['GET', '/auth/users', false],
	['GET', '/auth/users/{user_id}', false],
	['PATCH', '/auth/users/{user_id}/role', false],
	['PATCH', '/auth/users/{user_id}/active', false],
	['PUT', '/auth/users/{user_id}/password', false],
	['DELETE', '/auth/users/{user_id}', false],
	['GET', '/users/me', true],

	// The unit.
	['GET', '/system/logs', false],
	['GET', '/system/integrity', false],
	['GET', '/system/temperature', true],
	['GET', '/system/catalogue-backup', false],
	['GET', '/system/unit', true],
	['PUT', '/system/unit', false],
	['GET', '/system/testing', false],
	['PUT', '/system/testing', false],
	['PATCH', '/system/testing/account', false],
	['POST', '/system/testing/clear', false],
	['GET', '/system/testing/usb', true],
	['GET', '/system/pairing', false],
	['POST', '/system/pairing', false],
	['POST', '/system/pairing/renew', false],
	['DELETE', '/system/pairing', false],
	['GET', '/system/storage', false],
	['GET', '/system/storage/freeable', false],
	['GET', '/system/storage/devices', false],
	['POST', '/system/storage/mount', false],
	['DELETE', '/system/storage/mount', false],
	['POST', '/system/storage/activate', false],
	['DELETE', '/system/storage/activate', false],
	['POST', '/system/power', true],

	// Activity totals.
	['GET', '/activity/collections', false],
	['GET', '/activity/daily', false],

	// Digitisation lists.
	['POST', '/imports/digitisation-list', false],
	['GET', '/imports/digitisation-lists', false],
	['PUT', '/imports/digitisation-lists/{list_id}/items/{position}/done', false],
	['GET', '/imports/digitisation-list/{list_id}/report', false],

	['GET', '/fisqua/descriptions', false],

	// The network.
	['GET', '/network/status', true],
	['GET', '/network/wifi', true],
	['GET', '/network/wifi/join', true],
	['POST', '/network/wifi/join', false],
	['DELETE', '/network/wifi/saved/{uuid}', false]
];

const API_BASE = 'http://localhost:8000';

interface CompiledRoute {
	method: Method;
	template: string;
	admitted: boolean;
	pattern: RegExp;
	params: number;
}

const COMPILED: CompiledRoute[] = ROUTES.map(([method, template, admitted]) => ({
	method,
	template,
	admitted,
	pattern: new RegExp(
		'^' + template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+') + '$'
	),
	params: (template.match(/\{/g) ?? []).length
}));

/**
 * The route a request reaches: the template with the fewest parameters among
 * those that match, so a literal path (/records/to-retake) wins over a
 * parameter (/records/{rec_id}), as the backend's routing gives it. The path
 * is matched exactly as sent, trailing slash included, against the template
 * as the backend declares it.
 */
export function routeOf(method: string, path: string): CompiledRoute | null {
	const found = COMPILED.filter((r) => r.method === method.toUpperCase() && r.pattern.test(path));
	found.sort((a, b) => a.params - b.params);
	return found[0] ?? null;
}

export interface RecordedRequest {
	method: string;
	path: string;
	query: URLSearchParams;
	// The route template it reached, or null for a path the table does not list.
	template: string | null;
	body: unknown;
}

export type Handler = (req: RecordedRequest) => Response | unknown | Promise<Response | unknown>;

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A refusal as the backend gives it: an HTTP status and a {code, message} detail. */
export function refusal(status: number, code: string, message = 'Backend text that is never shown.'): Response {
	return json({ detail: { code, message } }, status);
}

function readBody(init: RequestInit | undefined): unknown {
	const raw = init?.body;
	if (typeof raw !== 'string') return raw ?? undefined;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/**
 * Replace fetch for one test. `handlers` is keyed `"METHOD /template"` with
 * the template exactly as in ROUTES (e.g. `"GET /projects/{project_id}"`); a
 * value is a Response, or a function of the request returning a Response or
 * a JSON body. A request to an admitted route with no handler answers 200
 * with `null`.
 */
export function recordRequests(handlers: { [route: string]: Handler | Response | object } = {}) {
	const requests: RecordedRequest[] = [];
	const refused: RecordedRequest[] = [];
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
		const url = new URL(raw, API_BASE);
		const path = url.pathname;
		const route = routeOf(method, path);
		const req: RecordedRequest = { method, path, query: url.searchParams, template: route?.template ?? null, body: readBody(init) };
		requests.push(req);
		if (!route || !route.admitted) {
			refused.push(req);
			return json({ detail: 'Operation not permitted' }, 403);
		}
		const handler = handlers[`${method} ${route.template}`];
		if (handler === undefined) return json(null);
		if (handler instanceof Response) return handler.clone();
		if (typeof handler === 'function') {
			const out = await (handler as Handler)(req);
			return out instanceof Response ? out : json(out);
		}
		return json(handler);
	});
	return {
		spy,
		requests,
		refused,
		/** The requests that reached one route, by its `"METHOD /template"` key. */
		to(route: string): RecordedRequest[] {
			return requests.filter((r) => `${r.method} ${r.template}` === route);
		},
		/** Refused requests as `"METHOD path"`, for a readable failure. */
		refusedList(): string[] {
			return refused.map((r) => `${r.method} ${r.path}`);
		}
	};
}

export type Recorder = ReturnType<typeof recordRequests>;

export const TESTING_USER = { id: 77, username: 'unit-testing', email: null, role: 'testing' as const, is_active: true };

/** The GET /system/unit body the backend gives the testing account. */
export const TESTING_UNIT = {
	mode: 'fisqua',
	projectsEnabled: false,
	projectsShown: true,
	defaultProjectId: null,
	prerequisites: [],
	keptVolumes: []
};

// The route matching of the testing account's request recorder (NEH-391).
//
// Version: 0.1.1
import { describe, expect, it } from 'vitest';
import { routeOf } from './testing-routes';

describe('routeOf', () => {
	it('prefers a literal path to a parameter', () => {
		expect(routeOf('GET', '/records/to-retake/summary')?.admitted).toBe(false);
		expect(routeOf('GET', '/records/to-retake')?.admitted).toBe(false);
		expect(routeOf('GET', '/records/12')?.template).toBe('/records/{rec_id}');
		expect(routeOf('GET', '/collections/count')?.template).toBe('/collections/count');
	});

	it('matches the path exactly as sent, trailing slash included', () => {
		expect(routeOf('GET', '/projects/')?.template).toBe('/projects/');
		expect(routeOf('GET', '/projects')).toBeNull();
		expect(routeOf('POST', '/collections/')?.admitted).toBe(true);
		expect(routeOf('POST', '/collections')).toBeNull();
		expect(routeOf('GET', '/projects/3')?.template).toBe('/projects/{project_id}');
		expect(routeOf('GET', '/projects/3/')).toBeNull();
		expect(routeOf('GET', '/health/')).toBeNull();
	});

	it('refuses what the table refuses and what it does not list', () => {
		expect(routeOf('GET', '/projects/3/members')?.admitted).toBe(false);
		expect(routeOf('GET', '/collections/3/offsite')?.admitted).toBe(false);
		expect(routeOf('PUT', '/cameras/0/orientation')?.admitted).toBe(false);
		expect(routeOf('GET', '/nowhere')).toBeNull();
	});

	it('admits the capture and the camera reads', () => {
		expect(routeOf('POST', '/cameras/capture')?.admitted).toBe(true);
		expect(routeOf('GET', '/cameras/preview/1')?.admitted).toBe(true);
		expect(routeOf('GET', '/records/images/5/file')?.admitted).toBe(true);
	});
});

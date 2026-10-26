import { describe, expect, it } from 'vitest';
import { isKiosk } from './kiosk';

describe('isKiosk', () => {
	it('is true on the kiosk address', () => {
		expect(isKiosk('http://localhost')).toBe(true);
	});

	for (const origin of [
		'http://localhost:5173',
		'http://127.0.0.1',
		'http://captua.local',
		'http://192.168.0.64'
	]) {
		it(`is false on ${origin}`, () => {
			expect(isKiosk(origin)).toBe(false);
		});
	}
});

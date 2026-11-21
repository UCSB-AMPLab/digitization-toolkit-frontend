// The run of preview answers without a frame, counted in seconds for a
// continuous preview and in answers for last-pair mode.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import {
	createNoFrameRun,
	LAST_PAIR_NO_FRAME_ANSWERS,
	NO_FRAME_SECONDS
} from './no-frame-run';

function setup() {
	let t = 1_000_000;
	const run = createNoFrameRun(() => t);
	return {
		run,
		at: (seconds: number) => {
			t = 1_000_000 + seconds * 1000;
		}
	};
}
const timed = { seconds: NO_FRAME_SECONDS };

describe('createNoFrameRun, timed', () => {
	it('is 30 seconds', () => {
		expect(NO_FRAME_SECONDS).toBe(30);
	});

	it('shows nothing below the duration', () => {
		const { run, at } = setup();
		for (let s = 0; s < 30; s += 2) {
			at(s);
			expect(run.noFrame(timed)).toBe(false);
		}
		at(29.9);
		expect(run.noFrame(timed)).toBe(false);
	});

	it('shows at the duration, counted from the first answer without a frame', () => {
		const { run, at } = setup();
		at(5);
		expect(run.noFrame(timed)).toBe(false);
		at(34.9);
		expect(run.noFrame(timed)).toBe(false);
		at(35);
		expect(run.noFrame(timed)).toBe(true);
		at(37);
		expect(run.noFrame(timed)).toBe(true);
	});

	it('starts again from zero after a frame', () => {
		const { run, at } = setup();
		at(0);
		run.noFrame(timed);
		at(20);
		run.noFrame(timed);
		at(22);
		run.frame();
		at(24);
		expect(run.noFrame(timed)).toBe(false);
		at(53.9);
		expect(run.noFrame(timed)).toBe(false);
		at(54);
		expect(run.noFrame(timed)).toBe(true);
	});

	it('starts again from zero after reset', () => {
		const { run, at } = setup();
		at(0);
		run.noFrame(timed);
		at(20);
		run.reset();
		at(40);
		expect(run.noFrame(timed)).toBe(false);
	});

	it('does not show on one stale answer after a long silence', () => {
		const { run, at } = setup();
		at(300);
		expect(run.noFrame(timed)).toBe(false);
		at(302);
		expect(run.noFrame(timed)).toBe(false);
	});

	it('does not show on the first answer even when the clock stood still for long before it', () => {
		const { run, at } = setup();
		at(100);
		run.frame();
		at(500);
		expect(run.noFrame(timed)).toBe(false);
	});

	it('shows when a second answer arrives at or after the duration', () => {
		const { run, at } = setup();
		at(0);
		expect(run.noFrame(timed)).toBe(false);
		at(60);
		expect(run.noFrame(timed)).toBe(true);
	});
});

describe('createNoFrameRun, counted', () => {
	const counted = { answers: LAST_PAIR_NO_FRAME_ANSWERS };

	it('is 3 answers', () => {
		expect(LAST_PAIR_NO_FRAME_ANSWERS).toBe(3);
	});

	it('shows at the third answer whatever the time between them', () => {
		const { run, at } = setup();
		at(0);
		expect(run.noFrame(counted)).toBe(false);
		at(1000);
		expect(run.noFrame(counted)).toBe(false);
		at(1001);
		expect(run.noFrame(counted)).toBe(true);
	});

	it('starts again after a frame', () => {
		const { run } = setup();
		run.noFrame(counted);
		run.noFrame(counted);
		run.frame();
		expect(run.noFrame(counted)).toBe(false);
		expect(run.noFrame(counted)).toBe(false);
		expect(run.noFrame(counted)).toBe(true);
	});
});

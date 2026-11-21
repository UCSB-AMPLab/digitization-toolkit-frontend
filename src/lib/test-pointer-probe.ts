// The checks behind the shared set-up's pointer reset (vitest-setup-client.ts),
// shared by two test files so that one of them runs after the other in the
// same browser page. The probe is a button over the whole test frame with a
// hover colour, so the pointer is over it wherever an earlier test left it.
// Each file starts by finding the probe not hovered, leaves the pointer over
// it, finds it not hovered in its next test, and leaves the pointer over it
// again for the file that follows. At the largest viewport any test sets
// (1920x1080), which a headless run scales to cover the whole runner page, a
// control at each corner and at the centre of the frame is not hovered either.
//
// Version: 0.3.7
import { describe, expect, it, onTestFinished } from 'vitest';
import { page, userEvent } from 'vitest/browser';

const REST = 'rgb(0, 0, 255)';
const HOVER = 'rgb(255, 0, 0)';

function drawProbe(): HTMLButtonElement {
	const style = document.createElement('style');
	style.textContent = `.pointer-probe { position: fixed; inset: 0; border: 0; background-color: ${REST}; }
.pointer-probe:hover { background-color: ${HOVER}; }`;
	const probe = document.createElement('button');
	probe.type = 'button';
	probe.className = 'pointer-probe';
	probe.textContent = 'Probe';
	document.head.append(style);
	document.body.append(probe);
	onTestFinished(() => {
		probe.remove();
		style.remove();
	});
	return probe;
}

// Chromium sets the hover state of an element drawn under a pointer that has
// not moved some frames after layout; this waits well past that.
async function settle(): Promise<void> {
	await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	await new Promise((resolve) => setTimeout(resolve, 300));
}

async function expectNotHovered(): Promise<void> {
	const probe = drawProbe();
	await settle();
	expect(probe.matches(':hover')).toBe(false);
	expect(getComputedStyle(probe).backgroundColor).toBe(REST);
}

async function leavePointerOver(): Promise<void> {
	const probe = drawProbe();
	await userEvent.hover(probe);
	await expect.poll(() => probe.matches(':hover')).toBe(true);
	expect(getComputedStyle(probe).backgroundColor).toBe(HOVER);
}

// The largest viewport any browser test sets.
const LARGEST = { width: 1920, height: 1080 } as const;

async function leavePointerOverLargestFrame(): Promise<void> {
	await page.viewport(LARGEST.width, LARGEST.height);
	await leavePointerOver();
}

// Five small controls: one at each corner of the frame and one at its centre.
async function expectNoSpotHovered(): Promise<void> {
	await page.viewport(LARGEST.width, LARGEST.height);
	const style = document.createElement('style');
	style.textContent = `.pointer-spot { position: fixed; width: 24px; height: 24px; padding: 0; border: 0; background-color: ${REST}; }
.pointer-spot:hover { background-color: ${HOVER}; }`;
	document.head.append(style);
	const places: Record<string, string> = {
		'top left': 'top: 0; left: 0;',
		'top right': 'top: 0; right: 0;',
		'bottom left': 'bottom: 0; left: 0;',
		'bottom right': 'bottom: 0; right: 0;',
		centre: 'top: calc(50% - 12px); left: calc(50% - 12px);'
	};
	const spots = Object.entries(places).map(([name, css]) => {
		const spot = document.createElement('button');
		spot.type = 'button';
		spot.className = 'pointer-spot';
		spot.setAttribute('aria-label', name);
		spot.style.cssText = css;
		document.body.append(spot);
		return [name, spot] as const;
	});
	onTestFinished(() => {
		spots.forEach(([, spot]) => spot.remove());
		style.remove();
	});
	await settle();
	expect(innerWidth).toBe(LARGEST.width);
	expect(innerHeight).toBe(LARGEST.height);
	expect(spots.filter(([, spot]) => spot.matches(':hover')).map(([name]) => name)).toEqual([]);
}

export function pointerResetSuite(name: string): void {
	describe(`the pointer at the start of each test (${name})`, () => {
		it('is not over a control left hovered by the file before', expectNotHovered);
		it('can be left over a control', leavePointerOver);
		it('is not over the control the test before left it on', expectNotHovered);
		it('can be left over a control in a frame at 1920x1080', leavePointerOverLargestFrame);
		it('is not over a control at a corner or the centre of a frame at 1920x1080', expectNoSpotHovered);
		it('is left over a control for the file after', leavePointerOver);
	});
}

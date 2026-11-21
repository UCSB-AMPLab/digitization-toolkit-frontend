// The checks behind the shared set-up's pointer reset (vitest-setup-client.ts),
// shared by two test files so that one of them runs after the other in the
// same browser page. The probe is a button over the whole test frame with a
// hover colour, so the pointer is over it wherever an earlier test left it.
// Each file starts by finding the probe not hovered, leaves the pointer over
// it, finds it not hovered in its next test, and leaves the pointer over it
// again for the file that follows.
//
// Version: 0.3.7
import { describe, expect, it, onTestFinished } from 'vitest';
import { userEvent } from 'vitest/browser';

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

export function pointerResetSuite(name: string): void {
	describe(`the pointer at the start of each test (${name})`, () => {
		it('is not over a control left hovered by the file before', expectNotHovered);
		it('can be left over a control', leavePointerOver);
		it('is not over the control the test before left it on', expectNotHovered);
		it('is left over a control for the file after', leavePointerOver);
	});
}

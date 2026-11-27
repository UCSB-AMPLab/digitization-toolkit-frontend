// A wait for a page's layout to settle, for the tests that measure it. Used by
// tests only.
//
// layoutSettled(selectors) resolves once the fonts are loaded and the boxes of
// every element the selectors match have been the same for three animation
// frames in a row. One timeout covers the whole wait, fonts included: when it
// runs out the call rejects, saying whether the fonts did not load, nothing
// matched a selector or the boxes were still changing, so a control that never
// appears or a layout that never settles fails the test with its own message
// instead of being measured half drawn. Pass the elements the test measures;
// an element that animates without end must not be among them.
//
// Version: 0.4.0

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function boxes(selectors: string[]): string {
	return selectors
		.map((selector) =>
			Array.from(document.querySelectorAll(selector))
				.map((el) => {
					const r = el.getBoundingClientRect();
					return `${r.left},${r.top},${r.width},${r.height}`;
				})
				.join(';')
		)
		.join('|');
}

export function layoutSettled(
	selectors: string[],
	{ stableFrames = 3, timeoutMs = 5000 } = {}
): Promise<void> {
	let stage = 'fonts';
	let expired = false;
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			expired = true;
			const missing = selectors.filter((s) => document.querySelector(s) === null);
			reject(
				new Error(
					stage === 'fonts'
						? `layoutSettled: the fonts were not loaded after ${timeoutMs} ms`
						: missing.length
							? `layoutSettled: nothing matches ${missing.join(', ')} after ${timeoutMs} ms`
							: `layoutSettled: the layout of ${selectors.join(', ')} still changes after ${timeoutMs} ms`
				)
			);
		}, timeoutMs);
	});
	const settle = (async () => {
		await document.fonts.ready;
		stage = 'layout';
		let previous = '';
		let same = 0;
		while (!expired) {
			await nextFrame();
			if (selectors.some((s) => document.querySelector(s) === null)) {
				same = 0;
				previous = '';
				continue;
			}
			const now = boxes(selectors);
			same = now === previous ? same + 1 : 1;
			previous = now;
			if (same >= stableFrames) return;
		}
	})();
	return Promise.race([settle, timeout]).finally(() => clearTimeout(timer));
}

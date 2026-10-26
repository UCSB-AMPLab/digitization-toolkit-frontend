// Closing a modal dialog by Escape and by a click on its backdrop.
//
// Apply `dismissible` to the backdrop element. One listener on the window
// serves every open dialog and hands Escape only to the most recently opened
// one: with a listener per dialog, the dialog underneath would see the same
// keypress once the top one had gone, and close as well.
//
// The listener runs in the capture phase so that the dialog gets Escape
// before page-level handlers (the guided tour, the capture key), and it marks
// the event handled with preventDefault.
//
// Version: 0.1.0-beta

export interface DismissOptions {
	/** Called on Escape or a click on the backdrop. */
	onDismiss: () => void;
	/** False while closing would lose something, such as a job in progress. */
	escape?: boolean;
	/** False for dialogs that a stray tap outside should not close. */
	backdrop?: boolean;
}

interface Entry {
	options: DismissOptions;
}

const open: Entry[] = [];

function onKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape' || event.defaultPrevented) return;
	const top = open[open.length - 1];
	// A top dialog that refuses Escape keeps it from the dialogs underneath.
	if (!top || top.options.escape === false) return;
	event.preventDefault();
	top.options.onDismiss();
}

export function dismissible(node: HTMLElement, options: DismissOptions) {
	const entry: Entry = { options };
	open.push(entry);
	if (open.length === 1) window.addEventListener('keydown', onKeydown, true);

	// Only a click on the backdrop itself: clicks inside the card bubble up
	// to it too.
	function onClick(event: MouseEvent) {
		if (event.target !== node || entry.options.backdrop === false) return;
		entry.options.onDismiss();
	}
	node.addEventListener('click', onClick);

	return {
		update(next: DismissOptions) {
			entry.options = next;
		},
		destroy() {
			node.removeEventListener('click', onClick);
			const i = open.indexOf(entry);
			if (i !== -1) open.splice(i, 1);
			if (open.length === 0) window.removeEventListener('keydown', onKeydown, true);
		}
	};
}

// Moves a dialog to <body>. A `position: fixed` dialog rendered inside a
// stacking context (an element with a z-index, a transform or a filter) is
// painted at that context's level, so the page around it can cover it.
export function toBody(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}

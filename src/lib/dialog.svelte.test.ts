// `dismissible`: Escape goes to the most recently opened dialog only, a
// dialog can refuse it while closing would lose something, and only a click
// on the backdrop itself counts.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissible, trapFocus, type DismissOptions } from './dialog';

const opened: { destroy: () => void }[] = [];

function openDialog(options: Partial<DismissOptions> = {}) {
	const backdrop = document.createElement('div');
	const card = document.createElement('div');
	backdrop.append(card);
	document.body.append(backdrop);
	const onDismiss = vi.fn();
	const action = dismissible(backdrop, { onDismiss, ...options });
	const handle = {
		backdrop,
		card,
		onDismiss,
		update: (next: Partial<DismissOptions>) => action.update({ onDismiss, ...next }),
		destroy: () => {
			action.destroy();
			backdrop.remove();
		}
	};
	opened.push(handle);
	return handle;
}

function pressEscape() {
	const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
	document.body.dispatchEvent(event);
	return event;
}

afterEach(() => {
	while (opened.length) opened.pop()!.destroy();
});

describe('dismissible', () => {
	it('gives Escape to the top dialog only, and marks it handled', () => {
		const lower = openDialog();
		const upper = openDialog();
		const event = pressEscape();
		expect(upper.onDismiss).toHaveBeenCalledTimes(1);
		expect(lower.onDismiss).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	it('gives Escape to the dialog underneath once the top one is gone', () => {
		const lower = openDialog();
		const upper = openDialog();
		upper.destroy();
		pressEscape();
		expect(lower.onDismiss).toHaveBeenCalledTimes(1);
	});

	it('lets a dialog refuse Escape without passing it to the one underneath', () => {
		const lower = openDialog();
		const upper = openDialog({ escape: false });
		const event = pressEscape();
		expect(upper.onDismiss).not.toHaveBeenCalled();
		expect(lower.onDismiss).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);

		upper.update({ escape: true });
		pressEscape();
		expect(upper.onDismiss).toHaveBeenCalledTimes(1);
	});

	it('ignores an Escape that something else has already handled, and other keys', () => {
		const dialog = openDialog();
		const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		handled.preventDefault();
		document.body.dispatchEvent(handled);
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(dialog.onDismiss).not.toHaveBeenCalled();
	});

	it('closes on a click on the backdrop, not on one inside the card', () => {
		const dialog = openDialog();
		dialog.card.click();
		expect(dialog.onDismiss).not.toHaveBeenCalled();
		dialog.backdrop.click();
		expect(dialog.onDismiss).toHaveBeenCalledTimes(1);
	});

	it('keeps the backdrop inert when asked to', () => {
		const dialog = openDialog({ backdrop: false });
		dialog.backdrop.click();
		expect(dialog.onDismiss).not.toHaveBeenCalled();
	});
});

// NEH-339: the camera check is a dialog that opens others over it (the
// details, the full-size viewer, the Refocus dialog). Tab belongs to the top
// one only; the one underneath gets it back once the top one has gone.
describe('trapFocus, one dialog over another', () => {
	function card(labels: string[]) {
		const node = document.createElement('div');
		node.tabIndex = -1;
		for (const label of labels) {
			const b = document.createElement('button');
			b.textContent = label;
			node.append(b);
		}
		document.body.append(node);
		return node;
	}
	const pressTab = (shiftKey = false) => {
		const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
		document.activeElement?.dispatchEvent(event);
		return event;
	};
	const focused = () => document.activeElement?.textContent;

	it('moves Tab inside the top dialog only, without the one underneath pulling it back', () => {
		const lower = card(['a', 'b']);
		const lowerTrap = trapFocus(lower);
		const upper = card(['x', 'y', 'z']);
		const upperTrap = trapFocus(upper);
		expect(focused()).toBe('x');
		// The middle of the upper dialog: the browser moves the focus.
		(upper.children[1] as HTMLElement).focus();
		const middle = pressTab();
		expect(middle.defaultPrevented).toBe(false);
		expect(focused()).toBe('y');
		// The last one wraps to the first of the upper dialog.
		(upper.children[2] as HTMLElement).focus();
		pressTab();
		expect(focused()).toBe('x');
		pressTab(true);
		expect(focused()).toBe('z');

		upperTrap.destroy();
		upper.remove();
		(lower.children[1] as HTMLElement).focus();
		pressTab();
		expect(focused()).toBe('a');
		lowerTrap.destroy();
		lower.remove();
	});
});

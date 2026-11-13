// `dismissible`: Escape goes to the most recently opened dialog only, a
// dialog can refuse it while closing would lose something, and only a click
// on the backdrop itself counts.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { dialogOpen, dialogsAbove, dismissible, openDialogCount, openDialogsOutside, trapFocus, type DismissOptions } from './dialog';

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

// NEH-339: Escape refused key by key. The Refocus dialog leaves to the capture
// key a press that matches it, modifiers included, and closes on any other
// Escape.
describe('dismissible, Escape decided per key press', () => {
	it('asks the predicate for each Escape; a refusal keeps it from the dialog underneath', () => {
		const lower = openDialog();
		const escape = vi.fn((event: KeyboardEvent) => !event.ctrlKey);
		const upper = openDialog({ escape });
		const ctrl = new KeyboardEvent('keydown', { key: 'Escape', ctrlKey: true, bubbles: true, cancelable: true });
		document.body.dispatchEvent(ctrl);
		expect(escape).toHaveBeenCalledWith(ctrl);
		expect(upper.onDismiss).not.toHaveBeenCalled();
		expect(lower.onDismiss).not.toHaveBeenCalled();
		expect(ctrl.defaultPrevented).toBe(false);

		const plain = pressEscape();
		expect(upper.onDismiss).toHaveBeenCalledTimes(1);
		expect(lower.onDismiss).not.toHaveBeenCalled();
		expect(plain.defaultPrevented).toBe(true);
	});

	it('does not ask the predicate about other keys', () => {
		const escape = vi.fn(() => true);
		openDialog({ escape });
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(escape).not.toHaveBeenCalled();
	});
});

// NEH-339: the registry of open dialogs. Both helpers register the dialog
// they are attached to, so the capture screen can wait until none is open
// without listing them.
describe('the open-dialog registry', () => {
	function trapped(withBackdrop: boolean) {
		const backdrop = document.createElement('div');
		const card = document.createElement('div');
		card.tabIndex = -1;
		card.append(document.createElement('button'));
		backdrop.append(card);
		document.body.append(backdrop);
		const trap = trapFocus(card);
		const dismiss = withBackdrop ? dismissible(backdrop, { onDismiss: () => {} }) : null;
		return {
			backdrop,
			destroy() {
				dismiss?.destroy();
				trap.destroy();
				backdrop.remove();
			}
		};
	}

	it('counts a dialog when its action mounts and stops when it is destroyed', () => {
		expect(openDialogCount()).toBe(0);
		const dialog = openDialog();
		expect(openDialogCount()).toBe(1);
		dialog.destroy();
		opened.pop();
		expect(openDialogCount()).toBe(0);
	});

	it('counts nested dialogs one by one, down to none', () => {
		const lower = openDialog();
		const upper = openDialog();
		const third = trapped(false);
		expect(openDialogCount()).toBe(3);
		third.destroy();
		expect(openDialogCount()).toBe(2);
		upper.destroy();
		expect(openDialogCount()).toBe(1);
		lower.destroy();
		expect(openDialogCount()).toBe(0);
		opened.length = 0;
	});

	it('counts once a dialog that uses both helpers, in either order of destruction', () => {
		const one = trapped(true);
		expect(openDialogCount()).toBe(1);
		one.destroy();
		expect(openDialogCount()).toBe(0);
		const two = trapped(true);
		expect(openDialogCount()).toBe(1);
		two.destroy();
		expect(openDialogCount()).toBe(0);
	});

	it('publishes "any dialog open" to subscribers as dialogs open and close', () => {
		const seen: boolean[] = [];
		const stop = dialogOpen.subscribe((value) => seen.push(value));
		expect(get(dialogOpen)).toBe(false);
		const lower = openDialog();
		const upper = trapped(true);
		expect(get(dialogOpen)).toBe(true);
		upper.destroy();
		expect(get(dialogOpen)).toBe(true);
		lower.destroy();
		opened.length = 0;
		expect(get(dialogOpen)).toBe(false);
		stop();
		expect(seen).toEqual([false, true, false]);
	});

	it('counts the dialogs outside the given elements: those that are not the caller\'s own', () => {
		const mine = openDialog();
		expect(openDialogsOutside([mine.backdrop])).toBe(0);
		const other = trapped(true);
		expect(openDialogsOutside([mine.backdrop])).toBe(1);
		expect(openDialogsOutside([mine.backdrop, other.backdrop])).toBe(0);
		expect(openDialogsOutside([null, undefined])).toBe(2);
		other.destroy();
	});

	it('counts the dialogs opened above a given one, wherever they sit in the page, and none below it', () => {
		const lower = openDialog();
		const mine = trapped(true);
		expect(dialogsAbove(mine.backdrop)).toBe(0);
		// An element inside a dialog belongs to that dialog.
		expect(dialogsAbove(mine.backdrop.firstElementChild as HTMLElement)).toBe(0);
		expect(dialogsAbove(lower.backdrop)).toBe(1);
		// A dialog opened later is above, whether it is a sibling in <body> ...
		const sibling = trapped(false);
		expect(dialogsAbove(mine.backdrop)).toBe(1);
		// ... or nested inside this one.
		const nestedBackdrop = document.createElement('div');
		mine.backdrop.firstElementChild!.append(nestedBackdrop);
		const nested = dismissible(nestedBackdrop, { onDismiss: () => {} });
		expect(dialogsAbove(mine.backdrop)).toBe(2);
		expect(dialogsAbove(nestedBackdrop)).toBe(0);
		nested.destroy();
		sibling.destroy();
		expect(dialogsAbove(mine.backdrop)).toBe(0);
		mine.destroy();
		// An element in no open dialog has every open dialog above it.
		expect(dialogsAbove(document.body)).toBe(1);
	});
});

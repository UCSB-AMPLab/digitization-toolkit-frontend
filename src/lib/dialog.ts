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
// Both helpers also register the dialog they are attached to (NEH-339):
// `openDialogCount` and the `dialogOpen` store say whether any dialog is open
// anywhere, so that something that opens by itself (the capture screen's
// focus check) can wait until none is, without a list of which ones to wait
// for. A dialog that uses both helpers counts once. `dialogsAbove` says
// how many were opened over a given one, so that a screen's capture key acts
// only while nothing covers it.
//
// Version: 0.4.0

import { writable, type Readable } from 'svelte/store';

export interface DismissOptions {
	/** Called on Escape or a click on the backdrop. */
	onDismiss: () => void;
	/**
	 * False while closing would lose something, such as a job in progress. A
	 * function decides for each Escape press: false leaves that press to the
	 * page (the Refocus dialog leaves it to an Escape capture key).
	 */
	escape?: boolean | ((event: KeyboardEvent) => boolean);
	/** False for dialogs that a stray tap outside should not close. */
	backdrop?: boolean;
}

interface Entry {
	node: HTMLElement;
	options: DismissOptions;
	/** When it opened, in the order of both stacks together. */
	order: number;
}

const open: Entry[] = [];
// Counts the dialogs opened by either helper, so that each one knows which
// opened after it (`dialogsAbove`).
let opened = 0;

function onKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape' || event.defaultPrevented) return;
	const top = open[open.length - 1];
	// A top dialog that refuses Escape keeps it from the dialogs underneath.
	if (!top) return;
	const escape = top.options.escape;
	if (escape === false || (typeof escape === 'function' && !escape(event))) return;
	event.preventDefault();
	top.options.onDismiss();
}

export function dismissible(node: HTMLElement, options: DismissOptions) {
	const entry: Entry = { node, options, order: ++opened };
	open.push(entry);
	if (open.length === 1) window.addEventListener('keydown', onKeydown, true);
	publish();

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
			publish();
		}
	};
}

// Moves a dialog to <body>. A `position: fixed` dialog rendered inside a
// stacking context (an element with a z-index, a transform or a filter) is
// painted at that context's level, so the page around it can cover it.
// Moving an element drops the focus of a control inside it to <body>, and
// Svelte runs a card's `trapFocus` before its backdrop's `toBody`, so the
// control inside that had the focus gets it back once the node is moved
// (NEH-423).
export function toBody(node: HTMLElement) {
	const active = document.activeElement;
	const held = active instanceof HTMLElement && node.contains(active) ? active : null;
	document.body.appendChild(node);
	if (held && document.activeElement !== held) held.focus();
	return {
		destroy() {
			node.remove();
		}
	};
}

// Keeps the keyboard in a modal dialog, the way HandoverControls does by
// hand: on mount the focus moves to the first enabled control (or to the
// node, which needs tabindex="-1"); Tab and Shift+Tab wrap inside it; on
// destroy the focus goes back to whatever had it before, if that is still
// on the page and enabled. Apply it to the dialog card. aria-modal tells
// assistive technology the rest is inert, but does not stop Tab leaving.
// With one dialog open over another (the camera check's details, viewer and
// Refocus dialog, NEH-339), only the most recently opened one handles Tab,
// as `dismissible` does with Escape; the one underneath takes it back once
// the top one has gone.
// Controls marked `data-always-reachable` (the Reload button of the banner
// for a unit that is not answering) stay in every trap's Tab order, before
// the dialog's first control: Tab from the dialog's last control goes to the
// first of them, Tab from the last of them goes to the dialog's first
// control, and Shift+Tab the other way round. Without such a control on the
// page the trap behaves exactly as before.
const ALWAYS_REACHABLE = '[data-always-reachable]';

/** The enabled controls on the page marked `data-always-reachable`, in page order. */
export function alwaysReachable(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(ALWAYS_REACHABLE)].filter(
		(el) => el.isConnected && !(el as HTMLButtonElement).disabled
	);
}

const FOCUSABLE =
	'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

const traps: HTMLElement[] = [];
const trapOrder = new Map<HTMLElement, number>();

export function trapFocus(node: HTMLElement) {
	traps.push(node);
	trapOrder.set(node, ++opened);
	publish();
	const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	// The Tab stops: of a radio group, only the checked radio (or the first
	// when none is), as the browser does.
	const items = () =>
		[...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
			if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
			const group = [
				...node.querySelectorAll<HTMLInputElement>(
					`input[type="radio"][name="${CSS.escape(el.name)}"]`
				)
			];
			const checked = group.find((r) => r.checked);
			return checked ? el === checked : el === group[0];
		});

	(items()[0] ?? node).focus();

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab' || traps[traps.length - 1] !== node) return;
		const list = items();
		const active = document.activeElement;
		const extra = alwaysReachable().filter((el) => !node.contains(el));
		if (list.length === 0) {
			event.preventDefault();
			const at = extra.indexOf(active as HTMLElement);
			const next = at === -1 ? extra[0] : extra[at + 1];
			(next ?? node).focus();
			return;
		}
		const first = list[0];
		const last = list[list.length - 1];
		const at = extra.indexOf(active as HTMLElement);
		if (at !== -1) {
			event.preventDefault();
			if (event.shiftKey) (at > 0 ? extra[at - 1] : last).focus();
			else (at < extra.length - 1 ? extra[at + 1] : first).focus();
			return;
		}
		const outside = !node.contains(active);
		if (event.shiftKey && (active === first || active === node || outside)) {
			event.preventDefault();
			(extra.length > 0 && !outside ? extra[extra.length - 1] : last).focus();
		} else if (!event.shiftKey && (active === last || outside)) {
			event.preventDefault();
			(extra.length > 0 && !outside ? extra[0] : first).focus();
		}
	}
	// On the window, so that a focus that has escaped is brought back too.
	window.addEventListener('keydown', onKeydown, true);

	return {
		destroy() {
			window.removeEventListener('keydown', onKeydown, true);
			const i = traps.lastIndexOf(node);
			if (i !== -1) traps.splice(i, 1);
			if (!traps.includes(node)) trapOrder.delete(node);
			publish();
			if (returnTo?.isConnected && !(returnTo as HTMLButtonElement).disabled) returnTo.focus();
		}
	};
}

// ---------------------------------------------------------------------------
// The registry of open dialogs (NEH-339)
// ---------------------------------------------------------------------------
// Read from the two stacks above: every `dismissible` backdrop, and every
// `trapFocus` card that is not inside one of those backdrops (a card inside
// a backdrop is the same dialog).
interface OpenDialog {
	node: HTMLElement;
	order: number;
}

function openDialogs(): OpenDialog[] {
	return [
		...open.map((entry) => ({ node: entry.node, order: entry.order })),
		...traps
			.filter((card) => !open.some((entry) => entry.node.contains(card)))
			.map((card) => ({ node: card, order: trapOrder.get(card) ?? 0 }))
	];
}

function openDialogNodes(): HTMLElement[] {
	return openDialogs().map((dialog) => dialog.node);
}

/** How many dialogs are open now, nested ones included. */
export function openDialogCount(): number {
	return openDialogNodes().length;
}

/**
 * How many open dialogs lie outside the given elements: with a component's
 * own dialogs passed, the dialogs that are not its own.
 */
export function openDialogsOutside(own: readonly (Node | null | undefined)[]): number {
	return openDialogNodes().filter((dialog) => !own.some((mine) => mine?.contains(dialog))).length;
}

/**
 * How many open dialogs were opened after the dialog that holds `node` (the
 * innermost open dialog that is or contains it), wherever they sit in the
 * page: zero means that dialog is the top one. For a node in no open dialog,
 * every open dialog counts.
 *
 * A screen's capture key acts only while this is zero for the screen's own
 * dialog, as Escape and Tab go only to the top dialog: whatever is opened
 * over a screen has the keyboard, so no handler underneath can take a
 * capture while a dialog covers it.
 */
export function dialogsAbove(node: Node): number {
	const dialogs = openDialogs();
	const holders = dialogs.filter((dialog) => dialog.node.contains(node));
	if (holders.length === 0) return dialogs.length;
	const mine = Math.max(...holders.map((dialog) => dialog.order));
	return dialogs.filter((dialog) => dialog.order > mine).length;
}

const anyOpen = writable(false);

function publish() {
	anyOpen.set(openDialogCount() > 0);
}

/**
 * True while any dialog is open. A store, as in src/lib/stores, so that a
 * component reads it as `$dialogOpen` in `$derived` and `$effect`.
 */
export const dialogOpen: Readable<boolean> = { subscribe: anyOpen.subscribe };

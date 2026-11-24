// NEH-340: the colour card step on the capture screen. On opening it opens
// a set for the screen's capture mode (POST .../colour-card/sets); the
// operator takes one shot per camera (POST .../sets/{id}/shots), one camera
// at a time, in the order the cameras are shown; each shot is shown with
// "Take again", or, for a RAW shot with no preview, a line that it was
// saved; "Continue" completes the set once every camera has its shot, and
// "Skip" records a skipped request after one confirmation. Each refusal has
// its own message; a shot that times out re-reads what the unit holds. The
// shots take the capture screen's one gate. Nothing dismisses the step, and
// Tab stays in it, the banner's Reload included.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, colourCardApi } from '$lib/api';
import { createCaptureGate } from '$lib/capture-check';
import { readColourCardSet, readColourCardState } from '$lib/colour-card';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { unitNotAnswering } from '$lib/unit-watch';
import UnitNotAnswering from '$lib/components/UnitNotAnswering.svelte';
import '../../app.css';
import ColourCardStep from './ColourCardStep.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

// The fixtures as api.ts hands them over: read from the wire shape.
const shot = (camera_index: number, over: Record<string, unknown> = {}) =>
	readColourCardSet({ id: 0, shots: [rawShot(camera_index, over)] })!.shots[0];
const openSet = (over: Record<string, unknown> = {}) => readColourCardSet(rawSet(over))!;
const state = (raw: Record<string, unknown>) => readColourCardState(raw)!;

function rawShot(camera_index: number, over: Record<string, unknown> = {}) {
	return {
		id: 10 + camera_index,
		camera_index,
		hardware_id: `h${camera_index}`,
		role: null,
		capture_id: `c-${camera_index}`,
		filename: `co-x-cal_01_c${camera_index}.jpg`,
		sha256: 'a'.repeat(64),
		preview_filename: null,
		preview_sha256: null,
		preview: true,
		rotate_deg: 90,
		captured_at: '2026-11-22T10:00:00',
		captured_by: 'operator',
		settings: {},
		url: `/collections/9/colour-card/shots/${10 + camera_index}/preview`,
		...over
	};
}

const cams = [
	{ camera_index: 0, hardware_id: 'h0', role: 'right', settings: {} },
	{ camera_index: 1, hardware_id: 'h1', role: 'left', settings: {} }
];
function rawSet(over: Record<string, unknown> = {}) {
	return {
		id: 5,
		number: 1,
		outcome: null,
		capture_mode: 'dual',
		cameras: cams,
		opened_at: '2026-11-22T09:59:00',
		opened_by: 'operator',
		completed_at: null,
		completed_by: null,
		shots: [],
		delivery: null,
		delivery_reason: null,
		...over
	};
}

function refused(status: number, code?: string) {
	return new ApiError('English', code ? { code, message: 'English' } : undefined, status);
}

// The evidence the step hands the check (its only way to say whether
// shots are still needed), each stamped by the check's clock.
type Evidence = {
	at: number;
	need?: boolean;
	state?: { enabled: boolean; needed: boolean | null };
};
let onEvidence: Mock<(e: Evidence) => boolean>;
// The check's verdict after the latest evidence the test applied.
let needNow = true;
let clock = 0;
const stamps = () => onEvidence.mock.calls.map(([e]) => e.at);
const lastEvidence = () => onEvidence.mock.calls.at(-1)?.[0] ?? null;
let onLeave: Mock<() => void>;

function props(over: Record<string, unknown> = {}) {
	return {
		collectionId: 9,
		captureMode: 'dual' as const,
		leftIndex: 1,
		reason: 'start' as const,
		cameraName: (cam: number) => `camera ${cam + 1}`,
		projectName: 'Rionegro',
		collectionName: 'Tomo 6',
		stamp: () => ++clock,
		onEvidence,
		need: () => needNow,
		onLeave,
		...over
	};
}

const step = () => document.querySelector('[data-colour-card]') as HTMLElement | null;
const card = (cam: number) =>
	document.querySelector(`[data-cc-camera="${cam}"]`) as HTMLElement | null;
const take = (cam: number) =>
	card(cam)?.querySelector<HTMLButtonElement>('button[data-cc-take]') ?? null;
const continueBtn = () => page.getByRole('button', { name: en.cc_continue, exact: true });
const skipBtn = () => page.getByRole('button', { name: en.cc_skip, exact: true });

beforeEach(() => {
	locale.set('en');
	clock = 0;
	needNow = true;
	onEvidence = vi.fn<(e: Evidence) => boolean>(() => true);
	onLeave = vi.fn<() => void>();
	vi.spyOn(colourCardApi, 'shotImageUrl').mockImplementation(
		(_id, s) =>
			`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#${s.capture_id}`
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	unitNotAnswering.set(false);
	document.querySelectorAll('[data-colour-card]').forEach((n) => n.remove());
});

describe('the colour card step', () => {
	it('opens a set for the screen mode, says why, and shows the cameras in the order of the screen', async () => {
		const open = vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)).not.toBeNull();
		expect(open).toHaveBeenCalledWith(9, { capture_mode: 'dual' }, expect.anything());
		expect(step()?.textContent).toContain(en.cc_reason_start);
		const order = [...step()!.querySelectorAll('[data-cc-camera]')].map((c) =>
			c.getAttribute('data-cc-camera')
		);
		expect(order).toEqual(['1', '0']);
		// One camera at a time: the first shown, then the next.
		expect(take(1)?.disabled).toBe(false);
		expect(take(0)?.disabled).toBe(true);
		await expect.element(continueBtn()).toBeDisabled();
	});

	it('a single-camera screen opens a set for camera 0', async () => {
		const open = vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(
			openSet({
				capture_mode: 'single',
				cameras: [{ camera_index: 0, hardware_id: 'h0', role: 'single', settings: {} }]
			}) as never
		);
		render(ColourCardStep, props({ captureMode: 'single', reason: 'settings_changed' }));
		await expect.poll(() => take(0)).not.toBeNull();
		expect(open).toHaveBeenCalledWith(
			9,
			{ capture_mode: 'single', camera_index: 0 },
			expect.anything()
		);
		expect(step()?.textContent).toContain(en.cc_reason_settings_changed);
	});

	it('each shot is shown with Take again; Continue completes the set once every camera has one', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		const takeShot = vi
			.spyOn(colourCardApi, 'takeShot')
			.mockImplementation(async (_c, _s, cam) => shot(cam) as never);
		const complete = vi
			.spyOn(colourCardApi, 'complete')
			.mockResolvedValue(openSet({ outcome: 'taken', shots: [shot(0), shot(1)] }) as never);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => card(1)?.querySelector('img')?.getAttribute('src')).toContain('c-1');
		expect(takeShot).toHaveBeenCalledWith(9, 5, 1, expect.anything());
		expect(take(1)?.textContent).toContain(en.cc_take_again);
		await expect.element(continueBtn()).toBeDisabled();
		await expect.poll(() => take(0)?.disabled).toBe(false);
		take(0)!.click();
		await expect.poll(() => card(0)?.querySelector('img') ?? null).not.toBeNull();
		await expect.element(continueBtn()).toBeEnabled();
		await continueBtn().click();
		await expect.poll(() => onEvidence.mock.calls.length).toBe(1);
		expect(complete).toHaveBeenCalledWith(9, 5, expect.anything());
		expect(lastEvidence()).toMatchObject({ need: false });
		// Stamped when the completion answered, after every stamp taken before.
		expect(lastEvidence()!.at).toBe(clock);
	});

	it('Take again replaces the shot of that camera on screen', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet({ shots: [shot(1)] }) as never);
		vi.spyOn(colourCardApi, 'takeShot').mockResolvedValue(
			shot(1, { capture_id: 'c-again' }) as never
		);
		render(ColourCardStep, props());
		await expect.poll(() => card(1)?.querySelector('img')?.getAttribute('src')).toContain('c-1');
		take(1)!.click();
		await expect
			.poll(() => card(1)?.querySelector('img')?.getAttribute('src'))
			.toContain('c-again');
	});

	it('a RAW shot without a preview says it was saved and cannot be shown here', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		vi.spyOn(colourCardApi, 'takeShot').mockResolvedValue(
			shot(1, { filename: 'co-x-cal_01_c1.cr2', preview: false }) as never
		);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => card(1)?.textContent).toContain(en.cc_shot_raw);
		expect(card(1)?.querySelector('img')).toBeNull();
		expect(take(1)?.textContent).toContain(en.cc_take_again);
	});

	it('Skip asks once, says what it means, and records a skipped request', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		const skip = vi
			.spyOn(colourCardApi, 'skip')
			.mockResolvedValue(openSet({ outcome: 'skipped' }) as never);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)).not.toBeNull();
		await skipBtn().click();
		const confirm = page.getByRole('dialog', { name: en.cc_skip_title });
		await expect.element(confirm.getByText(en.cc_skip_body)).toBeVisible();
		await confirm.getByRole('button', { name: en.common_cancel }).click();
		await expect.element(confirm).not.toBeInTheDocument();
		expect(skip).not.toHaveBeenCalled();
		await skipBtn().click();
		await page.getByRole('button', { name: en.cc_skip_confirm }).click();
		await expect.poll(() => onEvidence.mock.calls.length).toBe(1);
		expect(lastEvidence()).toMatchObject({ need: false });
		expect(skip).toHaveBeenCalledWith(9, { capture_mode: 'dual' }, expect.anything());
	});

	it('a camera that failed to take the shot says so, and that camera can try again', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		const takeShot = vi
			.spyOn(colourCardApi, 'takeShot')
			.mockRejectedValueOnce(refused(502, 'colour_card_capture_failed'))
			.mockResolvedValueOnce(shot(1) as never);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.element(page.getByText(en.cc_err_capture_failed('camera 2'))).toBeVisible();
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => card(1)?.querySelector('img') ?? null).not.toBeNull();
		expect(takeShot).toHaveBeenCalledTimes(2);
		await expect
			.element(page.getByText(en.cc_err_capture_failed('camera 2')))
			.not.toBeInTheDocument();
	});

	for (const [what, error, text] of [
		['a camera busy', refused(409, 'camera_busy'), en.cc_err_camera_busy],
		[
			'a camera not connected',
			refused(409, 'camera_not_connected'),
			en.cc_err_not_connected('camera 2')
		],
		[
			'a restart in progress',
			refused(503, 'backend_restarting'),
			en.camera_kind_refused_backend_restarting
		],
		['the storage nearly full', refused(507, 'storage_reserve'), en.lv_err_storage_reserve],
		['any other failure', refused(500), en.cc_err_failed]
	] as const) {
		it(`${what} has its own message`, async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
			vi.spyOn(colourCardApi, 'takeShot').mockRejectedValue(error);
			render(ColourCardStep, props());
			await expect.poll(() => take(1)?.disabled).toBe(false);
			take(1)!.click();
			await expect.element(page.getByText(text)).toBeVisible();
			await expect.poll(() => take(1)?.disabled).toBe(false);
		});
	}

	it('a shot that times out: the step reads what the unit holds and shows it', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		vi.spyOn(colourCardApi, 'takeShot').mockRejectedValue(new DOMException('x', 'TimeoutError'));
		const read = vi.spyOn(colourCardApi, 'state').mockResolvedValue(
			state({
				enabled: true,
				needed: true,
				reason: 'start',
				status: 'none',
				sets: [rawSet({ shots: [rawShot(1, { capture_id: 'c-stored' })] })]
			}) as never
		);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.element(page.getByText(en.cc_err_timeout)).toBeVisible();
		await expect
			.poll(() => card(1)?.querySelector('img')?.getAttribute('src'))
			.toContain('c-stored');
		expect(read).toHaveBeenCalledWith(9, { readCameras: true }, expect.anything());
	});

	it('a set finished on another screen, then the settings changed: the step stays up with a fresh set and the new reason', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const open = vi
			.spyOn(colourCardApi, 'openSet')
			.mockResolvedValueOnce(openSet() as never)
			.mockResolvedValueOnce(openSet({ id: 6, number: 2 }) as never);
		vi.spyOn(colourCardApi, 'takeShot').mockRejectedValue(refused(409, 'colour_card_set_closed'));
		vi.spyOn(colourCardApi, 'state').mockResolvedValue(
			state({
				enabled: true,
				needed: true,
				reason: 'settings_changed',
				status: 'present',
				sets: [rawSet({ outcome: 'taken', shots: [rawShot(0), rawShot(1)] })]
			}) as never
		);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => open.mock.calls.length).toBe(2);
		await expect.poll(() => step()?.textContent).toContain(en.cc_reason_settings_changed);
		await expect.poll(() => take(1)?.disabled).toBe(false);
		expect(step()?.textContent).not.toContain(en.cc_reason_start);
		// The recovery answer goes to the check, stamped when its read started.
		expect(lastEvidence()?.state).toMatchObject({ enabled: true, needed: true });
	});

	it('a recovery answer the check drops as older is not acted on: no further set is opened', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const open = vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		vi.spyOn(colourCardApi, 'takeShot').mockRejectedValue(refused(409, 'colour_card_set_closed'));
		vi.spyOn(colourCardApi, 'state').mockResolvedValue(
			state({
				enabled: true,
				needed: true,
				reason: 'settings_changed',
				status: 'present',
				sets: [rawSet({ outcome: 'taken', shots: [rawShot(0), rawShot(1)] })]
			}) as never
		);
		// Newer evidence ("not needed") was applied first: this answer is dropped.
		onEvidence.mockImplementation(() => false);
		needNow = false;
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => onEvidence.mock.calls.length).toBe(1);
		// The step's request has ended: its buttons are usable again.
		await expect.poll(() => take(1)?.disabled).toBe(false);
		expect(open).toHaveBeenCalledTimes(1);
		expect(step()?.textContent).not.toContain(en.cc_reason_settings_changed);
	});

	it('a recovery read that says needed is not known hands that answer to the check, and decides nothing itself', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		vi.spyOn(colourCardApi, 'takeShot').mockRejectedValue(new DOMException('x', 'TimeoutError'));
		vi.spyOn(colourCardApi, 'state').mockResolvedValue(
			state({
				enabled: true,
				needed: null,
				reason: null,
				status: 'none',
				sets: [rawSet()]
			}) as never
		);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => onEvidence.mock.calls.length).toBe(1);
		expect(lastEvidence()?.state).toMatchObject({ needed: null });
		expect(step()).not.toBeNull();
	});

	it('a set finished on another screen: the step reads the unit again and hands the answer to the check', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		vi.spyOn(colourCardApi, 'takeShot').mockRejectedValue(refused(409, 'colour_card_set_closed'));
		vi.spyOn(colourCardApi, 'state').mockResolvedValue(
			state({
				enabled: true,
				needed: false,
				reason: null,
				status: 'present',
				sets: [rawSet({ outcome: 'taken', shots: [rawShot(0), rawShot(1)] })]
			}) as never
		);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)?.disabled).toBe(false);
		take(1)!.click();
		await expect.poll(() => onEvidence.mock.calls.length).toBe(1);
		expect(lastEvidence()?.state).toMatchObject({ needed: false });
		// Stamped when the recovery read started, before the refusal's answer was handled.
		expect(stamps()[0]).toBeLessThanOrEqual(clock);
	});

	it('the setting turned off meanwhile: the refusal goes to the check as "not needed"', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(colourCardApi, 'openSet').mockRejectedValue(refused(409, 'colour_card_not_enabled'));
		render(ColourCardStep, props());
		await expect.poll(() => onEvidence.mock.calls.length).toBe(1);
		expect(lastEvidence()).toMatchObject({ need: false });
	});

	it('a volume deleted meanwhile says so, and the operator can only leave', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(colourCardApi, 'openSet').mockRejectedValue(refused(404));
		render(ColourCardStep, props());
		await expect.element(page.getByText(en.cc_err_volume_gone)).toBeVisible();
		await expect.element(skipBtn()).not.toBeInTheDocument();
		await page.getByRole('button', { name: en.camwhich_leave }).click();
		expect(onLeave).toHaveBeenCalledTimes(1);
	});

	it('a set that could not be opened offers Retry', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const open = vi
			.spyOn(colourCardApi, 'openSet')
			.mockRejectedValueOnce(refused(500))
			.mockResolvedValueOnce(openSet() as never);
		render(ColourCardStep, props());
		await page.getByRole('button', { name: en.common_retry }).click();
		await expect.poll(() => take(1)).not.toBeNull();
		expect(open).toHaveBeenCalledTimes(2);
	});

	it('the shots take the capture screen gate, and wait while something else holds it', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		const answer = deferred<never>();
		const takeShot = vi.spyOn(colourCardApi, 'takeShot').mockReturnValue(answer.promise);
		const gate = createCaptureGate();
		render(ColourCardStep, props({ captureGate: gate }));
		await expect.poll(() => take(1)?.disabled).toBe(false);
		const release = gate.acquire('capture')!;
		take(1)!.click();
		await expect.element(page.getByText(en.cc_err_busy)).toBeVisible();
		expect(takeShot).not.toHaveBeenCalled();
		release();
		take(1)!.click();
		await expect.poll(() => takeShot.mock.calls.length).toBe(1);
		expect(gate.isBusy()).toBe(true);
		await expect.element(page.getByText(en.cc_taking)).toBeVisible();
		answer.resolve(shot(1) as never);
		await expect.poll(() => gate.isBusy()).toBe(false);
	});

	it('an answer that arrives after the step has gone does nothing', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(
			openSet({ shots: [shot(0), shot(1)] }) as never
		);
		const answer = deferred<never>();
		vi.spyOn(colourCardApi, 'complete').mockReturnValue(answer.promise);
		const screen = render(ColourCardStep, props());
		await expect.element(continueBtn()).toBeEnabled();
		await continueBtn().click();
		screen.unmount();
		answer.resolve(openSet({ outcome: 'taken' }) as never);
		await answer.promise;
		await new Promise<void>((r) => setTimeout(r, 0));
		expect(onEvidence).not.toHaveBeenCalled();
	});

	it('nothing dismisses it: Escape does nothing', async () => {
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet() as never);
		render(ColourCardStep, props());
		await expect.poll(() => take(1)).not.toBeNull();
		await userEvent.keyboard('{Escape}');
		expect(step()).not.toBeNull();
		expect(onEvidence).not.toHaveBeenCalled();
	});

	it('Tab stays inside the step, and reaches the banner Reload', async () => {
		const onReload = vi.fn();
		unitNotAnswering.set(true);
		render(UnitNotAnswering, { props: { onReload } });
		vi.spyOn(colourCardApi, 'openSet').mockResolvedValue(openSet({ shots: [shot(1)] }) as never);
		render(ColourCardStep, props());
		await expect.poll(() => take(0)?.disabled).toBe(false);
		const reload = page.getByRole('button', { name: en.unit_not_answering_reload }).element();
		const seen = new Set<Element>();
		for (let i = 0; i < 12; i++) {
			await userEvent.keyboard('{Tab}');
			const active = document.activeElement!;
			seen.add(active);
			expect(step()!.contains(active) || active === reload).toBe(true);
		}
		expect(seen.has(reload)).toBe(true);
		expect(seen.has(take(1)!)).toBe(true);
		expect(seen.has(take(0)!)).toBe(true);
		expect(seen.has(skipBtn().element())).toBe(true);
	});
});

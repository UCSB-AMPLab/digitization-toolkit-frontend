// NEH-420: the notice for a move of captures the unit could not settle, from
// GET /system/adoption (app/core/adopt_repair.py report), with Repair
// (POST /system/adoption/repair). Each state for an administrator; nothing
// for `{unfinished: null}` or a 403; the operator's line on an affected
// volume, and nothing for an operator on the Overview.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, systemApi, type UnfinishedAdoptionReport } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { es } from '$lib/i18n/es';
import type { Scheduler } from '$lib/repeat-read';
import AdoptionNotice from './AdoptionNotice.svelte';

// A scheduler the test fires by hand (repeat-read.ts).
function manual(): Scheduler & { fire(): void; pending(): number } {
	const queue = new Map<number, () => void>();
	let n = 0;
	return {
		setTimeout(fn) {
			queue.set(++n, fn);
			return n;
		},
		clearTimeout(h) {
			queue.delete(h as number);
		},
		fire() {
			const due = [...queue.values()];
			queue.clear();
			due.forEach((f) => f());
		},
		pending: () => queue.size
	};
}

const S = 'Ensayo de origen';
const T = 'Volumen 007';
const FILE = 'src-img_0003_c1.cr2';

function report(over: Record<string, unknown> = {}): UnfinishedAdoptionReport {
	return {
		unfinished: {
			source: { id: 1, name: S, filename_stem: 'src' },
			target: { id: 2, name: T, filename_stem: 'tgt' },
			run_id: 'run-1',
			state: 'blocked',
			reason: 'file_at_neither_path',
			missing: [
				{ kind: 'master', name: FILE, repairable: true, why_not: null, needs_storage: true }
			],
			repair_available: true,
			repair_refusal: null,
			...over
		} as UnfinishedAdoptionReport['unfinished']
	};
}

const refused = (status: number, detail: unknown) => new ApiError('refused', detail, status);

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

const notice = () => document.querySelector<HTMLElement>('[data-adoption-notice]');
const shown = () => notice()?.textContent?.replace(/\s+/g, ' ') ?? '';
const repairButton = () =>
	[...(notice()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
		(b) => b.textContent?.trim() === es.unsettled_repair
	) ?? null;

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

describe('AdoptionNotice', () => {
	let getSpy: ReturnType<typeof vi.spyOn>;
	let repairSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		getSpy = vi.spyOn(systemApi, 'getUnfinishedAdoption');
		repairSpy = vi.spyOn(systemApi, 'repairAdoption');
	});
	afterEach(() => {
		vi.restoreAllMocks();
		authStore.clearSession();
	});

	it('blocked with a repair: what happened, the missing file, what is held, and Repair', async () => {
		signIn('admin');
		getSpy.mockResolvedValue(report());
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		expect(shown()).toContain(es.unsettled_heading);
		expect(shown()).toContain(es.unsettled_what(S, T));
		expect(shown()).toContain(es.unsettled_missing(FILE));
		expect(shown()).toContain(es.unsettled_blocked(S, T));
		expect(shown()).toContain(es.unsettled_repair_desc);
		expect(shown()).not.toContain(es.unsettled_no_repair);
	});

	it('blocked without a repair: whom to ask, and no button', async () => {
		signIn('admin');
		getSpy.mockResolvedValue(report({ repair_available: false, repair_refusal: 'no_read_remote' }));
		render(AdoptionNotice);
		await expect.poll(shown).toContain(es.unsettled_no_repair);
		expect(repairButton()).toBeNull();
		expect(shown()).not.toContain(es.unsettled_repair_desc);
		expect(shown()).toContain(es.unsettled_blocked(S, T));
	});

	it('blocked on a file never uploaded: names it, then whom to ask', async () => {
		signIn('admin');
		getSpy.mockResolvedValue(
			report({
				repair_available: false,
				repair_refusal: 'files_not_repairable',
				missing: [
					{
						kind: 'buffer',
						name: 'a.raw',
						repairable: false,
						why_not: 'never_uploaded',
						needs_storage: false
					}
				]
			})
		);
		render(AdoptionNotice);
		await expect.poll(shown).toContain(es.unsettled_err_never_copied('a.raw'));
		expect(shown()).toContain(es.unsettled_no_repair);
		expect(repairButton()).toBeNull();
	});

	it('recovering: Captua is repairing, no button', async () => {
		signIn('admin');
		getSpy.mockResolvedValue(
			report({ state: 'recovering', repair_available: false, repair_refusal: 'adoption_running' })
		);
		render(AdoptionNotice);
		await expect.poll(shown).toContain(es.unsettled_repairing);
		expect(repairButton()).toBeNull();
		expect(shown()).not.toContain(es.unsettled_no_repair);
	});

	it('repairing, then finished: the line while it runs, the result, and gone after the next read', async () => {
		signIn('admin');
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report())
			.mockResolvedValue({ unfinished: null });
		const running = deferred<{ result: 'finished' }>();
		repairSpy.mockImplementationOnce(() => running.promise);
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.unsettled_repairing);
		expect(repairButton()).toBeNull();
		expect(shown()).not.toContain(es.unsettled_repair_desc);
		running.resolve({ result: 'finished' });
		await expect.poll(shown).toContain(es.unsettled_done_finished(T));
		// Read just before the repair and again after it; the result stays until the read after that.
		await expect.poll(() => getSpy.mock.calls.length).toBe(3);
		expect(shown()).toContain(es.unsettled_done_finished(T));
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => getSpy.mock.calls.length).toBe(4);
		await expect.poll(notice).toBeNull();
	});

	it('undone: says the captures are back in the source', async () => {
		signIn('admin');
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report())
			.mockResolvedValue({ unfinished: null });
		repairSpy.mockResolvedValue({ result: 'reverted' });
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.unsettled_done_undone(S));
	});

	for (const [name, detail, sentence] of [
		[
			'a checksum that differs',
			{ code: 'repair_digest_mismatch', message: 'E', file: { path: `/p/src/captures/${FILE}` } },
			es.unsettled_err_mismatch(FILE)
		],
		[
			'a file not in the offsite copy',
			{ code: 'repair_object_missing', message: 'E', file: { path: `/p/src/captures/${FILE}` } },
			es.unsettled_err_absent(FILE)
		],
		[
			'a file never uploaded',
			{
				code: 'repair_not_possible',
				reason: 'files_not_repairable',
				message: 'E',
				missing: [{ name: 'a.raw', why_not: 'never_uploaded' }]
			},
			es.unsettled_err_never_copied('a.raw')
		],
		['anything else', { code: 'repair_unavailable', message: 'E' }, es.unsettled_no_repair]
	] as const) {
		it(`a failed repair (${name}) says why and keeps Repair while the report offers it`, async () => {
			signIn('admin');
			getSpy.mockResolvedValue(report());
			repairSpy.mockRejectedValue(refused(409, detail));
			render(AdoptionNotice);
			await expect.poll(repairButton).not.toBeNull();
			repairButton()!.click();
			await expect.poll(shown).toContain(sentence);
			await expect.poll(() => getSpy.mock.calls.length).toBe(3);
			await expect.poll(repairButton).not.toBeNull();
		});
	}

	it('nothing for {unfinished: null}', async () => {
		signIn('admin');
		getSpy.mockResolvedValue({ unfinished: null });
		const onState = vi.fn();
		render(AdoptionNotice, { onRead: onState });
		await expect.poll(() => onState.mock.calls.length).toBe(1);
		expect(onState).toHaveBeenCalledWith({ kind: 'none', running: null });
		expect(notice()).toBeNull();
	});

	it('a 403 on the initial read offers manual Retry', async () => {
		signIn('admin');
		getSpy.mockRejectedValue(refused(403, 'Not enough permissions'));
		const onState = vi.fn();
		render(AdoptionNotice, { onRead: onState });
		await expect.poll(() => onState.mock.calls.length).toBe(1);
		expect(onState).toHaveBeenCalledWith({ kind: 'failed', refused: 403 });
		expect(shown()).toContain(es.common_retry);
	});

	it('an operator on an affected volume reads one line, and the route is never asked', async () => {
		signIn('operator');
		render(AdoptionNotice, { onVolume: true, named: true });
		await expect.poll(shown).toContain(es.unsettled_operator);
		expect(shown()).not.toContain(es.unsettled_heading);
		expect(getSpy).not.toHaveBeenCalled();
	});

	it('an operator on the Overview sees nothing, and the route is never asked', async () => {
		signIn('operator');
		const screen = render(AdoptionNotice);
		await expect.element(screen.container).toBeInTheDocument();
		expect(notice()).toBeNull();
		expect(getSpy).not.toHaveBeenCalled();
	});

	it('the sentence after a repair names the volumes of the report read just before it was sent', async () => {
		signIn('admin');
		const fresh = report();
		fresh.unfinished!.source = { id: 3, name: 'Otro origen', filename_stem: 'o' };
		fresh.unfinished!.target = { id: 4, name: 'Otro destino', filename_stem: 'd' };
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(fresh)
			.mockResolvedValue({ unfinished: null });
		repairSpy.mockResolvedValue({ result: 'finished' });
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.unsettled_done_finished('Otro destino'));
		expect(shown()).not.toContain(T);
	});

	it('no repair is sent when the report read just before it no longer offers one', async () => {
		signIn('admin');
		getSpy.mockResolvedValueOnce(report()).mockResolvedValue({ unfinished: null });
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(notice).toBeNull();
		expect(repairSpy).not.toHaveBeenCalled();
	});

	it('while the unit says recovering, reads again on the interval until the state changes, and stops when destroyed', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy
			.mockResolvedValueOnce(report({ state: 'recovering', repair_available: false }))
			.mockResolvedValue(report());
		const screen = render(AdoptionNotice, { scheduler });
		await expect.poll(shown).toContain(es.unsettled_repairing);
		await expect.poll(() => scheduler.pending()).toBe(1);
		scheduler.fire();
		await expect.poll(repairButton).not.toBeNull();
		expect(getSpy).toHaveBeenCalledTimes(2);
		expect(scheduler.pending()).toBe(0);
		screen.unmount();
	});

	it('a repair whose answer was lost: repairing, read again until the unit says otherwise', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report({ state: 'recovering', repair_available: false }))
			.mockResolvedValue({ unfinished: null });
		repairSpy.mockRejectedValue(new TypeError('Failed to fetch'));
		const screen = render(AdoptionNotice, { scheduler });
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(() => getSpy.mock.calls.length).toBe(3);
		await expect.poll(() => scheduler.pending()).toBe(1);
		expect(shown()).toContain(es.unsettled_repairing);
		expect(shown()).not.toContain(es.unsettled_no_repair);
		scheduler.fire();
		await expect.poll(notice).toBeNull();
		expect(scheduler.pending()).toBe(0);
		screen.unmount();
	});

	it('the interval ends with the component', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy.mockResolvedValue(report({ state: 'recovering', repair_available: false }));
		const screen = render(AdoptionNotice, { scheduler });
		await expect.poll(() => scheduler.pending()).toBe(1);
		screen.unmount();
		expect(scheduler.pending()).toBe(0);
	});

	it('a failed read keeps what is on screen', async () => {
		signIn('admin');
		const onState = vi.fn();
		getSpy.mockResolvedValueOnce(report()).mockRejectedValue(new TypeError('Failed to fetch'));
		render(AdoptionNotice, { onRead: onState });
		await expect.poll(repairButton).not.toBeNull();
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => onState.mock.calls.length).toBe(2);
		expect(onState).toHaveBeenLastCalledWith({ kind: 'failed' });
		expect(shown()).toContain(es.unsettled_what(S, T));
		expect(repairButton()).not.toBeNull();
	});

	it('an answer that is not the report is a failed read too', async () => {
		signIn('admin');
		const onState = vi.fn();
		getSpy.mockResolvedValueOnce(report()).mockResolvedValue({ something: 'else' } as never);
		render(AdoptionNotice, { onRead: onState });
		await expect.poll(repairButton).not.toBeNull();
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => onState.mock.calls.length).toBe(2);
		expect(onState).toHaveBeenLastCalledWith({ kind: 'failed' });
		expect(repairButton()).not.toBeNull();
	});

	it('while recovering, a failed read keeps the state and the repeat goes on', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy
			.mockResolvedValueOnce(report({ state: 'recovering', repair_available: false }))
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValue(report());
		render(AdoptionNotice, { scheduler });
		await expect.poll(() => scheduler.pending()).toBe(1);
		scheduler.fire();
		await expect.poll(() => getSpy.mock.calls.length).toBe(2);
		await expect.poll(() => scheduler.pending()).toBe(1);
		expect(shown()).toContain(es.unsettled_repairing);
		scheduler.fire();
		await expect.poll(repairButton).not.toBeNull();
	});

	it('a failed read just before the repair sends nothing and leaves the notice and Repair', async () => {
		signIn('admin');
		getSpy.mockResolvedValueOnce(report()).mockRejectedValue(new TypeError('Failed to fetch'));
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(() => getSpy.mock.calls.length).toBe(2);
		await expect.poll(repairButton).not.toBeNull();
		expect(repairSpy).not.toHaveBeenCalled();
		expect(shown()).toContain(es.unsettled_repair_desc);
		expect(shown()).not.toContain(es.unsettled_repairing);
	});

	it('the repair is sent for the run displayed, named by its run id', async () => {
		signIn('admin');
		getSpy
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValue({ unfinished: null, running: null });
		repairSpy.mockResolvedValue({ result: 'finished' });
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(() => repairSpy.mock.calls.length).toBe(1);
		expect(repairSpy).toHaveBeenCalledWith('run-1');
	});

	it('a read before the repair that names another run sends nothing; the new run shows, and a second press sends it', async () => {
		signIn('admin');
		const other = report({ run_id: 'run-2' });
		other.unfinished!.target = { id: 9, name: 'Volumen de prueba C', filename_stem: 'c' };
		getSpy
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValueOnce(other)
			.mockResolvedValueOnce(other)
			.mockResolvedValue({ unfinished: null, running: null });
		repairSpy.mockResolvedValue({ result: 'finished' });
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.unsettled_what(S, 'Volumen de prueba C'));
		await expect.poll(repairButton).not.toBeNull();
		expect(repairSpy).not.toHaveBeenCalled();
		repairButton()!.click();
		await expect.poll(() => repairSpy.mock.calls.length).toBe(1);
		expect(repairSpy).toHaveBeenCalledWith('run-2');
	});

	it('a read before the repair that names no run sends nothing', async () => {
		signIn('admin');
		getSpy
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValue({ unfinished: null, running: null });
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(notice).toBeNull();
		expect(repairSpy).not.toHaveBeenCalled();
	});

	it('a failure sentence is dropped when the next report names another run', async () => {
		signIn('admin');
		const other = report({ run_id: 'run-2' });
		other.unfinished!.target = { id: 9, name: 'Volumen de prueba C', filename_stem: 'c' };
		getSpy
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValue(other);
		repairSpy.mockRejectedValue(
			refused(409, {
				code: 'repair_digest_mismatch',
				message: 'E',
				file: { path: `/p/src/captures/${FILE}` }
			})
		);
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(() => getSpy.mock.calls.length).toBe(3);
		await expect.poll(shown).toContain(es.unsettled_what(S, 'Volumen de prueba C'));
		expect(shown()).not.toContain(es.unsettled_err_mismatch(FILE));
	});

	it('an idle ordinary volume becomes named after an interruption and immediately shows Repair', async () => {
		signIn('admin');
		const scheduler = manual();
		const onRead = vi.fn();
		getSpy.mockResolvedValueOnce({ unfinished: null, running: null }).mockResolvedValue(report());
		const screen = render(AdoptionNotice, {
			onVolume: true,
			volumeId: 1,
			named: false,
			scheduler,
			onRead
		});
		await expect.poll(() => onRead.mock.calls.length).toBe(1);
		expect(notice()).toBeNull();
		expect(scheduler.pending()).toBe(0);
		// The layout's onUnfinished callback changes this prop after the move ends.
		await screen.rerender({ named: true });
		await expect.poll(repairButton).not.toBeNull();
		expect(getSpy).toHaveBeenCalledTimes(2);
		expect(shown()).toContain(es.unsettled_what(S, T));
	});

	it('the local move ending refreshes a notice whose named flag was already true', async () => {
		signIn('admin');
		const scheduler = manual();
		const onRead = vi.fn();
		getSpy.mockResolvedValueOnce({ unfinished: null, running: null }).mockResolvedValue(report());
		const screen = render(AdoptionNotice, {
			onVolume: true,
			volumeId: 1,
			named: true,
			quietRunning: true,
			scheduler,
			onRead
		});
		await expect.poll(() => onRead.mock.calls.length).toBe(1);
		expect(notice()).toBeNull();
		await screen.rerender({ quietRunning: false });
		await expect.poll(repairButton).not.toBeNull();
		expect(getSpy).toHaveBeenCalledTimes(2);
	});

	it('a layout interruption notification during a read is queued without overlap', async () => {
		signIn('admin');
		const old = deferred<UnfinishedAdoptionReport>();
		getSpy.mockImplementationOnce(() => old.promise).mockResolvedValue(report());
		const screen = render(AdoptionNotice, { onVolume: true, volumeId: 1 });
		await expect.poll(() => getSpy.mock.calls.length).toBe(1);
		await screen.rerender({ named: true });
		expect(getSpy).toHaveBeenCalledTimes(1);
		old.resolve({ unfinished: null, running: null });
		await expect.poll(repairButton).not.toBeNull();
		expect(getSpy).toHaveBeenCalledTimes(2);
	});

	it('a repair answer naming other volumes than the run it was sent for is not applied', async () => {
		signIn('admin');
		getSpy
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValueOnce(report({ run_id: 'run-1' }))
			.mockResolvedValue({ unfinished: null, running: null });
		repairSpy.mockResolvedValue({
			result: 'finished',
			source: { id: 98, name: 'Otro', filename_stem: 'o' },
			target: { id: 99, name: 'Otro destino', filename_stem: 'd' }
		});
		const onRead = vi.fn();
		render(AdoptionNotice, { onRead });
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(() => onRead.mock.calls.length).toBe(3);
		await expect.poll(notice).toBeNull();
		expect(shown()).not.toContain(es.unsettled_done_finished('Otro destino'));
	});

	it("the sentence after a repair names the volumes of the repair's own answer", async () => {
		signIn('admin');
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report())
			.mockResolvedValue({ unfinished: null, running: null });
		repairSpy.mockResolvedValue({
			result: 'finished',
			// The same volumes as the run's, named as they are now.
			source: { id: 1, name: 'Volumen de prueba A', filename_stem: 'a' },
			target: { id: 2, name: 'Volumen de prueba B', filename_stem: 'b' }
		});
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.unsettled_done_finished('Volumen de prueba B'));
	});

	it('journal_changed: the report is read again and shows what is true now, with no failure sentence', async () => {
		signIn('admin');
		const now = report({
			run_id: 'run-9',
			repair_available: false,
			repair_refusal: 'no_read_remote'
		});
		now.unfinished!.target = { id: 9, name: 'Volumen de prueba C', filename_stem: 'c' };
		getSpy.mockResolvedValueOnce(report()).mockResolvedValueOnce(report()).mockResolvedValue(now);
		repairSpy.mockRejectedValue(
			refused(409, {
				code: 'journal_changed',
				message: 'E',
				reason: 'journal_changed',
				source: null,
				target: null
			})
		);
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.unsettled_what(S, 'Volumen de prueba C'));
		expect(getSpy).toHaveBeenCalledTimes(3);
		expect(shown()).not.toContain('Captua no pudo reparar');
		expect(document.querySelector('[data-adoption-notice] [role="alert"]')).toBeNull();
	});

	it('while the report says something is running, the notice works and reads again until it ends', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy
			.mockResolvedValueOnce({
				...report(),
				running: {
					request_id: null,
					kind: 'repair',
					started_at: '2026-11-24T10:00:00',
					source: null,
					target: null
				}
			})
			.mockResolvedValue({ ...report(), running: null });
		render(AdoptionNotice, { scheduler });
		await expect.poll(shown).toContain(es.unsettled_repairing);
		expect(repairButton()).toBeNull();
		await expect.poll(() => scheduler.pending()).toBe(1);
		scheduler.fire();
		await expect.poll(repairButton).not.toBeNull();
	});

	it('a visibility change during a read starts no second read; it runs after the first ends', async () => {
		signIn('admin');
		const first = deferred<UnfinishedAdoptionReport>();
		getSpy.mockImplementationOnce(() => first.promise).mockResolvedValue(report());
		render(AdoptionNotice);
		await expect.poll(() => getSpy.mock.calls.length).toBe(1);
		document.dispatchEvent(new Event('visibilitychange'));
		document.dispatchEvent(new Event('visibilitychange'));
		expect(getSpy).toHaveBeenCalledTimes(1);
		first.resolve(report());
		await expect.poll(() => getSpy.mock.calls.length).toBe(2);
		await expect.poll(repairButton).not.toBeNull();
		expect(getSpy).toHaveBeenCalledTimes(2);
	});

	for (const status of [401, 403]) {
		it(`a read refused ${status} stops the repeat and keeps the last state`, async () => {
			signIn('admin');
			const scheduler = manual();
			getSpy
				.mockResolvedValueOnce(report({ state: 'recovering', repair_available: false }))
				.mockRejectedValue(refused(status, 'Not enough permissions'));
			render(AdoptionNotice, { scheduler });
			await expect.poll(() => scheduler.pending()).toBe(1);
			scheduler.fire();
			await expect.poll(() => getSpy.mock.calls.length).toBe(2);
			expect(scheduler.pending()).toBe(0);
			expect(shown()).toContain(es.unsettled_heading);
			expect(shown()).toContain(es.common_retry);
			expect(repairButton()).toBeNull();
			document.dispatchEvent(new Event('visibilitychange'));
			scheduler.fire();
			expect(getSpy).toHaveBeenCalledTimes(2);
			getSpy.mockResolvedValue(report());
			[...notice()!.querySelectorAll('button')]
				.find((b) => b.textContent?.trim() === es.common_retry)!
				.click();
			await expect.poll(repairButton).not.toBeNull();
			expect(getSpy).toHaveBeenCalledTimes(3);
		});
	}

	it('something running and nothing unfinished: read again, and an interrupted move shows without a navigation', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy
			.mockResolvedValueOnce({
				unfinished: null,
				running: {
					request_id: 'abc',
					kind: 'adoption',
					started_at: '2026-11-24T10:00:00',
					source: { id: 1, name: S, filename_stem: 's' },
					target: { id: 2, name: T, filename_stem: 't' }
				}
			})
			.mockResolvedValue({ ...report(), running: null });
		render(AdoptionNotice, { scheduler });
		await expect.poll(() => scheduler.pending()).toBe(1);
		// On the Overview a running move that is not unfinished shows nothing.
		expect(notice()).toBeNull();
		scheduler.fire();
		await expect.poll(repairButton).not.toBeNull();
		expect(shown()).toContain(es.unsettled_heading);
	});

	it('on the page of a volume a running move names, the working row shows; on another volume nothing', async () => {
		signIn('admin');
		const running = {
			unfinished: null,
			running: {
				request_id: 'abc',
				kind: 'adoption',
				started_at: '2026-11-24T10:00:00',
				source: { id: 7, name: S, filename_stem: 's' },
				target: { id: 20, name: T, filename_stem: 't' }
			}
		};
		getSpy.mockResolvedValue(running);
		const onState = vi.fn();
		const screen = render(AdoptionNotice, {
			onVolume: true,
			volumeId: 7,
			scheduler: manual(),
			onRead: onState
		});
		await expect.poll(shown).toContain(`${es.adopt_action} ${es.common_loading_ellipsis}`);
		screen.unmount();
		const other = vi.fn();
		render(AdoptionNotice, { onVolume: true, volumeId: 9, scheduler: manual(), onRead: other });
		await expect.poll(() => other.mock.calls.length).toBe(1);
		expect(notice()).toBeNull();
	});

	it('a delayed success for J1 cannot cover J2, including while the confirming read is delayed', async () => {
		signIn('admin');
		const post = deferred<{ result: 'finished' }>();
		const confirmation = deferred<UnfinishedAdoptionReport>();
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report())
			.mockImplementationOnce(() => confirmation.promise);
		repairSpy.mockImplementationOnce(() => post.promise);
		render(AdoptionNotice);
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(() => repairSpy.mock.calls.length).toBe(1);
		// Another administrator settles J1 and leaves J2 before this POST's reply arrives.
		post.resolve({ result: 'finished' });
		await expect.poll(() => getSpy.mock.calls.length).toBe(3);
		expect(shown()).not.toContain(es.unsettled_done_finished(T));
		const j2 = report({
			run_id: 'run-2',
			target: { id: 9, name: 'J2 target', filename_stem: 'j2' }
		});
		confirmation.resolve(j2);
		await expect.poll(shown).toContain(es.unsettled_what(S, 'J2 target'));
		expect(shown()).not.toContain(es.unsettled_done_finished(T));
		expect(repairButton()).not.toBeNull();
	});

	it('a missing run id never offers or sends an unscoped repair', async () => {
		signIn('admin');
		getSpy.mockResolvedValue(report({ run_id: null }));
		render(AdoptionNotice);
		await expect.poll(shown).toContain(es.unsettled_heading);
		expect(repairButton()).toBeNull();
		expect(repairSpy).not.toHaveBeenCalled();
	});

	it('a refused repair POST stops reading until Retry, preserving the displayed run', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy.mockResolvedValue(report());
		repairSpy.mockRejectedValue(refused(403, 'Forbidden'));
		render(AdoptionNotice, { scheduler });
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		await expect.poll(shown).toContain(es.common_retry);
		expect(shown()).toContain(es.unsettled_what(S, T));
		expect(scheduler.pending()).toBe(0);
		expect(getSpy).toHaveBeenCalledTimes(2);
		document.dispatchEvent(new Event('visibilitychange'));
		expect(getSpy).toHaveBeenCalledTimes(2);
	});

	it('a stale affected-volume flag does not show a later run belonging to other volumes', async () => {
		signIn('admin');
		const onRead = vi.fn();
		getSpy.mockResolvedValue(
			report({ source: { id: 8, name: 'Other source', filename_stem: 'x' } })
		);
		render(AdoptionNotice, { onVolume: true, volumeId: 7, named: true, onRead });
		await expect.poll(() => onRead.mock.calls.length).toBe(1);
		expect(notice()).toBeNull();
	});

	it('a failed confirming read offers Retry and cannot publish the pending success', async () => {
		signIn('admin');
		const scheduler = manual();
		getSpy
			.mockResolvedValueOnce(report())
			.mockResolvedValueOnce(report())
			.mockRejectedValueOnce(refused(403, 'Forbidden'))
			.mockResolvedValue({ unfinished: null });
		repairSpy.mockResolvedValue({ result: 'finished' });
		render(AdoptionNotice, { scheduler });
		await expect.poll(repairButton).not.toBeNull();
		repairButton()!.click();
		const retry = () =>
			[...(notice()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
				(b) => b.textContent?.trim() === es.common_retry
			) ?? null;
		await expect.poll(retry).not.toBeNull();
		expect(shown()).not.toContain(es.unsettled_done_finished(T));
		expect(scheduler.pending()).toBe(0);
		retry()!.click();
		await expect.poll(shown).toContain(es.unsettled_done_finished(T));
		expect(repairSpy).toHaveBeenCalledTimes(1);
	});

	it('on a volume page the unfinished notice shows only for the volumes it names', async () => {
		signIn('admin');
		getSpy.mockResolvedValue(report());
		const other = vi.fn();
		render(AdoptionNotice, { onVolume: true, volumeId: 9, scheduler: manual(), onRead: other });
		await expect.poll(() => other.mock.calls.length).toBe(1);
		expect(notice()).toBeNull();
	});
});

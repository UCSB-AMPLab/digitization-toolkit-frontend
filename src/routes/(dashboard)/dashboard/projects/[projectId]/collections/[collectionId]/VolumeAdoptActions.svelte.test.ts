// NEH-419: an administrator moves the captures of a volume made by hand into
// an empty volume from Fisqua. The button, the three steps (choose, plan,
// result), a refused plan, a plan answer that arrives too late, a refused
// POST, both failures, the result with and without the last step left, and
// the offer to delete the emptied volume. A move left half done says to
// restart the unit only when no recovery has tried it (or the report cannot
// be read); one recovery could not settle says so, and one a recovery is
// settling now stays working. Fixtures are shaped as
// AdoptPlanRead and AdoptResultRead in app/schemas/collection.py.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { goto } from '$app/navigation';
import {
	collectionsApi,
	recordsApi,
	systemApi,
	type AdoptPlan,
	type AdoptResult,
	type Collection
} from '$lib/api';
import { es } from '$lib/i18n/es';
import type { Scheduler } from '$lib/repeat-read';
import VolumeAdoptActions from './VolumeAdoptActions.svelte';

const SOURCE = 'Ensayo de origen';
const T1 = 'Volumen 007';
const T2 = 'Volumen 005';

function vol(over: Partial<Collection>): Collection {
	return {
		id: 0,
		name: 'v',
		created_at: '2026-11-01T00:00:00',
		external_id: 'co-x',
		queue_hidden_at: null,
		kept_on_unit: false,
		record_count: 0,
		...over
	};
}

const LIST: Collection[] = [
	vol({ id: 7, name: SOURCE, external_id: null, record_count: 7, filename_stem: 'src' }),
	vol({ id: 20, name: T1, filename_stem: 'volumen-prueba-007' }),
	vol({ id: 21, name: T2, filename_stem: 'volumen-prueba-005' }),
	vol({ id: 22, name: 'Con registros', record_count: 3 })
];

function plan(over: Partial<AdoptPlan> = {}): AdoptPlan {
	return {
		source_id: 7,
		target_id: 20,
		may_adopt: true,
		refusals: [],
		details: {},
		project_changes: false,
		records: 7,
		images_current: 14,
		images_superseded: 0,
		renames_count: 14,
		renames_truncated: false,
		renames: [
			{
				image_id: 1,
				old_name: 'src-img_0001_c0.cr2',
				new_name: 'volumen-prueba-007-img_0001_c0.cr2'
			},
			{
				image_id: 2,
				old_name: 'src-img_0001_c1.cr2',
				new_name: 'volumen-prueba-007-img_0001_c1.cr2'
			},
			{
				image_id: 3,
				old_name: 'src-img_0002_c0.cr2',
				new_name: 'volumen-prueba-007-img_0002_c0.cr2'
			}
		],
		colour_card_set_ids: [4, 5],
		shot_renames: [
			{ shot_id: 1, old_name: 'a', new_name: 'b' },
			{ shot_id: 2, old_name: 'c', new_name: 'd' },
			{ shot_id: 3, old_name: 'e', new_name: 'f' },
			{ shot_id: 4, old_name: 'g', new_name: 'h' }
		],
		...over
	};
}

function result(over: Partial<AdoptResult> = {}): AdoptResult {
	return {
		source_id: 7,
		target_id: 20,
		records: 7,
		images: 14,
		files_renamed: 40,
		colour_card_sets: 2,
		colour_card_shots: 4,
		target_lines_pending: false,
		recovery_pending: false,
		...over
	};
}

const refusal = (status: number, detail: unknown) =>
	Object.assign(new Error('refused'), { status, detail });

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('VolumeAdoptActions', () => {
	let countSpy: ReturnType<typeof vi.spyOn>;
	let listSpy: ReturnType<typeof vi.spyOn>;
	let planSpy: ReturnType<typeof vi.spyOn>;
	let adoptSpy: ReturnType<typeof vi.spyOn>;
	let reportSpy: ReturnType<typeof vi.spyOn>;
	let onAdopted: ReturnType<typeof vi.fn<(sourceId: number, target: string) => void>>;

	beforeEach(() => {
		sessionStorage.clear();
		countSpy = vi.spyOn(recordsApi, 'count').mockResolvedValue(7);
		listSpy = vi.spyOn(collectionsApi, 'listAll').mockResolvedValue(LIST);
		planSpy = vi.spyOn(collectionsApi, 'planAdoptInto').mockResolvedValue(plan());
		adoptSpy = vi.spyOn(collectionsApi, 'adoptInto').mockResolvedValue(result());
		// GET /system/adoption: unreadable unless a test answers it.
		reportSpy = vi
			.spyOn(systemApi, 'getUnfinishedAdoption')
			.mockRejectedValue(new TypeError('Failed to fetch'));
		onAdopted = vi.fn<(sourceId: number, target: string) => void>();
		vi.mocked(goto).mockClear();
	});
	afterEach(() => {
		// A move left unresolved keeps its id in the session (VolumeAdoptActions).
		sessionStorage.clear();
		vi.restoreAllMocks();
	});

	const mount = (over: Record<string, unknown> = {}) =>
		render(VolumeAdoptActions, {
			collectionId: 7,
			collectionName: SOURCE,
			volume: { external_id: null, kept_on_unit: false, captures_adopted_at: null },
			onAdopted,
			...over
		});
	const action = () => document.querySelector<HTMLButtonElement>('button.adopt-btn');
	const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
	const button = (name: string) =>
		[...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
			(b) => b.textContent?.trim() === name
		) ?? null;
	const text = () => dialog()?.textContent ?? '';

	async function openAndChoose(name = T1) {
		await expect.poll(action).not.toBeNull();
		action()!.click();
		await expect.poll(() => text()).toContain(name);
		const radio = [...dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
			(r) => r.closest('label')?.textContent?.includes(name)
		)!;
		radio.click();
		await expect.poll(() => button(es.focus_continue)?.disabled).toBe(false);
		button(es.focus_continue)!.click();
	}

	it('offers the action on a hand-made volume with records', async () => {
		const onOffered = vi.fn<(sourceId: number, offered: boolean) => void>();
		mount({ onOffered });
		await expect.poll(action).not.toBeNull();
		expect(onOffered).toHaveBeenLastCalledWith(7, true);
		expect(action()!.textContent?.trim()).toBe(es.adopt_action);
		expect(countSpy).toHaveBeenCalledWith({ collection_id: 7 });
	});

	it('no action on an empty volume, a volume from Fisqua, a kept volume or a closed one', async () => {
		countSpy.mockResolvedValue(0);
		const onOffered = vi.fn<(sourceId: number, offered: boolean) => void>();
		const empty = mount({ onOffered });
		await expect.poll(() => onOffered.mock.calls.length).toBe(1);
		expect(onOffered).toHaveBeenCalledWith(7, false);
		expect(action()).toBeNull();
		empty.unmount();
		countSpy.mockResolvedValue(5);
		for (const volume of [
			{ external_id: 'co-1', kept_on_unit: false, captures_adopted_at: null },
			{ external_id: null, kept_on_unit: true, captures_adopted_at: null },
			{ external_id: null, kept_on_unit: false, captures_adopted_at: '2026-11-24T10:00:00' }
		]) {
			const screen = mount({ volume });
			expect(action()).toBeNull();
			screen.unmount();
		}
		// Only the empty volume asked for the count: the others are out by their fields.
		expect(countSpy).toHaveBeenCalledTimes(1);
	});

	it('a refused record count can be retried instead of hiding the action permanently', async () => {
		countSpy.mockRejectedValueOnce(refusal(403, 'Forbidden')).mockResolvedValue(7);
		mount();
		const retry = () =>
			[...document.querySelectorAll<HTMLButtonElement>('.adopt-row button')].find(
				(b) => b.textContent?.trim() === es.common_retry
			) ?? null;
		await expect.poll(retry).not.toBeNull();
		expect(action()).toBeNull();
		retry()!.click();
		await expect.poll(action).not.toBeNull();
		expect(countSpy).toHaveBeenCalledTimes(2);
	});

	it('step 1 lists the empty volumes from Fisqua with their stems, and Continue waits for a choice', async () => {
		mount();
		await expect.poll(action).not.toBeNull();
		action()!.click();
		await expect.poll(() => text()).toContain(T1);
		expect(text()).toContain(es.adopt_target_heading);
		expect(text()).toContain(es.adopt_target_desc);
		expect(text()).toContain('volumen-prueba-007');
		expect(text()).toContain(T2);
		expect(text()).not.toContain('Con registros');
		expect(text()).not.toContain(SOURCE);
		expect(button(es.focus_continue)!.disabled).toBe(true);
		expect(button(es.common_cancel)).not.toBeNull();
	});

	it('step 1 with nothing to choose: the sentence and Cancel only', async () => {
		listSpy.mockResolvedValue([LIST[0], LIST[3]]);
		mount();
		await expect.poll(action).not.toBeNull();
		action()!.click();
		await expect.poll(() => text()).toContain(es.adopt_target_empty);
		expect(button(es.focus_continue)).toBeNull();
		expect(button(es.common_cancel)).not.toBeNull();
		expect(text()).not.toContain(es.adopt_target_desc);
	});

	it('step 2 runs the dry run and shows the plan, the first new names and the rest counted', async () => {
		mount();
		await openAndChoose();
		await expect.poll(() => text()).toContain(es.adopt_plan_heading);
		expect(planSpy).toHaveBeenCalledWith(7, 20);
		expect(text()).toContain(es.adopt_plan_summary(7, 14, 2, SOURCE, T1));
		expect(text()).toContain(es.adopt_plan_new_names);
		expect(text()).toContain('volumen-prueba-007-img_0001_c0.cr2');
		expect(text()).toContain('volumen-prueba-007-img_0001_c1.cr2');
		expect(text()).not.toContain('volumen-prueba-007-img_0002_c0.cr2');
		expect(text()).toContain(es.fisqua_more(16));
		expect(text()).toContain(es.adopt_plan_next);
		expect(text()).toContain(es.adopt_plan_old_copies);
		expect(text()).not.toContain(es.adopt_plan_project(SOURCE, T1));
		expect(button(es.adopt_plan_confirm)!.disabled).toBe(false);
		expect(adoptSpy).not.toHaveBeenCalled();
	});

	it('step 2 says when the volumes are in different projects, and leaves out a count of no groups', async () => {
		planSpy.mockResolvedValue(
			plan({ project_changes: true, colour_card_set_ids: [], shot_renames: [] })
		);
		mount();
		await openAndChoose();
		await expect.poll(() => text()).toContain(es.adopt_plan_project(SOURCE, T1));
		expect(text()).toContain(es.adopt_plan_summary_no_sets(7, 14, SOURCE, T1));
	});

	it('a refused plan lists every reason with its advice, and the confirm button stays off', async () => {
		planSpy.mockResolvedValue(
			plan({
				may_adopt: false,
				refusals: [
					'source_not_verified_offsite',
					'source_has_open_colour_card_set',
					'target_has_offsite_keys',
					'something_new'
				]
			})
		);
		mount();
		await openAndChoose();
		await expect.poll(() => text()).toContain(es.adopt_refused_title);
		expect(text()).toContain(es.adopt_refused_unchanged);
		const items = [...dialog()!.querySelectorAll('.adopt-refusals li')].map((li) =>
			li.textContent?.replace(/\s+/g, ' ').trim()
		);
		expect(items).toEqual([
			`${es.adopt_err_not_verified(SOURCE)} ${es.adopt_err_not_verified_do}`,
			`${es.adopt_err_open_set(SOURCE)} ${es.adopt_err_open_set_do(SOURCE)}`,
			es.adopt_err_target_names_held(T1)
		]);
		expect(button(es.adopt_plan_confirm)!.disabled).toBe(true);
	});

	it('ignores the answer of a dry run cancelled earlier', async () => {
		const first = deferred<AdoptPlan>();
		planSpy.mockImplementationOnce(() => first.promise);
		planSpy.mockImplementationOnce(async () => plan({ target_id: 21 }));
		mount();
		await openAndChoose(T1);
		await expect.poll(() => button(es.common_cancel)).not.toBeNull();
		button(es.common_cancel)!.click();
		await expect.poll(dialog).toBeNull();
		await openAndChoose(T2);
		await expect.poll(() => text()).toContain(es.adopt_plan_summary(7, 14, 2, SOURCE, T2));
		first.resolve(plan({ may_adopt: false, refusals: ['same_volume'] }));
		await first.promise;
		// Had the late refusal replaced the plan, confirm would be off and nothing would be sent.
		button(es.adopt_plan_confirm)!.click();
		await expect.poll(() => adoptSpy.mock.calls.length).toBe(1);
		expect(adoptSpy).toHaveBeenCalledWith(7, 21, expect.any(String));
		expect(text()).not.toContain(es.adopt_refused_title);
	});

	it('moves on confirm, cannot be dismissed while it runs, and reports the result', async () => {
		const running = deferred<AdoptResult>();
		adoptSpy.mockImplementationOnce(() => running.promise);
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		button(es.adopt_plan_confirm)!.click();
		await expect.poll(() => adoptSpy.mock.calls.length).toBe(1);
		expect(adoptSpy).toHaveBeenCalledWith(7, 20, expect.any(String));
		await expect.poll(() => text()).toContain(es.adopt_action);
		expect(button(es.common_cancel)).toBeNull();
		expect(button(es.common_close)).toBeNull();
		await userEvent.keyboard('{Escape}');
		document.querySelector<HTMLElement>('.offsite-dialog-backdrop')!.click();
		expect(dialog()).not.toBeNull();
		running.resolve(result());
		await expect.poll(() => text()).toContain(es.adopt_done_heading);
		expect(text()).toContain(es.adopt_done_summary(7, 14, 2, SOURCE, T1));
		expect(text()).toContain(es.adopt_done_uploading);
		expect(text()).not.toContain(es.adopt_done_pending);
		expect(text()).toContain(es.adopt_done_delete_desc(SOURCE, T1));
		expect(button(es.adopt_done_delete(SOURCE))).not.toBeNull();
		expect(onAdopted).toHaveBeenCalledWith(7, T1);
		button(es.common_close)!.click();
		await expect.poll(dialog).toBeNull();
	});

	it('a committed move keeps the action closed even before the parent refreshes its props', async () => {
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		button(es.adopt_plan_confirm)!.click();
		await expect.poll(() => button(es.common_close)).not.toBeNull();
		button(es.common_close)!.click();
		await expect.poll(dialog).toBeNull();
		expect(action()).toBeNull();
		expect(adoptSpy).toHaveBeenCalledTimes(1);
	});

	it('a result whose last step waits for the next start says so in place of the upload line', async () => {
		adoptSpy.mockResolvedValue(result({ target_lines_pending: true, colour_card_sets: 0 }));
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		button(es.adopt_plan_confirm)!.click();
		await expect.poll(() => text()).toContain(es.adopt_done_pending);
		expect(text()).not.toContain(es.adopt_done_uploading);
		expect(text()).toContain(es.adopt_done_summary_no_sets(7, 14, SOURCE, T1));
	});

	it('a refused POST lists its reasons', async () => {
		adoptSpy.mockRejectedValue(
			refusal(409, { message: 'English', codes: ['volume_held'], details: {} })
		);
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		button(es.adopt_plan_confirm)!.click();
		await expect.poll(() => text()).toContain(es.adopt_refused_title);
		expect(text()).toContain(es.adopt_err_volume_held);
		expect(text()).toContain(es.adopt_err_volume_held_do);
		expect(text()).not.toContain('English');
		expect(onAdopted).not.toHaveBeenCalled();
	});

	for (const [restored, sentence, advice] of [
		[true, es.adopt_failed_restored, es.adopt_failed_restored_do],
		[false, es.adopt_failed_pending, es.adopt_failed_pending_do]
	] as const) {
		it(`a failure after the move began (restored ${restored}) says what was left`, async () => {
			adoptSpy.mockRejectedValue(refusal(500, { message: 'English', restored }));
			// Not restored: the page asks the unit by the move's id, which has the failure recorded.
			if (!restored)
				vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue({
					...base,
					state: 'failed',
					message: 'E',
					restored: false
				} as never);
			mount();
			await openAndChoose();
			await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
			button(es.adopt_plan_confirm)!.click();
			await expect.poll(() => text()).toContain(sentence);
			expect(text()).toContain(advice);
			expect(text()).toContain(es.adopt_action);
			expect(text()).not.toContain('English');
			expect(button(es.common_close)).not.toBeNull();
		});
	}

	it('offers deleting the emptied volume with the delete confirmation, then goes to the volumes list', async () => {
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockResolvedValue(undefined);
		vi.spyOn(collectionsApi, 'get').mockRejectedValue(
			Object.assign(new Error('Collection 7 not found'), { status: 404 })
		);
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		countSpy.mockResolvedValue(0);
		button(es.adopt_plan_confirm)!.click();
		await expect.poll(() => button(es.adopt_done_delete(SOURCE))).not.toBeNull();
		button(es.adopt_done_delete(SOURCE))!.click();
		// The delete dialog of the volume lists, with its own confirmation.
		await expect.poll(() => document.body.textContent).toContain(es.pd_delete_confirm_pre);
		expect(document.body.textContent).not.toContain(es.pd_delete_stem_reserved);
		const confirm = [...document.querySelectorAll<HTMLButtonElement>('.btn-danger')].find((b) =>
			b.textContent?.includes(es.pd_delete_collection_title)
		)!;
		await expect.poll(() => confirm.disabled).toBe(false);
		confirm.click();
		await expect.poll(() => deleteSpy.mock.calls.length).toBe(1);
		expect(deleteSpy).toHaveBeenCalledWith(7);
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto)).toHaveBeenCalledWith('/dashboard/volumes');
	});

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

	async function confirmMove() {
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		button(es.adopt_plan_confirm)!.click();
	}

	const lost = () => new TypeError('Failed to fetch');

	it('an answer for volume A that arrives once the page shows volume B is dropped', async () => {
		const running = deferred<AdoptResult>();
		adoptSpy.mockImplementationOnce(() => running.promise);
		const screen = mount();
		await confirmMove();
		await expect.poll(() => adoptSpy.mock.calls.length).toBe(1);
		await screen.rerender({ collectionId: 9, collectionName: 'Otro volumen' });
		running.resolve(result());
		await running.promise;
		// Had the answer been applied, the result would name the move on this page.
		await expect
			.poll(() =>
				countSpy.mock.calls.some(
					(c: unknown[]) => (c[0] as { collection_id?: number } | undefined)?.collection_id === 9
				)
			)
			.toBe(true);
		expect(onAdopted).not.toHaveBeenCalled();
		expect(text()).not.toContain(es.adopt_done_heading);
	});

	it('the delete dialog traps focus and starts on Cancel; focus then goes to a control that stays', async () => {
		const focusAfter = vi.fn();
		const screen = mount({ focusAfter });
		const back = document.createElement('button');
		back.textContent = 'Back';
		screen.container.append(back);
		focusAfter.mockImplementation(() => back.focus());
		await confirmMove();
		await expect.poll(() => button(es.adopt_done_delete(SOURCE))).not.toBeNull();
		countSpy.mockResolvedValue(0);
		button(es.adopt_done_delete(SOURCE))!.click();
		await expect.poll(() => document.activeElement?.textContent?.trim()).toBe(es.common_cancel);
		const modal = document.querySelector('.modal-card')!;
		await screen.rerender({ volume: { captures_adopted_at: 'closed' } });
		expect(document.querySelector('.modal-card')).toBe(modal);
		for (let i = 0; i < 6; i++) {
			await userEvent.keyboard('{Tab}');
			expect(modal.contains(document.activeElement)).toBe(true);
		}
		(
			[...modal.querySelectorAll<HTMLButtonElement>('button')].find(
				(b) => b.textContent?.trim() === es.common_cancel
			) as HTMLButtonElement
		).click();
		await expect.poll(() => focusAfter.mock.calls.length).toBe(1);
		expect(document.activeElement).toBe(back);
	});

	it('closing the result puts focus on a control that stays', async () => {
		const focusAfter = vi.fn();
		// As the layout does: once moved, the volume is closed and the button goes.
		const screen = mount({ focusAfter });
		const back = document.createElement('button');
		back.textContent = 'Back';
		screen.container.append(back);
		focusAfter.mockImplementation(() => back.focus());
		onAdopted.mockImplementation(() => {
			screen.rerender({
				volume: { external_id: null, kept_on_unit: false, captures_adopted_at: 'closed' }
			});
		});
		await confirmMove();
		await expect.poll(() => button(es.common_close)).not.toBeNull();
		await expect.poll(action).toBeNull();
		button(es.common_close)!.click();
		await expect.poll(() => focusAfter.mock.calls.length).toBe(1);
		expect(document.activeElement).toBe(back);
	});

	it('a deferred close from an old dialog cannot steal focus from a newly opened dialog', async () => {
		mount();
		await expect.poll(action).not.toBeNull();
		action()!.click();
		await expect.poll(() => button(es.common_cancel)).not.toBeNull();
		button(es.common_cancel)!.click();
		// Open the next dialog before the old close's tick continuation runs.
		action()!.click();
		await expect.poll(() => listSpy.mock.settledResults.length).toBe(2);
		await expect.poll(() => dialog()?.contains(document.activeElement)).toBe(true);
	});

	it('a delete answered after the dialog is gone records nothing and goes nowhere', async () => {
		vi.spyOn(collectionsApi, 'delete').mockResolvedValue(undefined);
		let answer!: (e: unknown) => void;
		const getSpy = vi
			.spyOn(collectionsApi, 'get')
			.mockImplementation(() => new Promise((_, reject) => (answer = reject)));
		const screen = mount();
		await confirmMove();
		await expect.poll(() => button(es.adopt_done_delete(SOURCE))).not.toBeNull();
		countSpy.mockResolvedValue(0);
		button(es.adopt_done_delete(SOURCE))!.click();
		const confirm = () =>
			[...document.querySelectorAll<HTMLButtonElement>('.btn-danger')].find((b) =>
				b.textContent?.includes(es.pd_delete_collection_title)
			);
		await expect.poll(() => confirm()?.disabled).toBe(false);
		confirm()!.click();
		await expect.poll(() => getSpy.mock.calls.length).toBe(1);
		screen.unmount();
		answer(Object.assign(new Error('Collection 7 not found'), { status: 404 }));
		// The modal's own continuation (onChanged, then onClose) runs on microtasks after this.
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});

	// GET /system/adoption/requests/{id} (app/core/adoption_requests.py state_of).
	const base = { source_id: 7, target_id: 20, started_at: '2026-11-24T10:00:00', ended_at: null };
	const sentId = () => adoptSpy.mock.calls[0]?.[2] as string;
	const workingLine = () =>
		document.querySelector<HTMLElement>('.adopt-row-working')?.textContent?.replace(/\s+/g, ' ');

	it('sends one id with the move, a UUID, and keeps it until the outcome is known', async () => {
		const running = deferred<AdoptResult>();
		adoptSpy.mockImplementationOnce(() => running.promise);
		mount();
		await confirmMove();
		await expect.poll(() => adoptSpy.mock.calls.length).toBe(1);
		expect(sentId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
		expect(sessionStorage.getItem('captua-adoption-request:7')).toContain(sentId());
		running.resolve(result());
		await expect.poll(() => text()).toContain(es.adopt_done_heading);
		expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
	});

	for (const [label, answer] of [
		['a lost answer', () => Promise.reject(lost())],
		['a 2xx with no body', () => Promise.resolve(undefined)],
		['a 2xx with another shape', () => Promise.resolve({ ok: true })]
	] as const) {
		it(`${label}: the page asks the unit by its id; running, then applied with its counts`, async () => {
			const scheduler = manual();
			adoptSpy.mockImplementation(answer as never);
			const lookup = vi
				.spyOn(systemApi, 'getAdoptionRequest')
				.mockResolvedValueOnce({ ...base, state: 'running' })
				.mockResolvedValue({ ...base, state: 'applied', result: result() as never });
			mount({ scheduler });
			await confirmMove();
			await expect.poll(() => lookup.mock.calls.length).toBe(1);
			expect(lookup).toHaveBeenCalledWith(sentId());
			await expect.poll(() => scheduler.pending()).toBe(1);
			expect(text()).toContain(es.adopt_action);
			expect(dialog()!.querySelector('.spinner')).not.toBeNull();
			expect(dialog()!.querySelectorAll('button')).toHaveLength(0);
			scheduler.fire();
			await expect.poll(() => text()).toContain(es.adopt_done_heading);
			expect(text()).toContain(es.adopt_done_summary(7, 14, 2, SOURCE, T1));
			expect(onAdopted).toHaveBeenCalledWith(7, T1);
			expect(adoptSpy).toHaveBeenCalledTimes(1);
		});
	}

	const outcomes: [string, unknown, (t: string) => void][] = [
		[
			'applied with no result: the result without its counts',
			{ ...base, state: 'applied', result: null },
			(t) => {
				expect(t).toContain(es.adopt_done_heading);
				expect(t).toContain(es.adopt_done_uploading);
				expect(t).not.toContain(es.adopt_done_summary(7, 14, 2, SOURCE, T1));
			}
		],
		[
			'refused: the refused panel from its codes',
			{
				...base,
				state: 'refused',
				status: 409,
				detail: { message: 'E', codes: ['volume_held'], details: {} }
			},
			(t) => {
				expect(t).toContain(es.adopt_refused_title);
				expect(t).toContain(es.adopt_err_volume_held);
			}
		],
		[
			'failed, restored: left as it was',
			{ ...base, state: 'failed', message: 'E', restored: true },
			(t) => expect(t).toContain(es.adopt_failed_restored)
		],
		[
			'failed, not restored: left half moved',
			{ ...base, state: 'failed', message: 'E', restored: false },
			(t) => expect(t).toContain(es.adopt_failed_pending)
		],
		[
			'reverted: left as it was, with its advice',
			{ ...base, state: 'reverted', result: null },
			(t) => {
				expect(t).toContain(es.adopt_failed_restored);
				expect(t).toContain(es.adopt_failed_restored_do);
			}
		],
		[
			'interrupted: left half moved',
			{ ...base, state: 'interrupted', journal_kept: true },
			(t) => expect(t).toContain(es.adopt_failed_pending)
		]
	];
	for (const [label, answer, check] of outcomes) {
		it(`a lost answer, then ${label}`, async () => {
			adoptSpy.mockRejectedValue(lost());
			vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue(answer as never);
			const onUnfinished = vi.fn();
			mount({ onUnfinished });
			await confirmMove();
			await expect.poll(() => text()).not.toContain(es.adopt_plan_summary(7, 14, 2, SOURCE, T1));
			check(text());
			const halfMoved = label.startsWith('failed, not') || label.startsWith('interrupted');
			expect(onUnfinished).toHaveBeenCalledTimes(halfMoved ? 1 : 0);
			expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
		});
	}

	// GET /system/adoption (app/core/adopt_repair.py report) for a move left half done.
	const halfMoved = (over: Record<string, unknown> = {}, running: unknown = null) => ({
		unfinished: {
			source: { id: 7, name: SOURCE, filename_stem: 'src' },
			target: { id: 20, name: T1, filename_stem: 'volumen-prueba-007' },
			state: 'blocked',
			reason: 'file_at_neither_path',
			missing: [],
			repair_available: true,
			repair_refusal: null,
			run_id: 'run-1',
			...over
		},
		running
	});
	const recoveryRunning = {
		request_id: null,
		kind: 'recovery',
		started_at: '2026-11-24T10:00:00',
		source: null,
		target: null
	};
	const interrupted = { ...base, state: 'interrupted', journal_kept: true };
	const failedHalf = { ...base, state: 'failed', message: 'E', restored: false };

	for (const [how, setUp] of [
		[
			'a lookup answers interrupted',
			() => {
				adoptSpy.mockRejectedValue(lost());
				vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue(interrupted as never);
			}
		],
		[
			'a lookup answers failed, not restored',
			() => {
				adoptSpy.mockRejectedValue(lost());
				vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue(failedHalf as never);
			}
		],
		[
			'the POST fails, not restored',
			() => {
				adoptSpy.mockRejectedValue(refusal(500, { message: 'English', restored: false }));
				// The unit records the failure under the move's id (adoption_requests.end).
				vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue(failedHalf as never);
			}
		]
	] as const) {
		it(`${how}, and recovery could not settle it: the unfinished move, no restart`, async () => {
			setUp();
			reportSpy.mockResolvedValue(halfMoved() as never);
			const onUnfinished = vi.fn();
			mount({ onUnfinished });
			await confirmMove();
			await expect.poll(() => text()).toContain(es.adopt_err_unfinished);
			expect(text()).toContain(es.adopt_err_unfinished_do);
			expect(text()).not.toContain(es.adopt_failed_pending);
			expect(text()).not.toContain(es.adopt_failed_pending_do);
			expect(reportSpy).toHaveBeenCalledTimes(1);
			expect(onUnfinished).toHaveBeenCalledTimes(1);
			expect(button(es.common_close)).not.toBeNull();
			expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
		});

		it(`${how}, and no recovery has tried it: restart`, async () => {
			setUp();
			reportSpy.mockResolvedValue(halfMoved({ reason: 'recovery_not_run' }) as never);
			mount();
			await confirmMove();
			await expect.poll(() => text()).toContain(es.adopt_failed_pending);
			expect(text()).toContain(es.adopt_failed_pending_do);
			expect(text()).not.toContain(es.adopt_err_unfinished);
			expect(reportSpy).toHaveBeenCalledTimes(1);
		});

		it(`${how}, and the report cannot be read: restart`, async () => {
			setUp();
			mount();
			await confirmMove();
			await expect.poll(() => text()).toContain(es.adopt_failed_pending);
			expect(text()).toContain(es.adopt_failed_pending_do);
			expect(reportSpy).toHaveBeenCalledTimes(1);
		});

		it(`${how}, while a recovery runs: still working, asked again, then the unfinished move`, async () => {
			const scheduler = manual();
			setUp();
			reportSpy
				.mockResolvedValueOnce(halfMoved({ state: 'recovering' }, recoveryRunning) as never)
				.mockResolvedValue(halfMoved() as never);
			mount({ scheduler });
			await confirmMove();
			await expect.poll(() => reportSpy.mock.calls.length).toBe(1);
			await expect.poll(() => scheduler.pending()).toBe(1);
			expect(dialog()!.querySelector('.spinner')).not.toBeNull();
			expect(text()).not.toContain(es.adopt_failed_pending);
			expect(text()).not.toContain(es.adopt_err_unfinished);
			scheduler.fire();
			await expect.poll(() => text()).toContain(es.adopt_err_unfinished);
			expect(text()).not.toContain(es.adopt_failed_pending_do);
			expect(reportSpy).toHaveBeenCalledTimes(2);
		});
	}

	// A failure the unit recorded as not restored, then settled by a repair or a restart: the
	// recorded row never changes, so the source volume's own field says which way it went.
	for (const [how, setUp] of [
		[
			'a lookup answers failed, not restored',
			() => {
				adoptSpy.mockRejectedValue(lost());
				vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue(failedHalf as never);
			}
		],
		[
			'the POST fails, not restored',
			() => {
				adoptSpy.mockRejectedValue(refusal(500, { message: 'English', restored: false }));
				vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue(failedHalf as never);
			}
		]
	] as const) {
		async function workingThenSettled(scheduler: ReturnType<typeof manual>) {
			reportSpy
				.mockResolvedValueOnce(halfMoved({ state: 'recovering' }, recoveryRunning) as never)
				.mockResolvedValue({ unfinished: null, running: null } as never);
			await confirmMove();
			await expect.poll(() => reportSpy.mock.calls.length).toBe(1);
			await expect.poll(() => scheduler.pending()).toBe(1);
			// Working: the move's id is kept, so Close and a reload resume it.
			expect(sessionStorage.getItem('captua-adoption-request:7')).toContain(sentId());
			expect(text()).not.toContain(es.adopt_failed_pending_do);
			scheduler.fire();
			await expect.poll(() => reportSpy.mock.calls.length).toBe(2);
		}

		it(`${how}, working, then settled with the captures moved: the result, with the delete offer`, async () => {
			const scheduler = manual();
			setUp();
			const volumeSpy = vi.spyOn(collectionsApi, 'get').mockResolvedValue(
				vol({
					id: 7,
					name: SOURCE,
					external_id: null,
					captures_adopted_at: '2026-11-25T10:00:00'
				})
			);
			mount({ scheduler });
			await workingThenSettled(scheduler);
			await expect.poll(() => text()).toContain(es.adopt_done_heading);
			expect(volumeSpy).toHaveBeenCalledWith(7);
			expect(text()).not.toContain(es.adopt_done_summary(7, 14, 2, SOURCE, T1));
			expect(button(es.adopt_done_delete(SOURCE))).not.toBeNull();
			expect(onAdopted).toHaveBeenCalledWith(7, T1);
			expect(text()).not.toContain(es.adopt_failed_pending_do);
			expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
		});

		it(`${how}, working, then settled with the captures where they were: left as it was`, async () => {
			const scheduler = manual();
			setUp();
			vi.spyOn(collectionsApi, 'get').mockResolvedValue(
				vol({ id: 7, name: SOURCE, external_id: null, captures_adopted_at: null })
			);
			mount({ scheduler });
			await workingThenSettled(scheduler);
			await expect.poll(() => text()).toContain(es.adopt_failed_restored);
			expect(text()).toContain(es.adopt_failed_restored_do);
			expect(text()).not.toContain(es.adopt_failed_pending_do);
			expect(onAdopted).not.toHaveBeenCalled();
			expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
		});

		it(`${how}, working, then settled and the volume cannot be read: working, with Retry`, async () => {
			const scheduler = manual();
			setUp();
			vi.spyOn(collectionsApi, 'get').mockRejectedValue(lost());
			mount({ scheduler });
			await workingThenSettled(scheduler);
			await expect.poll(() => button(es.common_retry)).not.toBeNull();
			expect(text()).not.toContain(es.adopt_failed_pending_do);
			expect(text()).not.toContain(es.adopt_failed_restored);
			expect(text()).not.toContain(es.adopt_done_heading);
			expect(sessionStorage.getItem('captua-adoption-request:7')).toContain(sentId());
		});
	}

	it('a lost answer, then an id the unit never saw (404 closed): nothing moved', async () => {
		adoptSpy.mockRejectedValue(lost());
		vi.spyOn(systemApi, 'getAdoptionRequest').mockRejectedValue(
			Object.assign(new Error('Not found'), {
				status: 404,
				detail: { code: 'not_found', message: 'Not found', state: 'closed' }
			})
		);
		mount();
		await confirmMove();
		await expect.poll(() => text()).toContain(es.adopt_failed_restored);
		expect(text()).toContain(es.adopt_failed_restored_do);
	});

	it('the lookup failing: the working state with Retry and Close, never a second move', async () => {
		adoptSpy.mockRejectedValue(lost());
		const lookup = vi
			.spyOn(systemApi, 'getAdoptionRequest')
			.mockRejectedValueOnce(lost())
			.mockResolvedValue({ ...base, state: 'reverted', result: null });
		mount();
		await confirmMove();
		await expect.poll(() => button(es.common_retry)).not.toBeNull();
		expect(button(es.common_close)).not.toBeNull();
		expect(button(es.adopt_plan_confirm)).toBeNull();
		expect(text()).toContain(es.adopt_plan_summary(7, 14, 2, SOURCE, T1));
		button(es.common_retry)!.click();
		await expect.poll(() => text()).toContain(es.adopt_failed_restored);
		expect(lookup).toHaveBeenCalledTimes(2);
		expect(lookup.mock.calls[1][0]).toBe(sentId());
		expect(adoptSpy).toHaveBeenCalledTimes(1);
	});

	it('closed while unresolved: the strip shows the working line, the reader keeps asking, and the action returns', async () => {
		const scheduler = manual();
		adoptSpy.mockRejectedValue(lost());
		vi.spyOn(systemApi, 'getAdoptionRequest')
			.mockRejectedValueOnce(lost())
			.mockResolvedValueOnce({ ...base, state: 'busy' })
			.mockResolvedValue({ ...base, state: 'reverted', result: null });
		mount({ scheduler });
		await confirmMove();
		await expect.poll(() => button(es.common_close)).not.toBeNull();
		button(es.common_close)!.click();
		await expect.poll(dialog).toBeNull();
		expect(action()).toBeNull();
		expect(workingLine()).toContain(es.adopt_action);
		expect(workingLine()).toContain(es.common_loading_ellipsis);
		await expect.poll(() => scheduler.pending()).toBe(1);
		scheduler.fire();
		await expect.poll(() => scheduler.pending()).toBe(1);
		expect(action()).toBeNull();
		scheduler.fire();
		await expect.poll(action).not.toBeNull();
		expect(workingLine()).toBeUndefined();
		expect(dialog()).toBeNull();
		expect(adoptSpy).toHaveBeenCalledTimes(1);
	});

	it('after a reload the id comes back from the session and the lookup resumes', async () => {
		const id = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
		sessionStorage.setItem(
			'captua-adoption-request:7',
			JSON.stringify({ requestId: id, targetId: 20, targetName: T1 })
		);
		const lookup = vi
			.spyOn(systemApi, 'getAdoptionRequest')
			.mockResolvedValue({ ...base, state: 'applied', result: result() as never });
		mount();
		await expect.poll(() => lookup.mock.calls.length).toBe(1);
		expect(lookup).toHaveBeenCalledWith(id);
		await expect.poll(() => onAdopted.mock.calls.length).toBe(1);
		expect(onAdopted).toHaveBeenCalledWith(7, T1);
		expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
		expect(adoptSpy).not.toHaveBeenCalled();
	});

	it('while an id is unresolved the action is not offered, so no second move can be confirmed', async () => {
		sessionStorage.setItem(
			'captua-adoption-request:7',
			JSON.stringify({
				requestId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
				targetId: 20,
				targetName: T1
			})
		);
		vi.spyOn(systemApi, 'getAdoptionRequest').mockResolvedValue({ ...base, state: 'running' });
		const onOffered = vi.fn();
		mount({ onOffered, scheduler: manual() });
		await expect.poll(() => workingLine()).toContain(es.adopt_action);
		await expect.poll(() => countSpy.mock.calls.length).toBe(1);
		expect(action()).toBeNull();
		expect(adoptSpy).not.toHaveBeenCalled();
	});

	const ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
	const keepId = () =>
		sessionStorage.setItem(
			'captua-adoption-request:7',
			JSON.stringify({ requestId: ID, targetId: 20, targetName: T1 })
		);
	const stripRetry = () =>
		[...document.querySelectorAll<HTMLButtonElement>('.adopt-row-working button')].find(
			(b) => b.textContent?.trim() === es.common_retry
		) ?? null;

	it('Retry just before an armed timer fires: one lookup in flight at a time, and the last started is applied', async () => {
		const scheduler = manual();
		adoptSpy.mockRejectedValue(lost());
		const slow = deferred<never>();
		const lookup = vi
			.spyOn(systemApi, 'getAdoptionRequest')
			.mockRejectedValueOnce(lost())
			.mockImplementationOnce(() => slow.promise)
			.mockResolvedValue({ ...base, state: 'reverted', result: null });
		mount({ scheduler });
		await confirmMove();
		await expect.poll(() => button(es.common_retry)).not.toBeNull();
		await expect.poll(() => scheduler.pending()).toBe(1);
		button(es.common_retry)!.click();
		await expect.poll(() => lookup.mock.calls.length).toBe(2);
		scheduler.fire();
		expect(lookup).toHaveBeenCalledTimes(2);
		slow.resolve({ ...base, state: 'running' } as never);
		await expect.poll(() => scheduler.pending()).toBe(1);
		expect(lookup).toHaveBeenCalledTimes(2);
		scheduler.fire();
		await expect.poll(() => text()).toContain(es.adopt_failed_restored);
		expect(lookup).toHaveBeenCalledTimes(3);
	});

	it('a lookup refused 403: the reader stops, the id is kept, and the strip offers Retry with no spinner', async () => {
		keepId();
		const scheduler = manual();
		const lookup = vi
			.spyOn(systemApi, 'getAdoptionRequest')
			.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403, detail: 'x' }))
			.mockResolvedValue({ ...base, state: 'reverted', result: null });
		mount({ scheduler });
		await expect.poll(stripRetry).not.toBeNull();
		expect(document.querySelector('.adopt-row-working .spinner')).toBeNull();
		expect(scheduler.pending()).toBe(0);
		expect(sessionStorage.getItem('captua-adoption-request:7')).toContain(ID);
		expect(action()).toBeNull();
		stripRetry()!.click();
		await expect.poll(action).not.toBeNull();
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('a lookup refused 401: the reader stops and the id is kept', async () => {
		keepId();
		const scheduler = manual();
		const lookup = vi
			.spyOn(systemApi, 'getAdoptionRequest')
			.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401, detail: 'x' }));
		mount({ scheduler });
		await expect.poll(() => lookup.mock.calls.length).toBe(1);
		await expect.poll(stripRetry).not.toBeNull();
		expect(scheduler.pending()).toBe(0);
		expect(sessionStorage.getItem('captua-adoption-request:7')).toContain(ID);
	});

	it('a lookup answered 422 drops that id and offers the action again', async () => {
		keepId();
		vi.spyOn(systemApi, 'getAdoptionRequest').mockRejectedValue(
			Object.assign(new Error('Unprocessable'), { status: 422, detail: [] })
		);
		mount({ scheduler: manual() });
		await expect.poll(action).not.toBeNull();
		expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
	});

	it('a stored entry that is not well formed is removed and nothing is asked', async () => {
		sessionStorage.setItem(
			'captua-adoption-request:7',
			JSON.stringify({ requestId: 'not-a-uuid', targetId: 20, targetName: T1 })
		);
		const lookup = vi.spyOn(systemApi, 'getAdoptionRequest');
		const screen = mount({ scheduler: manual() });
		await expect.poll(action).not.toBeNull();
		expect(sessionStorage.getItem('captua-adoption-request:7')).toBeNull();
		screen.unmount();
		mount({ scheduler: manual() });
		await expect.poll(action).not.toBeNull();
		expect(lookup).not.toHaveBeenCalled();
	});

	// A keyboard user's focus: on the control pressed, which the next step can remove.
	const press = (b: HTMLButtonElement | null) => {
		b!.focus();
		b!.click();
	};
	const inside = () => !!dialog()?.contains(document.activeElement);

	it('focus stays in the dialog from choose to planning to the plan', async () => {
		const answer = deferred<AdoptPlan>();
		planSpy.mockImplementationOnce(() => answer.promise);
		mount();
		await expect.poll(action).not.toBeNull();
		press(action());
		await expect.poll(() => text()).toContain(T1);
		[...dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
			.find((r) => r.closest('label')?.textContent?.includes(T1))!
			.click();
		await expect.poll(() => button(es.focus_continue)?.disabled).toBe(false);
		press(button(es.focus_continue));
		await expect.poll(() => button(es.focus_continue)).toBeNull();
		await expect.poll(inside).toBe(true);
		answer.resolve(plan());
		await expect.poll(() => button(es.adopt_plan_confirm)).not.toBeNull();
		await expect.poll(inside).toBe(true);
	});

	it('focus stays in the dialog from the plan to a refusal', async () => {
		adoptSpy.mockRejectedValue(
			refusal(409, { message: 'English', codes: ['volume_held'], details: {} })
		);
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		press(button(es.adopt_plan_confirm));
		await expect.poll(() => text()).toContain(es.adopt_refused_title);
		await expect.poll(inside).toBe(true);
	});

	it('focus stays in the dialog from the plan to the working state to the result', async () => {
		const running = deferred<AdoptResult>();
		adoptSpy.mockImplementationOnce(() => running.promise);
		mount();
		await openAndChoose();
		await expect.poll(() => button(es.adopt_plan_confirm)?.disabled).toBe(false);
		press(button(es.adopt_plan_confirm));
		await expect.poll(() => dialog()?.querySelectorAll('button').length).toBe(0);
		await expect.poll(inside).toBe(true);
		running.resolve(result());
		await expect.poll(() => text()).toContain(es.adopt_done_heading);
		await expect.poll(inside).toBe(true);
	});

	it('focus stays in the dialog from the working state to an unknown outcome with Retry, and on', async () => {
		adoptSpy.mockRejectedValue(lost());
		vi.spyOn(systemApi, 'getAdoptionRequest')
			.mockRejectedValueOnce(lost())
			.mockResolvedValue({ ...base, state: 'reverted', result: null });
		mount();
		await confirmMove();
		await expect.poll(() => button(es.common_retry)).not.toBeNull();
		await expect.poll(inside).toBe(true);
		press(button(es.common_retry));
		await expect.poll(() => text()).toContain(es.adopt_failed_restored);
		await expect.poll(inside).toBe(true);
	});

	it('focus goes from the result into the delete dialog, and back to a control that stays', async () => {
		const focusAfter = vi.fn();
		const screen = mount({ focusAfter });
		const back = document.createElement('button');
		back.textContent = 'Back';
		screen.container.append(back);
		focusAfter.mockImplementation(() => back.focus());
		await confirmMove();
		await expect.poll(() => button(es.adopt_done_delete(SOURCE))).not.toBeNull();
		countSpy.mockResolvedValue(0);
		press(button(es.adopt_done_delete(SOURCE)));
		await expect.poll(() => document.querySelector('.modal-card')).not.toBeNull();
		const modal = document.querySelector('.modal-card')!;
		await expect.poll(() => modal.contains(document.activeElement)).toBe(true);
		press(
			[...modal.querySelectorAll<HTMLButtonElement>('button')].find(
				(b) => b.textContent?.trim() === es.common_cancel
			) ?? null
		);
		await expect.poll(() => focusAfter.mock.calls.length).toBe(1);
		expect(document.activeElement).toBe(back);
	});
});

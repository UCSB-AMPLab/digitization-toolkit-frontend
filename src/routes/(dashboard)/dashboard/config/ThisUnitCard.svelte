<script lang="ts" module>
	import { get, writable } from 'svelte/store';
	import type { Messages } from '$lib/i18n';
	import { systemApi, type UnitTimezone } from '$lib/api';

	// The unit's time zone as every mounted card and the first-run wizard
	// show it: one state for all of them. `read` is null until a read has
	// answered, and 'failed' when the last read failed; `saving` is true while
	// a PUT runs, whichever card or step started it.
	export interface TimezoneState {
		read: UnitTimezone | null | 'failed';
		saving: boolean;
	}

	export const unitTimezone = writable<TimezoneState>({ read: null, saving: false });

	// The PUT in flight, as the whole save.
	let pendingSave: Promise<void> | null = null;
	// Every GET takes the next number, and so does a save, at its start and
	// again when its answer comes. A GET's answer, success or failure, is
	// applied only while its number is still the latest, so a read sent
	// before a later read, or before a save answered, never replaces what came
	// after it. A save's answer is always applied.
	let seq = 0;

	/**
	 * Read GET /system/timezone into the state when its answer is still the
	 * latest (see `seq`), and resolve the state's read as it is then.
	 */
	export async function readTimezone(): Promise<TimezoneState['read']> {
		const mine = ++seq;
		let answer: UnitTimezone | 'failed';
		try {
			answer = await systemApi.getTimezone();
		} catch {
			answer = 'failed';
		}
		if (mine === seq) unitTimezone.update((s) => ({ ...s, read: answer }));
		return get(unitTimezone).read;
	}

	/**
	 * PUT /system/timezone, with the zone the backend read back applied to the
	 * state for every card, whatever the state held. With no list of zones
	 * known (the last read failed, or none answered), the state keeps that
	 * zone with an empty list, which the card shows as text, and one fresh
	 * GET is sent to read the list again. Rejects with the refusal; one save
	 * at a time (a call while one runs rejects at once and sends nothing).
	 */
	export function saveTimezone(zone: string): Promise<void> {
		if (pendingSave) return Promise.reject(new Error('A time-zone save is running'));
		seq += 1;
		unitTimezone.update((s) => ({ ...s, saving: true }));
		// Declared first: the body reads it after its first await, by which time it is set.
		let save: Promise<void> | null = null;
		save = (async () => {
			let readAgain = false;
			try {
				const { zone: after } = await systemApi.setTimezone(zone);
				if (pendingSave !== save) return;
				const known = get(unitTimezone).read;
				readAgain = !known || known === 'failed' || known.zones.length === 0;
				unitTimezone.update((s) => ({
					...s,
					read:
						s.read && s.read !== 'failed'
							? { ...s.read, zone: after }
							: { zone: after, zones: [], canSet: false }
				}));
			} finally {
				if (pendingSave === save) {
					seq += 1;
					pendingSave = null;
					unitTimezone.update((s) => ({ ...s, saving: false }));
					if (readAgain) readTimezone();
				}
			}
		})();
		pendingSave = save;
		return save;
	}

	/** Forget what was read and any save in flight (tests). */
	export function resetUnitTimezone(): void {
		seq += 1;
		pendingSave = null;
		unitTimezone.set({ read: null, saving: false });
	}

	/**
	 * Whether `zone` can be sent: one of the zones of the state shown (Save,
	 * and the wizard's Continue, send nothing else).
	 */
	export function zoneListed(read: TimezoneState['read'], zone: string): boolean {
		return !!read && read !== 'failed' && zone !== '' && read.zones.includes(zone);
	}

	/**
	 * The selection after a new state: the choice when the state still lists
	 * it and the kept zone is the one followed so far, else the kept zone
	 * (selectedZone).
	 */
	export function nextChoice(
		read: TimezoneState['read'],
		choice: string,
		followed: string | undefined
	): string {
		const kept = selectedZone(read);
		if (kept !== followed) return kept;
		return zoneListed(read, choice) ? choice : kept;
	}

	/** The value to select for a state: the zone kept when it is one of the choices, else '' (the unknown choice). */
	export function selectedZone(read: TimezoneState['read']): string {
		if (!read || read === 'failed' || read.zone === null) return '';
		return read.zones.includes(read.zone) ? read.zone : '';
	}

	/**
	 * The sentence for a refused or failed PUT /system/timezone (NEH-347),
	 * from its code (or, with none, its status): unknown_zone (422),
	 * timezone_unavailable (503), and every other failure, a 500, a network
	 * error or a time limit, as "could not be changed". The backend's English
	 * is never shown. The first-run wizard's time-zone step uses it too.
	 */
	export function timezoneRefusalText(error: unknown, msgs: Messages): string {
		const e = (error ?? {}) as { status?: unknown; detail?: unknown };
		const code =
			typeof e.detail === 'object' && e.detail !== null
				? (e.detail as { code?: unknown }).code
				: undefined;
		if (code === 'unknown_zone' || (code === undefined && e.status === 422))
			return msgs.this_unit_tz_err_unknown;
		if (code === 'timezone_unavailable' || (code === undefined && e.status === 503))
			return msgs.this_unit_tz_err_unavailable;
		return msgs.this_unit_tz_err_failed;
	}
</script>

<script lang="ts">
	// Settings > This unit (NEH-347), below the mode card: one card with three
	// rows, for the administrator, as the section is.
	//
	// - Captua version: `version` of GET /system/unit, read through the unit
	//   queue of $lib/unit-mode; "unknown" or none shows "Not available".
	// - Time zone (GET and PUT /system/timezone, through the shared state
	//   above, which every mount reads afresh): a select of the zones the
	//   unit lists, the zone it keeps selected; a zone that is null or not in
	//   the list is a disabled first choice reading "Not available". Save is
	//   enabled only when `canSet`, the list shown holds the choice and it
	//   differs from the zone kept, and is disabled while a PUT runs, from
	//   any card. A 200 shows "Time zone saved." and the zone the backend
	//   read back; a refusal shows the sentence for its
	//   code (timezoneRefusalText). With `canSet` false (the unit's helper
	//   lacks the verb) the select is disabled with that reason under it. A
	//   zone that cannot be read, or an empty list of zones, shows the zone
	//   as text and no select.
	// - Kind of camera: the store of $lib/camera-kind, read as Settings >
	//   Cameras reads it, by its name, with a link to that section. A backend
	//   without the route (absent) leaves the row out; a read not answered
	//   yet or failed shows "Not available".
	//
	// Version: 0.4.0

	import { onMount, untrack } from 'svelte';
	import { m } from '$lib/i18n';
	import { ensureUnit, unitState } from '$lib/unit-mode';
	import { cameraKind, kindName, loadCameraKind } from '$lib/camera-kind';

	let tz = $derived($unitTimezone.read);
	let saving = $derived($unitTimezone.saving);
	let chosen = $state<string>('');
	let saved = $state(false);
	let saveError = $state<string | null>(null);

	let version = $derived.by(() => {
		const v = $unitState?.version;
		return v && v !== 'unknown' ? v : null;
	});

	let tzReady = $derived(tz !== null && tz !== 'failed' && tz.zones.length > 0 ? tz : null);
	// The zone kept, when it is one of the choices.
	let keptZone = $derived(
		tzReady && tzReady.zone !== null && tzReady.zones.includes(tzReady.zone) ? tzReady.zone : null
	);
	let canSave = $derived(
		!!tzReady && tzReady.canSet && !saving && zoneListed(tzReady, chosen) && chosen !== keptZone
	);

	// The selection follows the zone kept each time it changes (a read, a
	// save from this card or another); in between it is this card's choice,
	// for as long as the state shown lists it (nextChoice).
	let followed: string | undefined = undefined;
	$effect(() => {
		const read = tz;
		if (!read || read === 'failed') return;
		untrack(() => {
			chosen = nextChoice(read, chosen, followed);
			followed = selectedZone(read);
		});
	});

	onMount(() => {
		ensureUnit().catch(() => undefined);
		loadCameraKind();
		readTimezone();
	});

	function pick(value: string) {
		chosen = value;
		saved = false;
		saveError = null;
	}

	async function save() {
		if (!canSave || !tzReady) return;
		saved = false;
		saveError = null;
		try {
			await saveTimezone(chosen);
			chosen = selectedZone($unitTimezone.read);
			followed = chosen;
			saved = true;
		} catch (err) {
			saveError = timezoneRefusalText(err, $m);
		}
	}
</script>

<div class="this-unit-card" data-this-unit>
	<div class="tu-row" data-this-unit-row="version">
		<span class="tu-label">{$m.this_unit_version}</span>
		<span class="tu-value">{version ?? $m.this_unit_version_unknown}</span>
	</div>

	<div class="tu-row tu-row-tz" data-this-unit-row="timezone">
		<div class="tu-info">
			<label class="tu-label" for="this-unit-tz">{$m.this_unit_tz_label}</label>
			<span class="tu-desc">{$m.this_unit_tz_desc}</span>
		</div>
		{#if tzReady}
			<div class="tu-tz-controls">
				<select
					id="this-unit-tz"
					class="tu-select"
					value={chosen}
					disabled={!tzReady.canSet || saving}
					onchange={(e) => pick((e.currentTarget as HTMLSelectElement).value)}
				>
					{#if keptZone === null}
						<option value="" disabled>{$m.this_unit_tz_unknown}</option>
					{/if}
					{#each tzReady.zones as zone (zone)}
						<option value={zone}>{zone}</option>
					{/each}
				</select>
				<button type="button" class="tu-btn-save" disabled={!canSave} onclick={save}
					>{$m.this_unit_tz_save}</button
				>
			</div>
		{:else if tz !== null}
			<span class="tu-value">{tz !== 'failed' && tz.zone ? tz.zone : $m.this_unit_tz_unknown}</span>
		{/if}
	</div>
	{#if tzReady && !tzReady.canSet}
		<p class="tu-note tu-error">{$m.this_unit_tz_err_unavailable}</p>
	{:else if saveError}
		<p class="tu-note tu-error" role="alert">{saveError}</p>
	{:else if saved}
		<p class="tu-note tu-saved" role="status">{$m.this_unit_tz_saved}</p>
	{/if}

	{#if $cameraKind.status !== 'absent'}
		<div class="tu-row" data-this-unit-row="camera-kind">
			<div class="tu-info">
				<span class="tu-label">{$m.this_unit_camera_kind}</span>
				<a class="tu-link" href="?section=cameras">{$m.this_unit_camera_kind_link}</a>
			</div>
			<span class="tu-value"
				>{$cameraKind.status === 'ready'
					? kindName($cameraKind.report.configured, $m)
					: $m.this_unit_camera_kind_unknown}</span
			>
		</div>
	{/if}
</div>

<style>
	.this-unit-card {
		margin-top: 12px;
		max-width: 860px;
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}
	.tu-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px 20px;
		padding: 18px 20px;
	}
	.tu-row + .tu-row,
	.tu-note + .tu-row {
		border-top: 1px solid var(--border-color);
	}
	.tu-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		flex: 1 1 280px;
	}
	.tu-label {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-medium);
	}
	.tu-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.5;
	}
	.tu-value {
		font-size: var(--text-base);
		color: var(--color-light-grey);
	}
	.tu-link {
		font-size: var(--text-sm);
		color: var(--color-primary);
	}
	.tu-tz-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
	}
	.tu-select {
		min-height: var(--touch-target-min);
		max-width: 100%;
		padding: 0 12px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-alt-2);
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: var(--text-base);
	}
	.tu-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.tu-btn-save {
		min-height: var(--touch-target-min);
		padding: 0 22px;
		border: 0;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		color: white;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		cursor: pointer;
		transition: background-color var(--transition-base);
	}
	.tu-btn-save:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}
	.tu-btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.tu-note {
		margin: 0;
		padding: 0 20px 16px;
		font-size: var(--text-sm);
	}
	.tu-error {
		color: var(--color-error);
	}
	.tu-saved {
		color: var(--color-light-grey);
	}
</style>

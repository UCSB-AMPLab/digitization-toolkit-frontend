<script lang="ts">
	// Settings > Cameras, "Ask for colour card shots" (NEH-340): one row with
	// a switch, under the camera kind card, for the administrator only; other
	// roles get nothing and nothing is read for them. On mounting it reads
	// the unit's state afresh (reloadUnit). The switch shows the unit's state (`colourCardShots` in GET /system/unit) and sends PUT
	// /system/unit {colourCardShots} through writeUnit, the serial queue of
	// every read and write of the unit's state ($lib/unit-mode), whose answer
	// becomes that state. While the state is not known, or comes from a
	// backend without the setting, the switch is disabled. A failure leaves
	// the switch as the unit has it, with one line saying so. An answer acts
	// on this row only while its operation is current ($lib/page-life).
	//
	// Version: 0.3.0

	import { m } from '$lib/i18n';
	import { systemApi } from '$lib/api';
	import { authStore } from '$lib/stores/auth';
	import { pageLife } from '$lib/page-life';
	import { opensUnitSettings, reloadUnit, unitState, writeUnit } from '$lib/unit-mode';

	let isAdmin = $derived(opensUnitSettings($authStore.user?.role ?? null));
	let on = $derived($unitState?.colourCardShots);
	let saving = $state(false);
	let failed = $state(false);
	const life = pageLife();

	$effect(() => {
		// Read afresh: the setting may have been changed from another browser.
		if (isAdmin) reloadUnit();
	});

	async function change(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		// The switch shows the unit's state; it moves once the answer is in.
		input.checked = on === true;
		if (saving || on === undefined) return;
		// The value chosen now, not one recomputed when the queued write runs:
		// a read answered in between may have changed the state.
		const chosen = !on;
		const op = life.begin('colour-card');
		saving = true;
		failed = false;
		try {
			await writeUnit(() => systemApi.setUnit({ colourCardShots: chosen }));
			if (!op.current()) return;
		} catch (error) {
			if (!op.current()) return;
			console.error('[Settings] The colour card setting was not saved:', error);
			failed = true;
		}
		saving = false;
	}
</script>

{#if isAdmin}
	<div class="config-card cc-setting" data-colour-card-setting>
		<div class="config-row">
			<div class="row-info">
				<span class="row-label" id="cc-setting-label">{$m.cc_setting_label}</span>
				<span class="row-desc" id="cc-setting-desc">{$m.cc_setting_desc}</span>
				{#if failed}
					<span class="row-error" role="alert">{$m.cc_setting_error}</span>
				{/if}
			</div>
			<label class="cc-switch">
				<input
					type="checkbox"
					role="switch"
					aria-labelledby="cc-setting-label"
					aria-describedby="cc-setting-desc"
					checked={on === true}
					disabled={saving || on === undefined}
					onchange={change}
				/>
				<span class="toggle" aria-hidden="true"><span class="toggle-slider"></span></span>
			</label>
		</div>
	</div>
{/if}

<style>
	/* The card and row of the other Settings sections (LanguageSection). */
	.config-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}
	.cc-setting {
		margin-top: 16px;
	}
	.config-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 20px;
		gap: 12px 20px;
	}
	.row-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1 1 240px;
		min-width: 0;
	}
	.row-label {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-medium);
	}
	.row-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.45;
	}
	.row-error {
		font-size: var(--text-sm);
		color: var(--color-error);
	}
	/* The switch of app.css (.toggle), inside a 44px touch target; the
	   checkbox covers the target, unseen, so the whole target takes the tap. */
	.cc-switch {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 60px;
		min-height: var(--touch-target-min);
	}
	.cc-switch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		z-index: 1;
		cursor: pointer;
	}
	.cc-switch input:disabled {
		cursor: not-allowed;
	}
	.cc-switch input:checked + .toggle :global(.toggle-slider) {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
	}
	.cc-switch input:checked + .toggle :global(.toggle-slider)::before {
		transform: translate(20px, -50%);
		background-color: var(--color-light);
	}
	.cc-switch input:focus-visible + .toggle :global(.toggle-slider) {
		outline: 2px solid var(--color-light);
		outline-offset: 2px;
	}
	.cc-switch input:disabled + .toggle {
		opacity: 0.5;
	}
</style>

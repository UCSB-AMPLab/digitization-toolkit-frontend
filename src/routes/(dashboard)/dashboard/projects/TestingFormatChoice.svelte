<script lang="ts">
	// The choice of a testing project's capture format (NEH-391): "JPEG only"
	// or "RAW and JPEG", with the line on the size of RAW files and, when
	// given, one more line under it. The project form and the project page
	// show it only while the unit's cameras offer both formats. The radios
	// always show `value`, which the owner changes.
	//
	// Version: 0.3.0

	import { m } from '$lib/i18n';
	import type { CaptureFormat } from '$lib/api';

	let {
		value,
		onchange,
		disabled = false,
		hint
	}: {
		value: CaptureFormat;
		onchange: (format: CaptureFormat) => void;
		disabled?: boolean;
		hint?: string;
	} = $props();

	const name = `capture-format-${Math.random().toString(36).slice(2)}`;
	let group: HTMLFieldSetElement;

	// The radios show `value` only: a click asks the owner for the change and
	// the radios follow once `value` changes, so a refused change leaves the
	// format the project still has.
	function choose(format: CaptureFormat) {
		for (const r of group.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
			r.checked = r.value === value;
		onchange(format);
	}
</script>

<fieldset class="format-choice" bind:this={group}>
	<legend class="field-label">{$m.cam_format}</legend>
	{#each [['JPEG', $m.testing_format_jpeg], ['RAW+JPEG', $m.testing_format_raw]] as [format, label] (format)}
		<label class="format-option">
			<input
				type="radio"
				{name}
				value={format}
				checked={value === format}
				{disabled}
				onchange={() => choose(format as CaptureFormat)}
			/>
			<span>{label}</span>
		</label>
	{/each}
	<p class="format-note">{$m.testing_format_note}</p>
	{#if hint}<p class="format-note">{hint}</p>{/if}
</fieldset>

<style>
	.format-choice {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.field-label {
		font-size: 11px;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-light-grey);
		margin-bottom: 4px;
		padding: 0;
	}
	.format-option {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--color-light);
	}
	.format-option input {
		width: 20px;
		height: 20px;
		accent-color: var(--color-primary);
		cursor: pointer;
	}
	.format-note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.45;
	}
</style>

<script lang="ts">
	// The flag of a volume asked for colour card shots whose shots are not
	// all there (NEH-340), from the volume's `colour_card` summary
	// ($lib/colour-card colourCardFlag): "No colour card shots", or "Colour
	// card shots skipped". Its title says how Fisqua receives the volume.
	// Drawn as the volumes' other flag, "No stem" (the project page and
	// Volúmenes), so a volume's flags read alike. Nothing with the setting
	// off, for a volume whose shots are present, or from an older backend.
	//
	// Version: 0.3.0

	import { m } from '$lib/i18n';
	import { colourCardFlag, type ColourCardSummary } from '$lib/colour-card';

	let { summary }: { summary: ColourCardSummary | null | undefined } = $props();

	let flag = $derived(colourCardFlag(summary));
</script>

{#if flag}
	<span class="cc-flag" data-colour-card-flag title={$m.cc_flag_title}
		>{flag === 'none' ? $m.cc_flag_none : $m.cc_flag_skipped}</span
	>
{/if}

<style>
	/* The "No stem" badge's look (.no-stem-badge). */
	.cc-flag {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 8px;
		font-family: var(--font-family);
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-highlight);
		background: rgba(225, 183, 120, 0.12);
		border: 1px solid rgba(225, 183, 120, 0.4);
		border-radius: var(--radius-md);
		vertical-align: middle;
		white-space: nowrap;
	}
</style>

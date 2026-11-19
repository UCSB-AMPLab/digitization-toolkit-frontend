<script lang="ts">
	// Four signal bars filled to a Wi-Fi signal in percent (0 to 4 bars, as
	// signalBars counts them), in the colour of the text around them. With a
	// `label` the bars are an image with that name; without one they are
	// decoration and hidden from assistive technology.
	//
	// Version: 0.3.3
	import { signalBars } from './network-text';

	let { signal, label = null }: { signal: number | null; label?: string | null } = $props();

	let filled = $derived(signalBars(signal));
	const BARS = [5, 9, 13, 17];
</script>

<svg
	class="sig"
	width="22"
	height="20"
	viewBox="0 0 22 20"
	role={label ? 'img' : undefined}
	aria-label={label ?? undefined}
	aria-hidden={label ? undefined : 'true'}
	data-bars={filled}
>
	{#each BARS as height, i}
		<rect
			x={2 + i * 5}
			y={18 - height}
			width="3"
			{height}
			rx="1"
			fill="currentColor"
			class={i < filled ? 'on' : 'off'}
		/>
	{/each}
</svg>

<style>
	.sig { flex-shrink: 0; }
	.off { opacity: 0.22; }
</style>

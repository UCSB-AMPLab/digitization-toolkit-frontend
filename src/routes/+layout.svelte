<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import VirtualKeyboard from '$lib/components/VirtualKeyboard.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<VirtualKeyboard />


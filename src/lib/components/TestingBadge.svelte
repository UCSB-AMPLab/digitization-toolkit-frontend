<script lang="ts">
	// Marks a testing project or volume (NEH-391) with the "Testing" label, in
	// the muted grey of the status badges. It takes an optional class and is
	// placed by the page that shows it.
	//
	// Version: 0.3.0

	import { m } from '$lib/i18n';

	let { class: className = '' }: { class?: string } = $props();
</script>

<span class="status-badge testing-badge {className}">{$m.testing_badge}</span>

<style>
	.testing-badge {
		color: var(--color-light-grey);
	}
</style>

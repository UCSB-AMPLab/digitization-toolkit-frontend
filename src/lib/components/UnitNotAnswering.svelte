<script lang="ts">
	// The banner for a unit that is not answering (NEH-186): a slim band at
	// the top of every page while the root layout's watcher has seen three
	// failed health checks in a row (lib/unit-watch.ts, `unitNotAnswering`),
	// with "Reload". It reloads nothing by itself, since the page may hold
	// work the person has not finished. It goes when a health check succeeds,
	// and stays away while a restart is being awaited (`restartAwaited`),
	// whose overlay already says the unit is restarting.
	//
	// It covers nothing. The root layout puts it first in the page flow, so
	// the page moves down by its height. While it shows, its height is set on
	// the document as `--banner-h` (0 otherwise): the full-screen layouts (the
	// capture screen, the dashboard shell, the volume viewer) take it off
	// their 100vh height, and the full-screen steps of the capture screen
	// ("Which camera is this?", the camera check) start below it. It is drawn
	// above dialog backdrops, and its Reload is `data-always-reachable`, so a
	// dialog's focus trap keeps it in the Tab order (lib/dialog.ts).

	import { m } from '$lib/i18n';
	import { unitNotAnswering } from '$lib/unit-watch';
	import { restartAwaited } from '$lib/stores/power';

	let { onReload = () => window.location.reload() }: { onReload?: () => void } = $props();

	let shown = $derived($unitNotAnswering && !$restartAwaited);
	let band = $state<HTMLElement | null>(null);

	$effect(() => {
		const root = document.documentElement;
		if (!shown || !band) {
			root.style.removeProperty('--banner-h');
			return;
		}
		const el = band;
		const set = () => root.style.setProperty('--banner-h', `${el.offsetHeight}px`);
		set();
		const observer = new ResizeObserver(set);
		observer.observe(el);
		return () => {
			observer.disconnect();
			root.style.removeProperty('--banner-h');
		};
	});
</script>

{#if shown}
	<div class="una" role="status" data-unit-not-answering bind:this={band}>
		<span class="una-text">{$m.unit_not_answering}</span>
		<button type="button" class="una-btn" data-always-reachable onclick={() => onReload()}
			>{$m.unit_not_answering_reload}</button
		>
	</div>
{/if}

<style>
	.una {
		position: relative;
		z-index: 1100;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 12px 0 16px;
		box-sizing: border-box;
		background-color: var(--color-surface-alt);
		border-bottom: 2px solid var(--color-warning);
		color: var(--color-light);
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	.una-text {
		flex: 1;
		min-width: 0;
		padding: 6px 0;
	}
	.una-btn {
		flex-shrink: 0;
		min-height: var(--touch-target-min);
		padding: 0 16px;
		border: 1px solid var(--color-warning);
		border-radius: var(--radius-md);
		background: none;
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		cursor: pointer;
	}
</style>

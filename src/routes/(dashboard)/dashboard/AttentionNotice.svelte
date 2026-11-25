<script lang="ts">
	// One notice of the Overview's "Needs attention" block (NEH-350): a
	// bordered box in the error colours, or in sand for the retakes, with an
	// icon and the notice's own content. The content's parts take the classes
	// styled here: `notice-title` (with `plain` for a sentence that is not a
	// title), `notice-body`, `notice-meta`, `notice-actions`, and
	// `alert-link` (with `on-own-line` for a link on a line of its own, 44 px
	// high). `data-attention-notice` is what the block looks for to show its
	// title: a notice that draws nothing leaves the block hidden.

	import type { Snippet } from 'svelte';

	let {
		tone = 'error',
		icon,
		labelledby,
		children,
		class: extra = ''
	}: {
		tone?: 'error' | 'retake';
		icon: 'warn' | 'camera-off' | 'retake';
		labelledby?: string;
		children: Snippet;
		class?: string;
	} = $props();
</script>

{#snippet glyph()}
	<svg
		width="22"
		height="22"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if icon === 'warn'}
			<path
				d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
			/>
			<line x1="12" y1="9" x2="12" y2="13" />
			<line x1="12" y1="17" x2="12.01" y2="17" />
		{:else if icon === 'camera-off'}
			<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
			<circle cx="12" cy="13" r="4" />
			<line x1="1" y1="1" x2="23" y2="23" />
		{:else}
			<path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
		{/if}
	</svg>
{/snippet}

{#if labelledby}
	<section class="notice tone-{tone} {extra}" aria-labelledby={labelledby} data-attention-notice>
		<span class="notice-icon">{@render glyph()}</span>
		<div class="notice-main">{@render children()}</div>
	</section>
{:else}
	<div class="notice tone-{tone} {extra}" role="status" data-attention-notice>
		<span class="notice-icon">{@render glyph()}</span>
		<div class="notice-main">{@render children()}</div>
	</div>
{/if}

<style>
	.notice {
		--tone: var(--color-error);
		--tone-bg: var(--color-error-bg);
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 16px 18px;
		border: 1px solid var(--tone);
		background-color: var(--tone-bg);
		border-radius: var(--radius-lg);
		color: var(--color-light);
		min-width: 0;
	}
	.notice.tone-retake {
		--tone: var(--color-highlight);
		--tone-bg: rgba(225, 183, 120, 0.12);
	}
	.notice-icon {
		color: var(--tone);
		flex-shrink: 0;
		display: flex;
		padding-top: 1px;
	}
	.notice-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-wrap: anywhere;
	}
	.notice-main :global(.notice-title) {
		margin: 0;
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		line-height: 1.4;
	}
	.notice-main :global(.notice-title.plain) {
		font-weight: var(--fw-regular);
	}
	.notice-main :global(.notice-title strong) {
		font-weight: var(--fw-bold);
	}
	.notice-main :global(.notice-body) {
		margin: 0;
		font-size: var(--text-base);
		color: var(--color-light);
		line-height: 1.5;
	}
	.notice-main :global(.notice-meta) {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}
	.notice-main :global(.notice-actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 6px;
	}
	.notice-main :global(a.alert-link) {
		color: var(--tone);
		font-weight: var(--fw-semibold);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.notice-main :global(a.alert-link:hover) {
		opacity: 0.8;
	}
	.notice-main :global(a.alert-link.on-own-line) {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
	}
</style>

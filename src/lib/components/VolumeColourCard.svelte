<script lang="ts">
	// A volume's colour card shots on its page (NEH-340), in the top bar
	// beside the breadcrumb. Read-only: shots are taken only from the capture
	// screen.
	//
	// From the volume's `colour_card` summary (the volume's detail answer):
	// nothing with the setting off or in a testing volume; otherwise the flag
	// (ColourCardFlag) while the shots are not all there. For the
	// administrator and the operator (`canOpen`, the roles GET
	// /collections/{id}/colour-card admits) the flag is a button, or, with
	// the shots present, a plain "Colour card shots" button, that opens the
	// list of the volume's sets, newest first, read without touching a camera:
	// when and by whom each was finished (or opened, while it is not), its
	// outcome, each shot's image or the line that it cannot be shown, and for
	// a taken set where its shots are on their way offsite ($lib/colour-card
	// deliveryText). A reviewer gets the flag only. A read that fails says so,
	// with Retry; an answer after the dialog has closed is dropped
	// ($lib/page-life).
	//
	// Version: 0.3.0

	import { m, locale } from '$lib/i18n';
	import { colourCardApi } from '$lib/api';
	import { formatApiDate } from '$lib/format-date';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import { createPageLife } from '$lib/page-life';
	import { onDestroy } from 'svelte';
	import {
		colourCardFlag,
		deliveryText,
		type ColourCardSet,
		type ColourCardSummary
	} from '$lib/colour-card';
	import ColourCardFlag from './ColourCardFlag.svelte';

	let {
		collectionId,
		summary,
		canOpen = false
	}: {
		collectionId: number;
		summary: ColourCardSummary | null | undefined;
		canOpen?: boolean;
	} = $props();

	let enabled = $derived(summary?.enabled === true);
	let flag = $derived(colourCardFlag(summary));

	let open = $state(false);
	let sets = $state<ColourCardSet[] | null>(null);
	let failed = $state(false);
	let loading = $state(false);
	// Shots whose image the browser could not show, by capture id.
	let unshown = $state<Record<string, true>>({});
	const life = createPageLife();
	onDestroy(() => life.destroy());

	async function load() {
		const op = life.begin('sets');
		loading = true;
		failed = false;
		try {
			const state = await colourCardApi.state(collectionId, { readCameras: false }, op.signal);
			if (!op.current()) return;
			sets = [...state.sets].reverse();
		} catch (error) {
			if (!op.current()) return;
			console.error('[Volume] Could not read the colour card shots:', error);
			failed = true;
		} finally {
			if (op.current()) loading = false;
		}
	}

	function show() {
		open = true;
		sets = null;
		void load();
	}

	function close() {
		life.stop('sets');
		loading = false;
		open = false;
	}

	function when(set: ColourCardSet): string {
		const at = set.completed_at ?? set.opened_at;
		return at
			? formatApiDate(at, $locale, {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '';
	}

	function outcome(set: ColourCardSet): string {
		if (set.outcome === 'taken') return $m.cc_outcome_taken;
		if (set.outcome === 'skipped') return $m.cc_outcome_skipped;
		return $m.cc_outcome_open;
	}
</script>

{#if enabled}
	{#if canOpen}
		<button type="button" class="vcc-open" onclick={show}>
			{#if flag}<ColourCardFlag {summary} />{:else}<span class="vcc-plain">{$m.cc_sets_open}</span
				>{/if}
		</button>
	{:else}
		<ColourCardFlag {summary} />
	{/if}
{/if}

{#if open}
	<div class="vcc-backdrop" use:toBody use:dismissible={{ onDismiss: close }}>
		<div
			class="vcc-card dialog-fit"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="vcc-title"
			use:trapFocus
		>
			<h3 class="vcc-title" id="vcc-title">{$m.cc_sets_title}</h3>
			{#if failed}
				<p class="vcc-error" role="alert">{$m.cc_err_unread}</p>
			{:else if sets === null}
				<p class="vcc-note" role="status">{$m.common_loading_ellipsis}</p>
			{:else if sets.length === 0}
				<p class="vcc-note">{$m.cc_sets_empty}</p>
			{:else}
				<ul class="vcc-sets">
					{#each sets as set (set.id)}
						{@const delivery = deliveryText(set, $m)}
						{@const by = set.completed_by ?? set.opened_by}
						<li class="vcc-set" data-cc-set={set.number}>
							<div class="vcc-set-head">
								<span class="vcc-set-title">{$m.cc_set_heading(set.number, when(set))}</span>
								<span class="vcc-outcome" class:is-taken={set.outcome === 'taken'}
									>{outcome(set)}</span
								>
							</div>
							{#if by}<p class="vcc-line">{$m.cc_set_by(by)}</p>{/if}
							{#if delivery}<p class="vcc-line">{delivery}</p>{/if}
							{#if set.shots.length > 0}
								<div class="vcc-shots">
									{#each set.shots as shot (shot.id)}
										<figure class="vcc-shot">
											{#if shot.preview && !unshown[shot.capture_id]}
												<img
													src={colourCardApi.shotImageUrl(collectionId, shot)}
													alt={$m.cc_shot_camera(shot.camera_index + 1)}
													loading="lazy"
													draggable="false"
													onerror={() => (unshown = { ...unshown, [shot.capture_id]: true })}
												/>
											{:else}
												<p class="vcc-noimg">
													{shot.preview ? $m.cc_shot_unshown : $m.cc_shot_raw}
												</p>
											{/if}
											<figcaption>{$m.cc_shot_camera(shot.camera_index + 1)}</figcaption>
										</figure>
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<div class="vcc-actions">
				{#if failed}
					<button class="btn btn-secondary" disabled={loading} onclick={() => void load()}
						>{$m.common_retry}</button
					>
				{/if}
				<button class="btn btn-ghost" onclick={close}>{$m.common_close}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.vcc-open {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		padding: 0;
		border: none;
		background: none;
		font-family: var(--font-family);
		cursor: pointer;
		flex-shrink: 0;
	}
	.vcc-open :global([data-colour-card-flag]) {
		margin-left: 0;
	}
	.vcc-plain {
		font-size: var(--text-xs);
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-decoration: underline;
		white-space: nowrap;
	}
	.vcc-open:hover .vcc-plain,
	.vcc-open:focus-visible .vcc-plain {
		color: var(--color-light);
	}

	.vcc-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 210;
		padding: 24px;
	}
	.vcc-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 20px 24px;
		width: 100%;
		max-width: 640px;
		box-shadow: var(--shadow-lg);
		box-sizing: border-box;
	}
	.vcc-title {
		margin: 0;
		font-size: var(--text-h4);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.vcc-note,
	.vcc-line {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--color-light-grey);
	}
	.vcc-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-error);
	}
	.vcc-sets {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.vcc-set {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
	}
	.vcc-set-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
	}
	.vcc-set-title {
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.vcc-outcome {
		font-size: 12px;
		font-weight: var(--fw-semibold);
		padding: 2px 8px;
		border-radius: var(--radius-full);
		color: var(--color-highlight);
		border: 1px solid rgba(225, 183, 120, 0.4);
	}
	.vcc-outcome.is-taken {
		color: var(--color-success);
		border-color: var(--color-success);
	}
	.vcc-shots {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 4px;
	}
	.vcc-shot {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 132px;
	}
	.vcc-shot img {
		width: 132px;
		height: 96px;
		object-fit: contain;
		border-radius: var(--radius-sm);
		background: #0a0a0a;
	}
	.vcc-noimg {
		margin: 0;
		width: 132px;
		min-height: 96px;
		box-sizing: border-box;
		padding: 6px;
		display: flex;
		align-items: center;
		font-size: 12px;
		line-height: 1.35;
		color: var(--color-light-grey);
		background: var(--color-surface-alt);
		border-radius: var(--radius-sm);
	}
	.vcc-shot figcaption {
		font-size: 12px;
		color: var(--color-light-grey);
	}
	.vcc-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.vcc-actions .btn {
		min-height: var(--touch-target-min);
	}
</style>

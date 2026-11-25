<script lang="ts">
	// ============================================================================
	// The Resumen's retake notice in "Para atender", with "Volúmenes con
	// recapturas" inside it (0.2.0, NEH-350), from GET
	// /records/to-retake/summary, which the page loads. Nothing is drawn
	// while no record is pending. The notice counts the page pairs and the
	// volumes, names the volume with most pending, and starts its retakes;
	// the list gives each volume its pending count and a Recapturar that opens
	// the capture screen on its first pending record. The links are for the
	// roles that can capture (`canRetake`). The records that miss a side
	// (0.3.2) are pending with the others; each volume's count reads them
	// through retakeProgress, since the backend's total leaves them out.
	// ============================================================================
	//
	// Version: 0.3.0

	import type { RetakeSummary } from '$lib/api';
	import { m } from '$lib/i18n';
	import { retakeUrl } from '$lib/queue';
	import { retakeProgress } from '$lib/recapture-turn';
	import AttentionNotice from './AttentionNotice.svelte';

	let { summary, canRetake }: { summary: RetakeSummary | null; canRetake: boolean } = $props();

	let shown = $derived(
		summary !== null && summary.pendingRecords > 0 && summary.volumes.length > 0
	);
	let most = $derived(summary?.volumes[0] ?? null);
</script>

{#if shown && summary && most}
	<AttentionNotice tone="retake" icon="retake" labelledby="rb-band-title" class="rb-band">
		<h3 id="rb-band-title" class="notice-title">
			{$m.retake_band_title(summary.pendingRecords, summary.volumes.length)}
		</h3>
		<p class="notice-body">{$m.retake_band_body}</p>
		<p class="notice-meta">{$m.retake_band_most(most.name, most.pending)}</p>
		{#if canRetake}
			<div class="notice-actions">
				<a
					class="btn btn-recapture rb-cta"
					href={retakeUrl(most.projectId, most.collectionId, most.firstPendingRecordId)}
				>
					{$m.retake_band_cta}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg
					>
				</a>
			</div>
		{/if}

		<section class="rb-vols" aria-labelledby="rb-vols-title">
			<h4 id="rb-vols-title" class="rb-vols-title">{$m.retake_vols_title}</h4>
			<ul class="rb-list">
				{#each summary.volumes as v (v.collectionId)}
					{@const progress = retakeProgress(v)}
					<li class="rb-row">
						<span class="rb-name">{v.name}</span>
						{#if v.filenameStem}<span class="rb-stem">{v.filenameStem}</span>{/if}
						<span class="rb-bar" aria-hidden="true"
							><span class="rb-bar-fill" style="width: {progress.donePercent}%"></span></span
						>
						<span class="rb-pending">{$m.retake_pending_of(progress.pending, progress.total)}</span>
						{#if canRetake}
							<a
								class="btn btn-recapture-outline rb-row-cta"
								href={retakeUrl(v.projectId, v.collectionId, v.firstPendingRecordId)}
								>{$m.retake_cta}</a
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	</AttentionNotice>
{/if}

<style>
	.rb-vols {
		display: flex;
		flex-direction: column;
	}
	.rb-vols-title {
		margin: 8px 0 0;
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.rb-list {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.rb-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		min-height: 56px;
		padding: 8px 16px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-color);
		background-color: var(--color-surface);
	}
	.rb-name {
		min-width: 7rem;
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}
	.rb-stem {
		min-width: 9rem;
		font-size: var(--text-xs);
		color: var(--color-light-grey);
		overflow-wrap: anywhere;
	}
	.rb-bar {
		flex: 1;
		min-width: 6rem;
		height: 6px;
		border-radius: var(--radius-full);
		background-color: var(--color-surface-alt-2);
		overflow: hidden;
	}
	.rb-bar-fill {
		display: block;
		height: 100%;
		border-radius: var(--radius-full);
		background-color: var(--color-highlight);
	}
	.rb-pending {
		min-width: 8rem;
		text-align: right;
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-highlight);
		font-variant-numeric: tabular-nums;
	}
	.rb-row-cta {
		padding: 8px 14px;
		font-size: var(--text-sm);
	}
</style>

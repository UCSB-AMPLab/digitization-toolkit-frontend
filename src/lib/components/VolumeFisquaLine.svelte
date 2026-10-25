<script lang="ts">
	// The volume's delivery to Fisqua, under its offsite copy line in the
	// volume view's top bar. Read-only.
	//
	// Takes `fisqua` from the answer VolumeOffsiteIndicator already polls
	// (GET /collections/{id}/offsite), so it makes no request of its own.
	// Null when the unit has no Fisqua configured: nothing is shown. The
	// wording is in fisqua-state.ts.
	import { m, locale } from '$lib/i18n';
	import type { VolumeFisquaState } from '$lib/api';
	import { volumeFisquaView, type FisquaTone } from '$lib/fisqua-state';

	let { fisqua, now }: { fisqua: VolumeFisquaState | null | undefined; now: number } = $props();

	const icons: Partial<Record<FisquaTone, string>> = {
		ok: 'check_circle',
		progress: 'sync',
		attention: 'warning'
	};

	let view = $derived(volumeFisquaView(fisqua, new Date(now), $locale, $m));
	let icon = $derived(view ? icons[view.tone] : undefined);
	let fullText = $derived(view ? [view.label, view.detail].filter((part) => part !== null).join(' · ') : '');
</script>

{#if view}
	<div class="fisqua-line">
		<p class="offsite-indicator fisqua-indicator fisqua-{view.tone}" data-fisqua data-kind={view.kind} title={fullText}>
			<span class="visually-hidden">{$m.fisqua_vol_label}: </span>
			{#if icon}
				<span class="material-symbols-outlined offsite-indicator-icon" aria-hidden="true">{icon}</span>
			{/if}
			<span class="offsite-indicator-text">
				{view.label}{#if view.detail}<span class="offsite-indicator-sep"> · </span>{view.detail}{/if}
			</span>
		</p>
		{#if view.incident}
			<div class="fisqua-incident" data-incident="object-missing">
				<p>{view.incident.text}</p>
				{#if view.incident.missing.length > 0}
					<ul>
						{#each view.incident.missing as file, i (i)}
							<li>
								<code>{file.key}</code>{#if file.role}<span class="fisqua-problem-records"> · {file.role}</span>{/if}{#if file.captureId}<span class="fisqua-problem-records"> · {file.captureId}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		{#if view.configError}
			<p class="fisqua-config-error">{view.configError}</p>
		{/if}
		{#if view.problems.length > 0 || view.history.length > 0}
			<div class="fisqua-more">
				{#if view.problems.length > 0}
					<details class="fisqua-problems">
						<summary>{$m.fisqua_problems(view.problems.length)}</summary>
						<ul>
							{#each view.problems as problem, i (i)}
								<li data-source={problem.fromFisqua ? 'fisqua' : 'captua'}>
									{problem.text}{#if problem.records}<span class="fisqua-problem-records"> {problem.records}</span>{/if}
								</li>
							{/each}
						</ul>
					</details>
				{/if}
				{#if view.history.length > 0}
					<details class="fisqua-history">
						<summary>{$m.fisqua_history(view.history.length)}</summary>
						<ul>
							{#each view.history as item, i (i)}
								<li data-kind={item.kind}>{item.label}{#if item.when}<span class="offsite-indicator-sep"> · </span>{item.when}{/if}</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		{/if}
	</div>
{/if}

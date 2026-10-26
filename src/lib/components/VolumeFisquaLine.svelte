<script lang="ts">
	// The volume's delivery to Fisqua, under its offsite copy line in the
	// volume view's top bar. Read-only.
	//
	// Takes `fisqua` from the answer VolumeOffsiteIndicator already polls
	// (GET /collections/{id}/offsite), so it makes no request of its own.
	// Null when the unit has no Fisqua configured: nothing is shown. The
	// wording is in fisqua-state.ts.
	//
	// The top bar is 72px high, so only the one-line status sits in it. When
	// there is more to say (the configuration warning, the missing-object
	// incident, problems or notes, earlier sends), the line is a button that
	// opens a panel under it, with a height cap and its own scroll. The panel
	// follows UserMenu: it closes on Escape and on a touch or click outside.
	//
	// Version: 0.1.0-beta
	import { m, locale } from '$lib/i18n';
	import type { VolumeFisquaState } from '$lib/api';
	import { volumeFisquaView, type FisquaTone } from '$lib/fisqua-state';

	let { fisqua, now }: { fisqua: VolumeFisquaState | null | undefined; now: number } = $props();

	const icons: Partial<Record<FisquaTone, string>> = {
		ok: 'check_circle',
		progress: 'sync',
		attention: 'warning'
	};

	const panelId = `fisqua-panel-${Math.random().toString(36).slice(2)}`;

	let open = $state(false);
	let root = $state<HTMLDivElement | undefined>(undefined);
	let trigger = $state<HTMLButtonElement | undefined>(undefined);

	let view = $derived(volumeFisquaView(fisqua, new Date(now), $locale, $m));
	let icon = $derived(view ? icons[view.tone] : undefined);
	let problemTotal = $derived(view ? view.problems.length + view.omitted : 0);
	let hasProblems = $derived(problemTotal > 0);
	let hasDetails = $derived(
		!!view && (!!view.configError || !!view.incident || hasProblems || view.history.length > 0)
	);
	let fullText = $derived(view ? [view.label, view.detail].filter((part) => part !== null).join(' · ') : '');

	// Nothing left to show: the panel closes with it.
	$effect(() => {
		if (!hasDetails) open = false;
	});

	// Close on a touch or click outside, or on Escape, which returns focus to
	// the line. Listened to in the capture phase, as UserMenu does, so a
	// control that stops propagation does not leave the panel open.
	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) open = false;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				open = false;
				trigger?.focus();
			}
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

{#snippet line()}
	<span class="visually-hidden">{$m.fisqua_vol_label}: </span>
	{#if icon}
		<span class="material-symbols-outlined offsite-indicator-icon" aria-hidden="true">{icon}</span>
	{/if}
	<span class="offsite-indicator-text">
		{view?.label}{#if view?.detail}<span class="offsite-indicator-sep"> · </span>{view.detail}{/if}
	</span>
{/snippet}

{#if view}
	<div class="fisqua-line" bind:this={root}>
		{#if hasDetails}
			<button
				type="button"
				class="offsite-indicator fisqua-indicator fisqua-trigger fisqua-{view.tone}"
				data-fisqua
				data-kind={view.kind}
				title={fullText}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={panelId}
				bind:this={trigger}
				onclick={() => (open = !open)}
			>
				{@render line()}
				<span class="material-symbols-outlined offsite-indicator-icon fisqua-trigger-caret" aria-hidden="true">expand_more</span>
			</button>
		{:else}
			<p class="offsite-indicator fisqua-indicator fisqua-{view.tone}" data-fisqua data-kind={view.kind} title={fullText}>
				{@render line()}
			</p>
		{/if}

		{#if open && hasDetails}
			<div class="fisqua-panel" id={panelId} role="dialog" aria-label={$m.fisqua_vol_label}>
				{#if view.configError}
					<p class="fisqua-config-error">{view.configError}</p>
				{/if}
				{#if view.incident}
					<div class="fisqua-incident" data-incident="object-missing">
						<p>{view.incident.text}</p>
						{#if view.incident.missing.length > 0}
							<ul>
								{#each view.incident.missing as file, i (i)}
									<li>
										<code>{file.key}</code>{#if file.kind}<span class="fisqua-problem-records">&nbsp;· {file.kind}</span>{/if}{#if file.role}<span class="fisqua-problem-records">&nbsp;· {file.role}</span>{/if}{#if file.captureId}<span class="fisqua-problem-records">&nbsp;· {file.captureId}</span>{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
				{#if hasProblems}
					<section class="fisqua-problems" data-problems-kind={view.problemsKind}>
						<p class="fisqua-panel-heading">
							{view.problemsKind === 'notes' ? $m.fisqua_notes(problemTotal) : $m.fisqua_problems(problemTotal)}
						</p>
						<ul>
							{#each view.problems as problem, i (i)}
								<li data-source={problem.fromFisqua ? 'fisqua' : 'captua'}>
									{problem.text}{#if problem.records}<span class="fisqua-problem-records">&nbsp;{problem.records}</span>{/if}
								</li>
							{/each}
							{#if view.omitted > 0}
								<li class="fisqua-problems-omitted">{$m.fisqua_more(view.omitted)}</li>
							{/if}
						</ul>
					</section>
				{/if}
				{#if view.history.length > 0}
					<section class="fisqua-history">
						<p class="fisqua-panel-heading">{$m.fisqua_history(view.history.length)}</p>
						<ul>
							{#each view.history as item, i (i)}
								<li data-kind={item.kind}>{item.label}{#if item.when}<span class="offsite-indicator-sep"> · </span>{item.when}{/if}</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>
		{/if}
	</div>
{/if}

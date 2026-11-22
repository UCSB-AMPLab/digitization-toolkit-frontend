<script lang="ts">
	// The list of volumes that can be freed, in Settings > Storage (NEH-380),
	// for the admin and the operator. GET /system/storage/freeable
	// (app/core/offsite_free.py, freeable_volumes) answers the real volumes
	// freeing is on offer for, largest first, from the catalogue only. Each
	// row opens the volume page's freeing dialog (VolumeOffsiteActions, with
	// no restore and no button of its own); once its job ends (see the watch
	// below), the list is read again and `onFreed` asks the section to read the
	// usage figure again.
	//
	// The dialog is mounted once, outside the rows, for the volume last
	// chosen: a row the new list no longer holds disappears, and the dialog
	// showing that volume's result stays open.
	//
	// This section, not the dialog, watches a free it started: from the
	// moment the backend takes it, the section asks for the job's status at
	// the dialog's interval until it is done or failed, whether or not the
	// dialog is still open, then reads the list and the usage figure again.
	// One watch per job; it stops on unmount. While the dialog is open it
	// polls the same job too, so the job is asked about twice per interval.
	// The list's answer names the free jobs queued or running on the unit
	// (`jobs`), so a watch is started or resumed for each on every load,
	// whoever started it and whether or not this section was shown meanwhile;
	// the row of a volume being freed says so and its button is off.
	//
	// In offline mode (`mode_allows` false) freeing is refused with
	// off_in_this_mode, so no row is shown and a line says why. A list that
	// cannot be read and an empty list each have their own line.
	//
	// Version: 0.3.0

	import { onMount, tick } from 'svelte';
	import { collectionsApi, systemApi, type FreeableVolumes } from '$lib/api';
	import { OFFSITE_POLL_INTERVAL_MS, pollOffsiteJob } from '$lib/offsite-free';
	import { m } from '$lib/i18n';
	import VolumeOffsiteActions from '$lib/components/VolumeOffsiteActions.svelte';

	let { onFreed }: { onFreed: () => void } = $props();

	let listed = $state<FreeableVolumes | null>(null);
	let failed = $state(false);
	let loading = $state(true);
	let chosen = $state<number | null>(null);
	let dialog = $state<ReturnType<typeof VolumeOffsiteActions> | undefined>(undefined);
	let opener: HTMLButtonElement | null = null;
	// Each read takes the next number, so an older answer that comes in after a
	// newer one is dropped.
	let latest = 0;

	async function load() {
		const seq = ++latest;
		try {
			const next = await systemApi.getFreeableVolumes();
			if (seq !== latest) return;
			listed = next;
			failed = false;
			for (const job of next.jobs ?? []) watch(job.collection_id, 'free', job.job_id);
		} catch {
			if (seq !== latest) return;
			listed = null;
			failed = true;
		} finally {
			if (seq === latest) loading = false;
		}
	}

	// The watches in progress, by job id; aborted on unmount.
	const watches = new Map<string, AbortController>();
	// The volumes with a free in progress, as the watches know them.
	let freeing = $state<number[]>([]);

	onMount(() => {
		load();
		return () => {
			for (const w of watches.values()) w.abort();
			watches.clear();
		};
	});

	function watch(collectionId: number, action: 'free' | 'restore', jobId: string) {
		if (action !== 'free' || watches.has(jobId)) return;
		const controller = new AbortController();
		watches.set(jobId, controller);
		if (!freeing.includes(collectionId)) freeing = [...freeing, collectionId];
		pollOffsiteJob((signal) => collectionsApi.getOffsiteJob(collectionId, jobId, signal), {
			intervalMs: OFFSITE_POLL_INTERVAL_MS,
			signal: controller.signal
		})
			.catch(() => null)
			.then(() => {
				watches.delete(jobId);
				freeing = freeing.filter((id) => id !== collectionId);
				if (controller.signal.aborted) return;
				// Done, failed, or no longer known to the backend: what is on the card may have changed.
				load();
				onFreed();
			});
	}

	async function choose(collectionId: number, event: MouseEvent) {
		opener = event.currentTarget as HTMLButtonElement;
		chosen = collectionId;
		await tick();
		dialog?.open();
	}

	function changed() {
		// The dialog's own end of a job, or of its polling: the watch above re-reads
		// once the job ends, so nothing is read here (a read while the job still
		// runs would show the list as it was).
	}

	function closed() {
		if (opener?.isConnected) opener.focus();
		opener = null;
	}
</script>

<div class="freeable">
	<div class="freeable-head">
		<span class="freeable-title">{$m.config_freeable_title}</span>
		<span class="freeable-desc">{$m.config_freeable_intro}</span>
		{#if listed?.restorable === false}
			<!-- This unit cannot read the bucket: freed files stay offsite and cannot come back from Captua. -->
			<span class="freeable-desc">{$m.offsite_free_not_restorable}</span>
		{/if}
	</div>

	{#if loading}
		<p class="freeable-status">{$m.common_loading_ellipsis}</p>
	{:else if failed || !listed}
		<p class="freeable-status freeable-status-error" role="alert">{$m.config_freeable_error}</p>
	{:else if !listed.mode_allows}
		<p class="freeable-status">{$m.config_freeable_mode_off}</p>
	{:else if listed.volumes.length === 0}
		<p class="freeable-status">{$m.config_freeable_empty}</p>
	{:else}
		<p class="freeable-status">
			{$m.config_freeable_total(listed.total.volumes, listed.total.bytes)}
		</p>
		<ul class="freeable-list">
			{#each listed.volumes as v (v.collection_id)}
				<li class="freeable-row" data-freeable-row>
					<div class="freeable-info">
						<span class="freeable-name" data-freeable-name>{v.name}</span>
						<span class="freeable-stem">{v.filename_stem}</span>
					</div>
					{#if freeing.includes(v.collection_id)}
						<span class="freeable-space" role="status">{$m.offsite_running_free}</span>
					{:else}
						<span class="freeable-space">{$m.config_freeable_space(v.bytes)}</span>
					{/if}
					<button
						type="button"
						class="btn btn-ghost freeable-btn"
						aria-label={$m.config_freeable_free_aria(v.name)}
						disabled={freeing.includes(v.collection_id)}
						onclick={(e) => choose(v.collection_id, e)}>{$m.config_freeable_free}</button
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if chosen !== null}
	{#key chosen}
		<VolumeOffsiteActions
			bind:this={dialog}
			collectionId={chosen}
			offsite={null}
			canRestore={false}
			showTrigger={false}
			onChanged={changed}
			onClosed={closed}
			onJobStarted={watch}
		/>
	{/key}
{/if}

<style>
	.freeable {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 18px 20px;
	}

	.freeable-head {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.freeable-title {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-medium);
	}
	.freeable-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}

	.freeable-status {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
	}
	.freeable-status-error {
		color: var(--color-error);
	}

	.freeable-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.freeable-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--border-color);
	}

	.freeable-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.freeable-name {
		font-size: var(--text-sm);
		color: var(--color-light);
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.freeable-stem {
		font-size: var(--text-xs, 12px);
		color: var(--color-light-grey);
		font-family: var(--font-mono, monospace);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.freeable-space {
		font-size: var(--text-sm);
		color: var(--color-light);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.freeable-btn {
		flex-shrink: 0;
		min-height: var(--touch-target-min);
	}
</style>

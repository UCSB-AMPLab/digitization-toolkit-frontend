<script lang="ts">
	// The volume's received indicator (NEH-248), under the breadcrumb of the
	// volume view's top bar. Read-only.
	//
	// Polls GET /collections/{id}/offsite on the schedule of the catalogue
	// backup poll, and reads the unit's image copy state from that poll's
	// shared store, so a unit with the image copy off or misconfigured says
	// so instead of showing every volume as pending. A failed request shows "could not
	// check", never a guessed state (NEH-138).
	import { m, locale } from '$lib/i18n';
	import { collectionsApi, AuthError } from '$lib/api';
	import { catalogueBackupNow } from '$lib/stores/catalogueBackup';
	import { POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS, startPolling } from '$lib/catalogue-backup';
	import {
		unitUploadState,
		volumeOffsiteView,
		type VolumeOffsiteKind,
		type VolumeOffsiteSnapshot,
		type VolumeOffsiteState
	} from '$lib/offsite-state';

	let { collectionId }: { collectionId: number } = $props();

	let snapshot = $state<VolumeOffsiteSnapshot>({ kind: 'loading' });

	$effect(() => {
		const id = collectionId;
		snapshot = { kind: 'loading' };
		if (!id) return;
		const stop = startPolling<VolumeOffsiteState>(
			(signal) => collectionsApi.getOffsiteState(id, signal),
			(result) => {
				snapshot = result.ok ? { kind: 'loaded', state: result.status } : { kind: 'failed' };
			},
			POLL_INTERVAL_MS,
			(error) => error instanceof AuthError,
			REQUEST_TIMEOUT_MS
		);
		return stop;
	});

	const icons: Partial<Record<VolumeOffsiteKind, string>> = {
		received: 'check_circle',
		uploading: 'sync',
		attention: 'warning',
		misconfigured: 'warning',
		unknown: 'error'
	};

	let view = $derived.by(() => {
		const { snapshot: unit, now } = $catalogueBackupNow;
		const state = unit.kind === 'loaded' ? unitUploadState(unit.status.images) : null;
		return volumeOffsiteView(snapshot, state, new Date(now), $locale, $m);
	});

	let fullText = $derived(
		view ? [view.headline, view.lastVerified, view.help].filter((part) => part !== null).join(' · ') : ''
	);
	let icon = $derived(view ? icons[view.kind] : undefined);
</script>

{#if view}
	<p class="offsite-indicator offsite-{view.kind}" data-kind={view.kind} title={fullText}>
		<span class="visually-hidden">{$m.offsite_vol_label}: </span>
		{#if icon}
			<span class="material-symbols-outlined offsite-indicator-icon" aria-hidden="true">{icon}</span>
		{/if}
		<span class="offsite-indicator-text">
			{view.headline}{#if view.lastVerified}<span class="offsite-indicator-sep"> · </span>{view.lastVerified}{/if}
		</span>
	</p>
{/if}

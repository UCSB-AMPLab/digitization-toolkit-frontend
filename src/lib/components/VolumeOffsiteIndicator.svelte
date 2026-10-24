<script lang="ts">
	// The volume's received indicator (NEH-248), under the breadcrumb of the
	// volume view's top bar. Read-only.
	//
	// Polls GET /collections/{id}/offsite on the schedule of the catalogue
	// backup poll, and reads the unit's image copy state from that poll's
	// shared store, so a unit with the image copy off or misconfigured says
	// so instead of showing every volume as pending. A failed request shows "could not
	// check", never a guessed state (NEH-138).
	//
	// A volume whose files were freed from the card says so, with the count and
	// the bytes (NEH-248). The layout reads the state through `onState`, for the
	// admin's free and restore actions beside it, and bumps `refresh` after one
	// of them to ask again at once.
	import { untrack } from 'svelte';
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

	let {
		collectionId,
		refresh = 0,
		onState
	}: {
		collectionId: number;
		refresh?: number;
		onState?: (state: VolumeOffsiteState | null) => void;
	} = $props();

	let snapshot = $state<VolumeOffsiteSnapshot>({ kind: 'loading' });
	let poller: ReturnType<typeof startPolling> | null = null;

	$effect(() => {
		onState?.(snapshot.kind === 'loaded' ? snapshot.state : null);
	});

	$effect(() => {
		if (refresh > 0) untrack(() => poller?.pollFresh());
	});

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
		poller = stop;
		return () => {
			poller = null;
			stop();
		};
	});

	const icons: Partial<Record<VolumeOffsiteKind, string>> = {
		received: 'check_circle',
		freed: 'check_circle',
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
		view
			? [view.headline, view.freed, view.lastVerified, view.help].filter((part) => part !== null).join(' · ')
			: ''
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
			{view.headline}{#if view.freed}<span class="offsite-indicator-sep"> · </span>{view.freed}{/if}{#if view.lastVerified}<span class="offsite-indicator-sep"> · </span>{view.lastVerified}{/if}
		</span>
	</p>
{/if}

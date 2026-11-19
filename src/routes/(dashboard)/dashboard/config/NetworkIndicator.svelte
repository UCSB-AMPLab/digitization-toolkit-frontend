<script lang="ts">
	// The sidebar's network status (NEH-253, option B of the mock-up), above
	// the user button, for every role. On Wi-Fi: four bars filled to the
	// signal, then "<state> · <network>"; on a cable: the cable icon, then
	// "<state> · <IPv4 address>"; offline: empty bars and "Offline". With a
	// problem on one of two connected interfaces, the line names that one.
	// Connected is green, Network problem amber; Connecting, Offline and a
	// Wi-Fi without a signal reading are in the neutral grey. A name that is
	// empty leaves the state alone. Collapsed, only the icon shows, and the
	// link keeps the full line as its name. It links to Settings > Network.
	//
	// It reads the shared store (watchNetworkStatus: one poller for the
	// sidebar and the Network section). It shows nothing while the first read
	// is in flight and nothing at all on a 501 (a machine without
	// NetworkManager). "Network state unknown", with empty grey bars, is
	// shown when the first read fails (a 503 or no answer) and after two
	// failed reads in a row, until a read succeeds; a single failed read
	// after a good one keeps the last state.
	//
	// Version: 0.3.3
	import { onMount } from 'svelte';
	import { m } from '$lib/i18n';
	import { networkIndicator, networkState, watchNetworkStatus } from '$lib/stores/network';
	import SignalBars from './SignalBars.svelte';

	let { expanded = true }: { expanded?: boolean } = $props();

	onMount(() => watchNetworkStatus());

	// A 501 shows nothing, however many reads have failed. Otherwise: no
	// status yet and a failed read, or two failed reads in a row.
	let unknown = $derived(
		$networkState.error !== null &&
			$networkState.error !== 'not_available' &&
			($networkState.status === null || $networkState.failures >= 2)
	);
	let view = $derived($networkState.status ? networkIndicator($networkState.status) : null);

	let stateLabel = $derived(
		unknown
			? $m.network_ind_unknown
			: view?.state === 'connected'
				? $m.network_ind_connected
				: view?.state === 'problem'
					? $m.network_ind_problem
					: view?.state === 'connecting'
						? $m.network_ind_connecting
						: $m.network_ind_offline
	);

	let tone = $derived(unknown ? 'off' : view?.state === 'connected' ? 'ok' : view?.state === 'problem' ? 'warn' : 'off');
	// A connected Wi-Fi whose signal was not read: empty bars, neutral.
	let neutralIcon = $derived(unknown || (view?.via === 'wifi' && view.signal === null));
	let name = $derived(unknown || view?.state === 'offline' ? null : (view?.name ?? null));

	let label = $derived(unknown ? $m.network_ind_unknown : view ? $m.network_ind_label(stateLabel, name, view.signal) : '');
</script>

{#if view || unknown}
	<a
		class="net-status tone-{tone}"
		class:collapsed={!expanded}
		href="/dashboard/config?section=network"
		aria-label={label}
		title={label}
	>
		<span class="net-ico" class:ico-neutral={neutralIcon} aria-hidden="true">
			{#if unknown}
				<SignalBars signal={0} />
			{:else if view?.via === 'wifi'}
				<SignalBars signal={view.signal} />
			{:else if view?.via === 'ethernet'}
				<svg class="cable" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="5" y="3" width="14" height="10" rx="1" />
					<path d="M8 13v3h8v-3" />
					<line x1="12" y1="16" x2="12" y2="21" />
					<line x1="9" y1="7" x2="9" y2="9" />
					<line x1="12" y1="7" x2="12" y2="9" />
					<line x1="15" y1="7" x2="15" y2="9" />
				</svg>
			{:else}
				<SignalBars signal={0} />
			{/if}
		</span>
		{#if expanded}
			<span class="net-status-line"><b>{stateLabel}</b>{#if name !== null}{` · ${name}`}{/if}</span>
		{/if}
	</a>
{/if}

<style>
	.net-status {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border-radius: var(--radius-md);
		min-height: var(--touch-target-min);
		color: var(--color-light-grey);
		text-decoration: none;
		font-family: var(--font-family);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}
	.net-status:hover { background-color: rgba(255, 255, 255, 0.04); color: var(--color-light); }
	.net-status.collapsed { justify-content: center; padding: 8px 0; }

	.net-ico { display: flex; flex-shrink: 0; }
	.tone-ok .net-ico { color: var(--color-success); }
	.tone-warn .net-ico { color: var(--color-warning); }
	.tone-off .net-ico,
	.net-ico.ico-neutral { color: var(--color-light-grey); }

	.net-status-line {
		font-size: 13px;
		color: var(--color-light-grey);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.net-status-line b { color: var(--color-light); font-weight: var(--fw-semibold); }
</style>

<script lang="ts">
	// Settings > Network (NEH-253), for every role. Connections: one card per
	// interface of GET /network/status, with the warning of each problem the
	// status reports for it (no_connection above the cards). Wi-Fi: the
	// networks in range (GET /network/wifi; "Refresh list" asks for a fresh
	// scan with rescan=true), the connected one first, each with its kind and
	// a saved mark and, for those who may change the network, Join; then the
	// saved networks with Forget. Forgetting the network the unit is on (409
	// connection_active) asks first and then sends force=true.
	//
	// Every request is bounded (NETWORK_LIMITS_MS in $lib/api). A list request
	// with no answer ends as a failed one: "Loading…" gives way to the error,
	// "Refreshing…" ends and the list shown stays. A forget with no HTTP answer
	// is not a failure, since its 204 is often lost with the link when the
	// network in use is forgotten: the confirmation closes and the status and
	// the lists are read again. Only an HTTP error answer says it failed.
	//
	// Join and Forget are offered to administrators and operators on a unit
	// whose system lets Captua change the network (`permissions.control` and
	// `.modify` of the status); otherwise one notice says why they are not.
	// Reviewers see everything, with one line on who can make changes.
	//
	// A 501 from any network route means a machine without NetworkManager: the
	// section says network settings are not available on this device. A 503
	// (network_manager_unavailable) is a plain error with a retry.
	//
	// The status comes from the shared store, so the sidebar indicator and this
	// section poll once between them. When the latest read failed and an older
	// status is shown, one notice above the cards says so, with the time of the
	// last good read and a retry.
	//
	// Each Wi-Fi list request takes the next number. Only the newest may set
	// the list, with one exception: the result of a rescan the person asked
	// for replaces the list when it arrives, even after a newer cached list,
	// unless a newer rescan has been started since. Only the newest rescan
	// ends "Refreshing…".
	//
	// A list read or rescan that fails after a list has been shown leaves that
	// list in place, with the same error and Retry as a first read that fails,
	// on the card of the networks in range and on the saved networks, so that
	// neither card shows an old list ("Connected now" included) as current.
	// Join and Forget stay offered, since the unit may still be reachable. When
	// the status store reads the status again after failed reads, a list whose
	// last read failed is read again, once.
	//
	// Which network is connected comes from the status, never from the cached
	// list (see connected-network.ts for the rule and what it covers). When the
	// status shows a connected network that the list does not contain, the list
	// is read again once for that network.
	//
	// The "Remote access" card, after the interface cards, reads
	// GET /network/tailscale through stores/remote-access on the schedule of
	// the status; remoteAccessView there decides its badge, its line, its
	// facts (name and addresses, when connected) and the count of problems.
	// The card depends only on its own answer: a unit without NetworkManager
	// (501) still shows it, under the notice that network settings are not
	// available.
	//
	// Version: 0.4.0

	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { m, locale } from '$lib/i18n';
	import {
		networkApi,
		type NetworkInterface,
		type SavedWifiNetwork,
		type WifiNetwork,
		type WifiScan
	} from '$lib/api';
	import {
		networkErrorKind,
		networkState,
		refreshNetworkStatus,
		watchNetworkStatus,
		type NetworkReadError
	} from '$lib/stores/network';
	import {
		remoteAccess,
		remoteAccessView,
		watchRemoteAccess,
		type RemoteAccessBadge,
		type RemoteAccessLine
	} from '$lib/stores/remote-access';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import JoinDialog from './JoinDialog.svelte';
	import SignalBars from './SignalBars.svelte';
	import {
		formatReadTime,
		orderNetworks,
		refusalCodes,
		securityLabel,
		signalWord,
		statusWarning
	} from './network-text';
	import { connectedKey, listLacksConnected, markConnected } from './connected-network';

	let { role }: { role: string | null } = $props();

	let scan = $state<WifiScan | null>(null);
	let wifiError = $state<NetworkReadError | 'no_wifi_device' | null>(null);
	let wifiLoading = $state(true);
	let refreshing = $state(false);
	// Whether the last list was asked for with rescan=true.
	let askedRescan = $state(false);

	let joinTarget = $state<Pick<WifiNetwork, 'ssid' | 'security'> | null>(null);

	let forgetting = $state<string | null>(null);
	let forgetConfirm = $state<SavedWifiNetwork | null>(null);
	let forgetMessage = $state<string | null>(null);

	onMount(() => {
		const release = watchNetworkStatus();
		const releaseRemote = watchRemoteAccess();
		void loadWifi(false);
		return () => {
			release();
			releaseRemote();
		};
	});

	let wifiSeq = 0;
	let rescanSeq = 0;

	async function loadWifi(rescan: boolean) {
		const seq = ++wifiSeq;
		// The connection this request is made under; the answer counts as read for that one only.
		const asked = get(networkState);
		const askedFor = connectedKey(asked.status, asked.error !== null);
		if (rescan) {
			rescanSeq = seq;
			refreshing = true;
		}
		// Whether this answer may still change what is shown.
		const current = () => seq === wifiSeq || (rescan && seq === rescanSeq);
		try {
			const answer = await networkApi.wifi(rescan);
			if (!current()) return;
			scan = answer;
			rereadFor = askedFor;
			wifiError = null;
			askedRescan = rescan;
			wifiLoading = false;
		} catch (err) {
			if (!current()) return;
			wifiError = refusalCodes(err)?.includes('no_wifi_device')
				? 'no_wifi_device'
				: networkErrorKind(err);
			wifiLoading = false;
		} finally {
			if (rescan && seq === rescanSeq) refreshing = false;
		}
	}

	function retry() {
		void refreshNetworkStatus();
		if (wifiError && wifiError !== 'no_wifi_device') void loadWifi(false);
	}

	// After a join or a forget: the status and the lists change.
	function afterChange() {
		void refreshNetworkStatus();
		void loadWifi(false);
	}

	let status = $derived($networkState.status);
	let statusError = $derived($networkState.error);

	// The status read again after failed reads: the unit answers again.
	let statusFailedBefore = false;
	$effect(() => {
		const failed = statusError !== null;
		const answered = !failed && status !== null;
		untrack(() => {
			if (statusFailedBefore && answered && wifiError && wifiError !== 'no_wifi_device')
				void loadWifi(false);
		});
		statusFailedBefore = failed;
	});
	// The list has no network that the status shows connected: read it again
	// once for each change of the connected network, whatever the answer.
	let rereadFor: string | null = null;
	$effect(() => {
		const key = connectedKey(status, statusError !== null);
		const lacks = !!scan && !!status && listLacksConnected(scan, status, statusError !== null);
		untrack(() => {
			if (key === null) {
				rereadFor = null;
			} else if (lacks && key !== rereadFor && !wifiLoading) {
				rereadFor = key;
				void loadWifi(false);
			}
		});
	});
	// A list is shown although its last read failed.
	let wifiOld = $derived(!!scan && !!wifiError && wifiError !== 'no_wifi_device');
	let notAvailable = $derived(statusError === 'not_available' || wifiError === 'not_available');
	// The cards show an older status than the latest read could give.
	let staleSince = $derived(status && statusError ? $networkState.lastReadAt : null);

	let mayChange = $derived(role === 'admin' || role === 'operator');
	let permitted = $derived(!!status && status.permissions.control && status.permissions.modify);
	let canChange = $derived(mayChange && permitted);

	let generalProblems = $derived(status ? status.problems.filter((p) => p.device === null) : []);

	// The list with its connected marks taken from the status.
	let marked = $derived(scan ? markConnected(scan, status, statusError !== null) : null);
	let networks = $derived(marked ? orderNetworks(marked.networks) : []);
	let savedNetworks = $derived(marked?.saved ?? []);
	let inRange = $derived(new Set(scan?.networks.map((n) => n.ssid) ?? []));

	function cardTitle(i: NetworkInterface): string {
		const kind = i.type === 'wifi' ? $m.network_card_wifi : $m.network_card_ethernet;
		const same = status?.interfaces.filter((x) => x.type === i.type).length ?? 0;
		return same > 1 ? $m.network_card_named(kind, i.device) : kind;
	}

	function problemsOf(i: NetworkInterface) {
		return status?.problems.filter((p) => p.device === i.device) ?? [];
	}

	function badge(i: NetworkInterface): { tone: 'ok' | 'warn' | 'off'; text: string } {
		if (i.state === 'connected') {
			return problemsOf(i).length > 0
				? { tone: 'warn', text: $m.network_badge_attention }
				: { tone: 'ok', text: $m.network_badge_connected };
		}
		if (i.state === 'connecting') return { tone: 'warn', text: $m.network_badge_connecting };
		if (i.state === 'disconnected') return { tone: 'off', text: $m.network_badge_not_connected };
		if (i.type === 'ethernet' && i.state === 'unavailable')
			return { tone: 'off', text: $m.network_badge_no_cable };
		return { tone: 'off', text: $m.network_badge_not_available };
	}

	let remote = $derived($remoteAccess.status);
	let remoteView = $derived(remoteAccessView($remoteAccess));

	function remoteBadgeText(b: RemoteAccessBadge): string {
		if (b === 'connected') return $m.network_badge_connected;
		if (b === 'not_connected') return $m.network_badge_not_connected;
		if (b === 'connecting') return $m.network_badge_connecting;
		if (b === 'off') return $m.network_badge_off;
		if (b === 'sign_in') return $m.network_badge_sign_in;
		if (b === 'not_installed') return $m.network_badge_not_installed;
		return $m.network_badge_not_available;
	}

	function remoteLineText(l: RemoteAccessLine): string {
		if (l === 'not_connected') return $m.network_remote_not_connected;
		if (l === 'off') return $m.network_remote_off;
		if (l === 'needs_login') return $m.network_remote_needs_login;
		if (l === 'not_installed') return $m.network_remote_not_installed;
		return $m.network_remote_unavailable;
	}

	function errorText(kind: NetworkReadError | 'no_wifi_device', fallback: string): string {
		if (kind === 'service_unavailable') return $m.network_service_unavailable;
		if (kind === 'no_wifi_device') return $m.network_no_wifi_device;
		return fallback;
	}

	function savedWhere(s: SavedWifiNetwork): string {
		if (s.active) return $m.network_saved_active;
		return inRange.has(s.ssid) ? $m.network_saved_in_range : $m.network_saved_out_of_range;
	}

	async function forget(s: SavedWifiNetwork, force = false) {
		forgetting = s.uuid;
		forgetMessage = null;
		try {
			await networkApi.forget(s.uuid, force);
			forgetConfirm = null;
			afterChange();
		} catch (err) {
			const codes = refusalCodes(err);
			const code = (err as { status?: unknown } | null)?.status;
			if (typeof code !== 'number') {
				// No HTTP answer (aborted at its limit, or the link went): the unit
				// may have forgotten the network, so the outcome is read, not assumed.
				forgetConfirm = null;
				afterChange();
			} else if (codes?.includes('connection_active') && !force) {
				forgetConfirm = s;
			} else {
				forgetConfirm = null;
				if (codes?.includes('not_permitted')) forgetMessage = $m.network_forget_not_permitted;
				else if (code === 404) {
					forgetMessage = $m.network_forget_gone;
					void loadWifi(false);
				} else if (code === 501) wifiError = 'not_available';
				else if (code === 503) forgetMessage = $m.network_service_unavailable;
				else forgetMessage = $m.network_forget_failed;
			}
		} finally {
			forgetting = null;
		}
	}
</script>

{#snippet warning(code: string, wifi: boolean)}
	{@const w = statusWarning(code, wifi, $m)}
	<div class="action-notice" role="status" data-network-warning={code}>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path
				d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
			/>
			<line x1="12" y1="9" x2="12" y2="13" />
			<line x1="12" y1="17" x2="12.01" y2="17" />
		</svg>
		<div class="action-notice-text">
			<strong>{w.title}</strong>{#if w.body}
				{w.body}{/if}
			{#if w.tryText}<div class="notice-try">{$m.network_warn_try(w.tryText)}</div>{/if}
		</div>
	</div>
{/snippet}

{#snippet info(text: string, attr: string | undefined = undefined)}
	<p class="info-line" data-network-notice={attr}>
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="8" x2="12" y2="12" />
			<line x1="12" y1="16" x2="12.01" y2="16" />
		</svg>
		<span>{text}</span>
	</p>
{/snippet}

{#snippet failure(text: string, alert: boolean = true)}
	<div class="net-error" role={alert ? 'alert' : undefined}>
		<span>{text}</span>
		<button type="button" class="btn-device btn-mount" onclick={retry}>{$m.common_retry}</button>
	</div>
{/snippet}

{#snippet remoteCard()}
	<div class="net-remote">
		<div class="net-card" data-network-remote>
			<div class="net-card-head">
				<span class="icon" aria-hidden="true">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="2" y1="12" x2="22" y2="12" />
						<path
							d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
						/>
					</svg>
				</span>
				<span class="net-card-title">{$m.network_remote_title}</span>
				{#if remoteView}
					<span class="status-badge tone-{remoteView.tone}"
						><span class="status-dot dot-{remoteView.tone}"></span>{remoteBadgeText(
							remoteView.badge
						)}</span
					>
				{/if}
			</div>
			<p class="net-desc">{$m.network_remote_desc}</p>

			{#if !remoteView}
				<p class="net-loading">{$m.common_loading_ellipsis}</p>
			{:else}
				{#if remoteView.warnings > 0}
					<div class="action-notice" role="status" data-remote-warnings>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path
								d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
							/>
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
						<div class="action-notice-text">
							{$m.network_remote_warnings(remoteView.warnings)}
						</div>
					</div>
				{/if}
				{#if remoteView.line}
					<p class="net-empty" data-remote-body>{remoteLineText(remoteView.line)}</p>
				{/if}
				{#if remoteView.facts && remote}
					<dl class="net-facts">
						<dt>{$m.network_fact_name}</dt>
						{#if remote.name}<dd class="mono">{remote.name}</dd>{:else}<dd class="missing">
								{$m.network_fact_none}
							</dd>{/if}
						<dt>{$m.network_fact_addresses}</dt>
						{#if remote.addresses.length > 0}<dd class="mono">
								{remote.addresses.join(', ')}
							</dd>{:else}<dd class="missing">
								{$m.network_fact_none}
							</dd>{/if}
					</dl>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

<div class="config-section">
	<h2 class="section-title">{$m.config_section_network}</h2>

	{#if notAvailable}
		{@render info($m.network_not_available, 'not_available')}
		{@render remoteCard()}
	{:else}
		{#if !mayChange}
			{@render info($m.network_readonly, 'readonly')}
		{:else if status && !permitted}
			{@render info($m.network_not_permitted_notice, 'not_permitted')}
		{/if}

		{#each generalProblems as p (p.code)}
			<div class="net-general">{@render warning(p.code, false)}</div>
		{/each}

		<h3 class="sub-title">{$m.network_connections_title}</h3>
		{#if staleSince !== null}
			<div class="action-notice net-stale" role="status" data-network-notice="stale">
				<div class="action-notice-text">
					{$m.network_stale(formatReadTime(staleSince, $locale))}
				</div>
				<button type="button" class="btn-device btn-mount" onclick={retry}>{$m.common_retry}</button
				>
			</div>
		{/if}
		{#if status}
			<div class="net-grid">
				{#each status.interfaces as i (i.device)}
					{@const b = badge(i)}
					{@const live = i.state === 'connected' || i.state === 'connecting'}
					<div class="net-card">
						<div class="net-card-head">
							<span class="icon" aria-hidden="true">
								{#if i.type === 'wifi'}
									<svg
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M5 12.55a11 11 0 0 1 14.08 0" />
										<path d="M1.42 9a16 16 0 0 1 21.16 0" />
										<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
										<line x1="12" y1="20" x2="12.01" y2="20" />
									</svg>
								{:else}
									<svg
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<rect x="5" y="3" width="14" height="10" rx="1" />
										<path d="M8 13v3h8v-3" />
										<line x1="12" y1="16" x2="12" y2="21" />
										<line x1="9" y1="7" x2="9" y2="9" />
										<line x1="12" y1="7" x2="12" y2="9" />
										<line x1="15" y1="7" x2="15" y2="9" />
									</svg>
								{/if}
							</span>
							<span class="net-card-title">{cardTitle(i)}</span>
							<span class="status-badge tone-{b.tone}"
								><span class="status-dot dot-{b.tone}"></span>{b.text}</span
							>
						</div>

						{#each problemsOf(i) as p (p.code)}
							{@render warning(p.code, i.type === 'wifi')}
						{/each}

						{#if live}
							<dl class="net-facts">
								<dt>{$m.network_fact_network}</dt>
								<dd>
									{i.type === 'wifi' ? (i.ssid ?? i.connection ?? '—') : $m.network_fact_wired}
								</dd>
								{#if i.type === 'wifi' && i.signal !== null}
									<dt>{$m.network_fact_signal}</dt>
									<dd>{$m.network_signal_value(i.signal, signalWord(i.signal, $m))}</dd>
								{/if}
								<dt>{$m.network_fact_ip}</dt>
								{#if i.ipv4.length > 0}<dd class="mono">{i.ipv4.join(', ')}</dd>{:else}<dd
										class="missing"
									>
										{$m.network_fact_none}
									</dd>{/if}
								<dt>{$m.network_fact_gateway}</dt>
								{#if i.gateway}<dd class="mono">{i.gateway}</dd>{:else}<dd class="missing">
										{$m.network_fact_none}
									</dd>{/if}
								<dt>{$m.network_fact_dns}</dt>
								{#if i.dns.length > 0}<dd class="mono">{i.dns.join(', ')}</dd>{:else}<dd
										class="missing"
									>
										{$m.network_fact_none}
									</dd>{/if}
								{#if i.mac}
									<dt>{$m.network_fact_mac}</dt>
									<dd class="mono">{i.mac}</dd>
								{/if}
							</dl>
						{:else}
							{#if i.type === 'ethernet' && i.state === 'unavailable'}
								<p class="net-empty">{$m.network_eth_empty}</p>
							{:else if i.type === 'wifi'}
								<p class="net-empty">
									{canChange ? $m.network_wifi_empty_can : $m.network_wifi_empty_ro}
								</p>
							{/if}
							{#if i.mac}
								<dl class="net-facts">
									<dt>{$m.network_fact_mac}</dt>
									<dd class="mono">{i.mac}</dd>
								</dl>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{:else if statusError}
			{@render failure(errorText(statusError, $m.network_err_read))}
		{:else}
			<p class="net-loading">{$m.common_loading_ellipsis}</p>
		{/if}

		<!-- The Internet card (reachability, the sign-in page of a captive
         portal) attaches here once the backend reports it. -->
		{@render remoteCard()}

		<h3 class="sub-title">{$m.network_wifi_title}</h3>
		<div class="config-card">
			<div class="card-head-row">
				<div class="row-info">
					<span class="row-label">{$m.network_wifi_list_title}</span>
					<span class="row-desc"
						>{canChange ? $m.network_wifi_list_desc : $m.network_wifi_list_desc_ro}</span
					>
				</div>
				{#if wifiError !== 'no_wifi_device'}
					<button
						type="button"
						class="btn-refresh-devices"
						onclick={() => loadWifi(true)}
						disabled={refreshing}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<polyline points="23 4 23 10 17 10" />
							<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
						</svg>
						{refreshing ? $m.network_refreshing : $m.config_refresh_list}
					</button>
				{/if}
			</div>
			<div class="wifi-list">
				{#if wifiOld && wifiError}
					{@render failure(errorText(wifiError, $m.network_err_wifi))}
				{/if}
				{#if wifiError === 'no_wifi_device'}
					<p class="net-empty">{$m.network_no_wifi_device}</p>
				{:else if wifiError && !scan}
					{@render failure(errorText(wifiError, $m.network_err_wifi))}
				{:else if wifiLoading}
					<p class="net-loading">{$m.common_loading_ellipsis}</p>
				{:else if networks.length === 0}
					<p class="net-empty">{$m.network_wifi_none}</p>
				{:else}
					{#each networks as n (n.ssid)}
						<div class="device-row wifi-row" class:device-row-active={n.inUse} data-wifi-row>
							<div class="wifi-main">
								<SignalBars signal={n.signal} label={$m.network_signal_label(n.signal)} />
								<div class="device-info">
									<span class="device-name">{n.ssid}</span>
									<span class="device-meta">
										<span class="wifi-kind">
											{#if n.security === 'password'}
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													aria-hidden="true"
													><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path
														d="M7 11V7a5 5 0 0 1 10 0v4"
													/></svg
												>
											{:else if n.security === 'enterprise'}
												<svg
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													aria-hidden="true"
													><rect x="2" y="5" width="20" height="14" rx="2" /><circle
														cx="8"
														cy="12"
														r="2"
													/><line x1="13" y1="10" x2="18" y2="10" /><line
														x1="13"
														y1="14"
														x2="18"
														y2="14"
													/></svg
												>
											{/if}
											{securityLabel(n.security, $m)}
										</span>
										{#if n.saved}<span class="saved-mark">{$m.network_saved_mark}</span>{/if}
									</span>
								</div>
							</div>
							<div class="device-actions">
								{#if n.inUse}
									<span class="device-active-label">{$m.network_connected_mark}</span>
								{:else if canChange}
									<button
										type="button"
										class="btn-device btn-mount"
										aria-label={$m.network_join_aria(n.ssid)}
										onclick={() => (joinTarget = { ssid: n.ssid, security: n.security })}
										>{$m.network_join}</button
									>
								{/if}
							</div>
						</div>
					{/each}
					{#if askedRescan && scan && !scan.rescanned}
						{@render info($m.network_not_rescanned)}
					{/if}
				{/if}
			</div>
		</div>

		{#if scan && wifiError !== 'no_wifi_device'}
			<div class="config-card saved-card">
				<div class="card-head-row">
					<div class="row-info">
						<span class="row-label">{$m.network_saved_title}</span>
						<span class="row-desc"
							>{canChange ? $m.network_saved_desc_forget : $m.network_saved_desc}</span
						>
					</div>
				</div>
				<div class="wifi-list">
					{#if wifiOld && wifiError}
						{@render failure(errorText(wifiError, $m.network_err_wifi), false)}
					{/if}
					{#if forgetMessage}
						<div class="action-notice" role="alert">
							<div class="action-notice-text">{forgetMessage}</div>
						</div>
					{/if}
					{#if savedNetworks.length === 0}
						<p class="net-empty">{$m.network_saved_none}</p>
					{/if}
					{#each savedNetworks as s (s.uuid)}
						<div class="device-row" data-saved-row>
							<div class="device-info">
								<span class="device-name">{s.ssid}</span>
								<span class="device-meta saved-meta"
									>{$m.network_saved_meta(securityLabel(s.security, $m), savedWhere(s))}</span
								>
							</div>
							<div class="device-actions">
								{#if canChange}
									<button
										type="button"
										class="btn-device btn-unmount"
										aria-label={$m.network_forget_aria(s.ssid)}
										disabled={forgetting !== null}
										onclick={() => forget(s)}
										>{forgetting === s.uuid ? $m.network_forgetting : $m.network_forget}</button
									>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<p class="info-note">
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
			{$m.config_offline_note}
		</p>
	{/if}
</div>

{#if joinTarget}
	<JoinDialog network={joinTarget} onClose={() => (joinTarget = null)} onChanged={afterChange} />
{/if}

{#if forgetConfirm}
	{@const target = forgetConfirm}
	<div
		class="modal-backdrop"
		use:toBody
		use:dismissible={{ onDismiss: () => (forgetConfirm = null), escape: forgetting === null }}
	>
		<div
			class="modal-card dialog-fit"
			role="dialog"
			aria-modal="true"
			aria-labelledby="forget-active-title"
			aria-describedby="forget-active-desc"
			tabindex="-1"
			use:trapFocus
		>
			<h2 class="confirm-title" id="forget-active-title">
				{$m.network_forget_active_title(target.ssid)}
			</h2>
			<p class="confirm-desc" id="forget-active-desc">{$m.network_forget_active_body}</p>
			<div class="modal-actions">
				<button
					type="button"
					class="unit-btn-ghost"
					onclick={() => (forgetConfirm = null)}
					disabled={forgetting !== null}>{$m.common_cancel}</button
				>
				<button
					type="button"
					class="unit-btn-save"
					onclick={() => forget(target, true)}
					disabled={forgetting !== null}>{$m.network_forget_active_confirm}</button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.config-section {
		margin-bottom: 32px;
	}

	.section-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0 0 14px;
	}

	.sub-title {
		font-size: var(--text-h4);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 24px 0 12px;
	}

	.config-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}
	.saved-card {
		margin-top: 12px;
	}

	.row-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.row-label {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-bold);
	}
	.row-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}

	.card-head-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px 10px;
		gap: 12px;
	}

	/* The one warning style: app.css .action-notice, without its list margin. */
	.action-notice {
		margin: 0;
	}
	.action-notice .notice-try {
		color: var(--color-light-grey);
		margin-top: 4px;
	}
	.action-notice svg {
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--color-warning);
	}
	.net-general {
		margin-bottom: 14px;
	}
	.net-stale {
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}

	.info-line {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 16px;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.5;
	}
	.info-line svg {
		flex-shrink: 0;
		margin-top: 3px;
	}

	.info-note {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		opacity: 0.6;
		margin-top: 16px;
	}

	.net-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		padding: 10px 12px;
		border: 1px solid rgba(214, 103, 74, 0.45);
		border-radius: var(--radius-md);
		background-color: var(--color-error-bg);
		color: var(--color-light);
		font-size: var(--text-sm);
	}

	.net-loading,
	.net-empty {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.5;
	}

	.net-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	@media (max-width: 1100px) {
		.net-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.net-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	.net-card-head {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.net-remote {
		margin-top: 12px;
	}
	.net-desc {
		margin: -6px 0 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.5;
	}
	.net-card-head .icon {
		color: var(--color-light-grey);
		display: flex;
	}
	.net-card-title {
		font-size: var(--text-base);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		flex: 1;
	}

	.status-dot.dot-off {
		background-color: var(--color-light-grey);
	}
	.status-dot.dot-ok {
		background-color: var(--color-success);
	}
	.status-dot.dot-warn {
		background-color: var(--color-warning);
	}
	.tone-ok {
		color: var(--color-success);
	}
	.tone-warn {
		color: var(--color-warning);
	}
	.tone-off {
		color: var(--color-light-grey);
	}

	.net-facts {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 6px 16px;
		margin: 0;
		font-size: var(--text-sm);
	}
	.net-facts dt {
		color: var(--color-light-grey);
	}
	.net-facts dd {
		margin: 0;
		color: var(--color-light);
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	.net-facts dd.missing {
		color: var(--color-warning);
		font-weight: var(--fw-semibold);
	}
	.mono {
		font-family: monospace;
		font-size: 13px;
	}

	.wifi-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 20px 20px;
	}

	.device-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 12px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
	}
	.device-row-active {
		border-color: rgba(90, 140, 98, 0.4);
		background-color: rgba(90, 140, 98, 0.05);
	}
	.wifi-main {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		color: var(--color-light);
	}
	.device-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.device-name {
		font-size: var(--text-base);
		font-weight: var(--fw-semibold);
		color: var(--color-light);
		overflow-wrap: anywhere;
	}
	.device-meta {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.wifi-kind {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.device-actions {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.device-active-label {
		font-size: var(--text-sm);
		color: var(--color-primary);
		font-weight: var(--fw-semibold);
	}

	/* The storage list's "active" badge. */
	.saved-mark {
		display: inline-block;
		font-size: 10px;
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-primary);
		background-color: rgba(90, 140, 98, 0.15);
		border: 1px solid rgba(90, 140, 98, 0.35);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
	}

	.btn-device {
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		border: none;
		border-radius: var(--radius-sm);
		padding: 6px 14px;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		min-height: var(--touch-target-min);
	}
	.btn-device:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-mount {
		background-color: var(--color-surface-alt);
		color: var(--color-light);
		border: 1px solid var(--border-color);
	}
	.btn-mount:hover:not(:disabled) {
		background-color: var(--color-surface-alt-2);
	}
	.btn-unmount {
		background-color: transparent;
		color: var(--color-light-grey);
		border: 1px solid var(--border-color);
	}
	.btn-unmount:hover:not(:disabled) {
		color: var(--color-error);
		border-color: rgba(214, 103, 74, 0.5);
		background-color: rgba(214, 103, 74, 0.06);
	}

	.btn-refresh-devices {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-medium);
		color: var(--color-light-grey);
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px 0;
		min-height: var(--touch-target-min);
		transition: color var(--transition-fast);
	}
	.btn-refresh-devices:hover:not(:disabled) {
		color: var(--color-light);
	}
	.btn-refresh-devices:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* The confirmation, as UnitModeCard's. */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 24px;
	}
	.modal-card {
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 28px;
		width: 100%;
		max-width: 440px;
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		gap: 12px;
		outline: none;
	}
	.confirm-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0;
	}
	.confirm-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.6;
		margin: 0;
	}
	.modal-actions {
		display: flex;
		gap: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border-color);
		flex-wrap: wrap;
	}
	.unit-btn-save {
		flex: 1;
		min-height: var(--touch-target-min);
		padding: 0 22px;
		border: 0;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		color: white;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		cursor: pointer;
		transition: background-color var(--transition-base);
	}
	.unit-btn-save:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}
	.unit-btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.unit-btn-ghost {
		flex: 1;
		min-height: var(--touch-target-min);
		padding: 0 18px;
		background: none;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		color: var(--color-light-grey);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.unit-btn-ghost:hover:not(:disabled) {
		color: var(--color-light);
		border-color: rgba(255, 255, 255, 0.2);
	}
	.unit-btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.wifi-list {
			padding: 0 12px 16px;
		}
		.card-head-row {
			padding: 14px 12px 10px;
			flex-wrap: wrap;
		}
		.net-card {
			padding: 14px 14px;
		}
	}
</style>

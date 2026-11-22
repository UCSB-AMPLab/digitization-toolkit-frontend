<script lang="ts">
	// Joining a Wi-Fi network (NEH-253), in the NEH-248 dialog's look
	// (app.css .offsite-dialog-*). Three forms by the network's kind: open (no
	// field), password (the password), institutional (username, password,
	// sign-in server name, and under "More options" the outer identity and
	// the method, PEAP with MSCHAPv2 unless another is chosen). Under each
	// password field a note says the password is saved on the unit and anyone
	// with administrator access to it can read it.
	//
	// The obvious refusals are found before sending (joinFormProblems); every
	// refusal code of the 409 is shown beside its field or in the dialog, in
	// this interface's words. POST /network/wifi/join answers 202 and the join
	// runs on the unit; GET /network/wifi/join is then polled about once a
	// second until it is no longer `joining`. The request may have come over
	// the very link the join changes, so failed polls are tolerated for up to
	// 240 s (GIVE_UP_MS), after which the dialog says the unit cannot be
	// reached and may now be on another network, and keeps polling quietly for
	// up to 120 s more. A poll that gets an answer then means the unit is
	// reachable again, and what it reports replaces "cannot reach" as it would
	// have while joining: an outcome for this join, "cannot tell" for another
	// join, "did not receive the request" for the join from before the POST.
	// Each poll gives up after 5 s.
	//
	// The POST gives up after 10 s. A POST that gets no HTTP answer (a network
	// error or that timeout) may still have reached the unit before the link
	// changed, so the dialog polls as if it had been accepted and decides from
	// what the unit reports. A POST answered with an error status is a real
	// answer: a 409 shows its refusals, a 501 and a 503 their own messages, and
	// anything else says the unit did not accept the request.
	//
	// Whose join a poll reports is decided without the browser's clock, since
	// a unit without internet often has a wrong one. Just before the POST the
	// dialog reads the last join once (3 s at most) and keeps its `startedAt`
	// (null when idle). With a 202, that answer's `startedAt` is this join and
	// later answers must carry it; anything else ends in "cannot tell how the
	// join ended", with the network state read again. With no HTTP answer, an
	// answer for this SSID whose `startedAt` differs from the one read before
	// the POST is this join (or, if that read failed, the first answer for
	// this SSID). Idle, another SSID or the join from before the POST mean the
	// request may not have arrived: polling goes on for 15 s for a newer join,
	// and then the dialog says the unit did not receive the request.
	//
	// After 240 s of `joining` answers (JOINING_LIMIT_MS) the dialog says it
	// cannot tell how the join ended, reads the network state again, and keeps
	// polling quietly for up to 120 s more; an outcome for this join that
	// arrives then replaces "cannot tell". The 205 s bound on a join (see
	// GIVE_UP_MS) holds for a join that fails: 30 s before the activation and
	// 175 s after it. A join that succeeds can stay `joining` longer, because
	// the backend removes duplicate saved profiles before it reports the
	// outcome, and that step has no fixed bound: it grows with the number of
	// saved Wi-Fi profiles. In that case the dialog shows "cannot tell" at the
	// limit, and the real outcome replaces it if it arrives during the quiet
	// polling.
	//
	// The password, username and outer identity live only in this component's
	// state: they are sent in the POST body and nowhere else, never logged,
	// and cleared when the dialog closes (and the password once joined).
	//
	// Version: 0.3.3

	import { onDestroy } from 'svelte';
	import { m } from '$lib/i18n';
	import {
		networkApi,
		type WifiJoinProblem,
		type WifiJoinRequest,
		type WifiNetwork
	} from '$lib/api';
	import { networkState, refreshNetworkStatus } from '$lib/stores/network';
	import { dismissible, toBody, trapFocus } from '$lib/dialog';
	import {
		joinFailureText,
		joinFormProblems,
		refusalCodes,
		refusalField,
		refusalText,
		type JoinField
	} from './network-text';

	const POLL_MS = 1000;
	// The backend's bounds for a failed join (app/core/network.py). A command
	// that outlives its limit is stopped, which takes up to _HALT_GRACE (5 s)
	// more. Before the activation, with the old link still up: the read of the
	// active connection (_READ_TIMEOUT, 15 s) and the profile add
	// (_WRITE_TIMEOUT, 15 s), 30 s for a join that goes on. From the
	// activation, which takes the old connection down: the activation,
	// _UP_TIMEOUT (60 s), checked only between ticks, and a tick's journal
	// read can take _JOURNAL_TIMEOUT plus the grace (10 s), then the grace to
	// stop it (5 s): 75 s; the final journal read, 10 s; the profile delete,
	// _WRITE_TIMEOUT plus the grace, 20 s; the read of the active connection,
	// 20 s: 125 s; then `connection up` of the old connection,
	// _RESTORE_TIMEOUT (45 s) plus the grace, 50 s: 175 s. When NetworkManager
	// is already bringing the old connection back, the read answers within
	// 15 s and its activation and DHCP (NetworkManager's default DHCP
	// timeout, 45 s) follow: 165 s. So the backend's own sequence takes the
	// unit off its old link for at most 175 s, and a join that fails ends
	// within 205 s. A join that succeeds can take longer: the backend removes
	// duplicate saved profiles before it reports the outcome, and that step
	// has no fixed bound.
	//
	// The old link can come up later than 175 s. When `nmcli --wait` gives up
	// at 30 s, NetworkManager goes on trying for DHCP (45 s by default), about
	// 200 s in all.
	//
	// Failed polls are counted from the first one, which comes after the old
	// link went down: 240 s leaves about 40 s after those 200 s for the
	// browser's own machine to rejoin that network. A "cannot reach" shown too
	// early is replaced when the unit answers.
	const GIVE_UP_MS = 240_000;
	const REQUEST_TIMEOUT_MS = 5000;
	const POST_TIMEOUT_MS = 10_000;
	const PRIOR_TIMEOUT_MS = 3000;
	// Counted from when polling begins, after the POST has been answered or
	// given up, so after the join began. A join that fails ends within 205 s,
	// which leaves 35 s of margin; a join that succeeds can stay `joining`
	// longer (see the header comment), and the real outcome replaces "cannot
	// tell" if it arrives during the quiet polling.
	const JOINING_LIMIT_MS = 240_000;
	// Both "cannot tell" and "cannot reach" come after the join has ended;
	// the quiet polling is for the unit to be reachable again.
	const QUIET_MS = 120_000;
	const NEWER_WAIT_MS = 15_000;

	let {
		network,
		onClose,
		onChanged
	}: {
		network: Pick<WifiNetwork, 'ssid' | 'security'>;
		onClose: () => void;
		onChanged?: () => void;
	} = $props();

	const uid = $props.id();

	type Phase =
		| 'form'
		| 'sending'
		| 'joining'
		| 'joined'
		| 'failed'
		| 'lost'
		| 'unknown'
		| 'not_received';
	type Method = 'peap' | 'ttls-pap' | 'ttls-mschapv2';

	let phase = $state<Phase>('form');
	let password = $state('');
	let identity = $state('');
	let serverName = $state('');
	let anonymousIdentity = $state('');
	let method = $state<Method>('peap');
	let moreOpen = $state(false);
	let showPassword = $state(false);

	let fieldErrors = $state<Partial<Record<JoinField, string>>>({});
	let dialogError = $state<string | null>(null);

	let problem = $state<WifiJoinProblem | null>(null);
	let restored = $state<boolean | null>(null);
	let noAnswer = $state(false);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let failingSince: number | null = null;
	let alive = true;
	// This join: when polling began, the unit's `startedAt` for it once known,
	// whether the POST got an HTTP answer, the last join read before the POST
	// (`undefined` when that read failed), and since when only older joins
	// have been reported.
	let joiningSince = 0;
	let anchor: string | null = null;
	let answered = false;
	let prior: string | null | undefined = undefined;
	let olderSince: number | null = null;
	// Polling on quietly after "cannot tell" or "cannot reach", until this time.
	let quietUntil = 0;

	onDestroy(() => {
		alive = false;
		if (timer !== null) clearTimeout(timer);
	});

	let enterprise = $derived(network.security === 'enterprise');
	let needsPassword = $derived(network.security !== 'open');
	let closable = $derived(phase !== 'sending' && phase !== 'joining');

	// The unit's address on the network it joined, once the status says so.
	let joinedAddress = $derived.by(() => {
		const iface = $networkState.status?.interfaces.find(
			(i) => i.type === 'wifi' && i.state === 'connected' && i.ssid === network.ssid
		);
		return iface?.ipv4[0]?.split('/')[0] ?? null;
	});

	let serverNames = $derived(
		problem?.server?.names?.filter((n) => typeof n === 'string' && n) ?? []
	);

	function fieldsOfForm(): JoinField[] {
		if (network.security === 'password') return ['password'];
		if (network.security === 'enterprise')
			return ['password', 'identity', 'anonymousIdentity', 'method', 'serverName'];
		return [];
	}

	function showRefusal(codes: string[]) {
		const fields = fieldsOfForm();
		const errors: Partial<Record<JoinField, string>> = {};
		let inDialog: string | null = null;
		for (const code of codes) {
			const field = refusalField(code);
			if (field !== 'dialog' && fields.includes(field)) {
				errors[field] ??= refusalText(code, $m);
				if (field === 'anonymousIdentity' || field === 'method') moreOpen = true;
			} else {
				inDialog ??= refusalText(code, $m);
			}
		}
		fieldErrors = errors;
		dialogError = inDialog;
	}

	function requestBody(): WifiJoinRequest {
		const ssid = network.ssid;
		if (network.security === 'open') return { ssid, security: 'open' };
		if (network.security === 'password') return { ssid, security: 'password', password };
		return {
			ssid,
			security: 'enterprise',
			identity,
			password,
			serverName: serverName.trim(),
			method: method === 'peap' ? 'peap' : 'ttls',
			innerMethod: method === 'ttls-pap' ? 'pap' : 'mschapv2',
			...(anonymousIdentity ? { anonymousIdentity } : {})
		};
	}

	async function submit(event?: SubmitEvent) {
		event?.preventDefault();
		if (phase !== 'form') return;
		fieldErrors = {};
		dialogError = null;
		const codes = joinFormProblems({
			ssid: network.ssid,
			security: network.security,
			password,
			identity,
			serverName: serverName.trim(),
			anonymousIdentity
		});
		if (codes.length > 0) {
			showRefusal(codes);
			return;
		}
		phase = 'sending';
		anchor = null;
		answered = false;
		olderSince = null;
		quietUntil = 0;
		prior = await readPrior();
		if (!alive) return;
		const controller = new AbortController();
		const abort = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
		try {
			const accepted = await networkApi.join(requestBody(), controller.signal);
			answered = true;
			if (accepted?.ssid === network.ssid && typeof accepted.startedAt === 'string')
				anchor = accepted.startedAt;
		} catch (err) {
			if (!alive) return;
			const status = (err as { status?: unknown } | null)?.status;
			if (typeof status === 'number') {
				phase = 'form';
				const refused = refusalCodes(err);
				if (refused && refused.some((c) => c)) showRefusal(refused);
				else if (status === 501) dialogError = $m.network_not_available;
				else if (status === 503) dialogError = $m.network_service_unavailable;
				else dialogError = $m.network_refusal_other;
				return;
			}
			// No HTTP answer: the unit may have started the join anyway.
		} finally {
			clearTimeout(abort);
		}
		if (!alive) return;
		phase = 'joining';
		noAnswer = false;
		failingSince = null;
		joiningSince = Date.now();
		schedule();
	}

	/** The `startedAt` of the last join before this one: null when idle, undefined when it cannot be read. */
	async function readPrior(): Promise<string | null | undefined> {
		const controller = new AbortController();
		const abort = setTimeout(() => controller.abort(), PRIOR_TIMEOUT_MS);
		try {
			const last = await networkApi.joinState(controller.signal);
			if (!last || last.state === 'idle') return null;
			return typeof last.startedAt === 'string' ? last.startedAt : null;
		} catch {
			return undefined;
		} finally {
			clearTimeout(abort);
		}
	}

	/**
	 * Whether a poll's answer is this dialog's join: 'this', 'other' (another
	 * join, once this one is known or the POST was answered), or 'older' (no
	 * HTTP answer, and nothing newer than before the POST yet).
	 */
	function whoseJoin(answer: {
		state: string;
		ssid: string | null;
		startedAt: string | null;
	}): 'this' | 'other' | 'older' {
		const ours =
			answer.state !== 'idle' &&
			answer.ssid === network.ssid &&
			typeof answer.startedAt === 'string';
		if (anchor !== null) return ours && answer.startedAt === anchor ? 'this' : 'other';
		if (answered) {
			// A 202 without a start time: the first answer for this SSID is it.
			if (!ours) return 'other';
			anchor = answer.startedAt;
			return 'this';
		}
		if (ours && (prior === undefined || answer.startedAt !== prior)) {
			anchor = answer.startedAt;
			return 'this';
		}
		return 'older';
	}

	// The outcome cannot be told: say so and read the network state again.
	function cannotTell() {
		phase = 'unknown';
		password = '';
		void refreshNetworkStatus();
		onChanged?.();
	}

	function schedule() {
		timer = setTimeout(poll, POLL_MS);
	}

	async function poll() {
		timer = null;
		const controller = new AbortController();
		const abort = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		let answer: Awaited<ReturnType<typeof networkApi.joinState>> | null = null;
		try {
			answer = await networkApi.joinState(controller.signal);
		} catch {
			answer = null;
		} finally {
			clearTimeout(abort);
		}
		const quiet = (phase === 'unknown' || phase === 'lost') && quietUntil > 0;
		if (!alive || (phase !== 'joining' && !quiet)) return;
		const reached = answer !== null && typeof answer.state === 'string';
		// After "cannot reach", an answer means the unit is reachable again.
		const backFromLost = phase === 'lost' && reached;
		if (quiet && !backFromLost) {
			// After "cannot tell", or "cannot reach" with no answer: only an outcome for this join is shown.
			if (answer && reached && answer.state !== 'joining' && whoseJoin(answer) === 'this') {
				settle(answer);
			} else if (Date.now() < quietUntil) {
				schedule();
			}
			return;
		}
		if (backFromLost) {
			phase = 'joining';
			quietUntil = 0;
		}

		if (!answer || typeof answer.state !== 'string') {
			const now = Date.now();
			failingSince ??= now;
			if (now - failingSince >= GIVE_UP_MS) {
				phase = 'lost';
				quietUntil = now + QUIET_MS;
				schedule();
				return;
			}
			noAnswer = true;
			schedule();
			return;
		}
		failingSince = null;
		noAnswer = false;

		const whose = whoseJoin(answer);
		if (whose === 'other') {
			cannotTell();
		} else if (whose === 'older') {
			const now = Date.now();
			olderSince ??= now;
			// After "cannot reach" a join that had arrived would be reported by now.
			if (backFromLost || now - olderSince >= NEWER_WAIT_MS) phase = 'not_received';
			else schedule();
		} else if (answer.state === 'joining') {
			if (Date.now() - joiningSince >= JOINING_LIMIT_MS) {
				cannotTell();
				quietUntil = Date.now() + QUIET_MS;
				schedule();
			} else {
				schedule();
			}
		} else {
			settle(answer);
		}
	}

	function settle(answer: Awaited<ReturnType<typeof networkApi.joinState>>) {
		quietUntil = 0;
		if (answer.state === 'joined') {
			phase = 'joined';
			password = '';
		} else {
			phase = 'failed';
			problem = answer.problem;
			restored = answer.restored;
		}
		onChanged?.();
	}

	function tryAgain() {
		phase = 'form';
		problem = null;
		restored = null;
		fieldErrors = {};
		dialogError = null;
	}

	function close() {
		if (!closable) return;
		if (timer !== null) clearTimeout(timer);
		timer = null;
		quietUntil = 0;
		password = '';
		identity = '';
		serverName = '';
		anonymousIdentity = '';
		onClose();
	}
</script>

{#snippet fieldError(field: JoinField)}
	{#if fieldErrors[field]}
		<p class="uf-error" id="{uid}-{field}-error" data-field-error={field}>{fieldErrors[field]}</p>
	{/if}
{/snippet}

{#snippet passwordField(placeholder: string)}
	<div class="uf-field">
		<label class="uf-label" for="{uid}-password">{$m.common_password_label}</label>
		<div class="password-wrapper">
			<input
				id="{uid}-password"
				name="wifi-passphrase"
				class="uf-input"
				type={showPassword ? 'text' : 'password'}
				autocomplete="new-password"
				autocapitalize="none"
				spellcheck="false"
				{placeholder}
				bind:value={password}
				aria-invalid={fieldErrors.password ? 'true' : undefined}
				aria-describedby="{uid}-password-note{fieldErrors.password ? ` ${uid}-password-error` : ''}"
			/>
			<button
				type="button"
				class="eye-btn"
				aria-label={showPassword ? $m.common_hide_password : $m.common_show_password}
				onclick={() => (showPassword = !showPassword)}
			>
				<svg
					viewBox="0 0 24 24"
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
					<circle cx="12" cy="12" r="3" />
				</svg>
			</button>
		</div>
		{@render fieldError('password')}
		<p class="uf-hint is-secret" id="{uid}-password-note">
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
			<span>{$m.network_password_note}</span>
		</p>
	</div>
{/snippet}

{#snippet wifiIcon()}
	<svg
		width="22"
		height="22"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		aria-hidden="true"
	>
		<path d="M5 12.55a11 11 0 0 1 14.08 0" />
		<path d="M1.42 9a16 16 0 0 1 21.16 0" />
		<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
		<line x1="12" y1="20" x2="12.01" y2="20" />
	</svg>
{/snippet}

<div
	class="offsite-dialog-backdrop"
	use:toBody
	use:dismissible={{ onDismiss: close, escape: closable, backdrop: false }}
>
	<div
		class="offsite-dialog-card dialog-fit"
		role="dialog"
		aria-modal="true"
		aria-labelledby="{uid}-title"
		tabindex="-1"
		use:trapFocus
	>
		{#if phase === 'form' || phase === 'sending'}
			<h2 class="offsite-dialog-title" id="{uid}-title">
				{@render wifiIcon()}
				{$m.network_join_title(network.ssid)}
			</h2>
			<form class="join-form" onsubmit={submit} novalidate>
				<p class="offsite-dialog-body offsite-dialog-muted join-lead">
					{network.security === 'open'
						? $m.network_join_open_body
						: network.security === 'password'
							? $m.network_join_password_body
							: $m.network_join_enterprise_body}
				</p>

				{#if enterprise}
					<div class="uf-field">
						<label class="uf-label" for="{uid}-identity">{$m.common_username_label}</label>
						<input
							id="{uid}-identity"
							name="wifi-identity"
							class="uf-input"
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
							placeholder="name@example.edu"
							bind:value={identity}
							aria-invalid={fieldErrors.identity ? 'true' : undefined}
							aria-describedby={fieldErrors.identity
								? `${uid}-identity-error`
								: `${uid}-identity-hint`}
						/>
						{@render fieldError('identity')}
						<p class="uf-hint" id="{uid}-identity-hint">{$m.network_username_hint}</p>
					</div>
				{/if}

				{#if needsPassword}
					{@render passwordField(
						enterprise
							? $m.network_enterprise_password_placeholder
							: $m.network_password_placeholder
					)}
				{/if}

				{#if enterprise}
					<div class="uf-field">
						<label class="uf-label" for="{uid}-server">{$m.network_server_label}</label>
						<input
							id="{uid}-server"
							name="wifi-server"
							class="uf-input"
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
							placeholder="radius.example.edu"
							bind:value={serverName}
							aria-invalid={fieldErrors.serverName ? 'true' : undefined}
							aria-describedby={fieldErrors.serverName
								? `${uid}-serverName-error`
								: `${uid}-server-hint`}
						/>
						{@render fieldError('serverName')}
						<p class="uf-hint" id="{uid}-server-hint">{$m.network_server_hint}</p>
					</div>

					<div class="accordion-item join-more">
						<button
							type="button"
							class="accordion-trigger"
							aria-expanded={moreOpen}
							aria-controls="{uid}-more"
							onclick={() => (moreOpen = !moreOpen)}
						>
							{$m.network_more_options}
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
								style="transform: rotate({moreOpen ? 180 : 0}deg); transition: transform 0.2s ease"
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{#if moreOpen}
							<div class="accordion-content join-more-content" id="{uid}-more">
								<div class="uf-field">
									<label class="uf-label" for="{uid}-outer">{$m.network_outer_identity}</label>
									<input
										id="{uid}-outer"
										name="wifi-outer-identity"
										class="uf-input"
										autocomplete="off"
										autocapitalize="none"
										spellcheck="false"
										placeholder="anonymous@example.edu"
										bind:value={anonymousIdentity}
										aria-invalid={fieldErrors.anonymousIdentity ? 'true' : undefined}
									/>
									{@render fieldError('anonymousIdentity')}
									<p class="uf-hint">{$m.network_outer_identity_hint}</p>
								</div>
								<div class="uf-field">
									<label class="uf-label" for="{uid}-method">{$m.network_method}</label>
									<select
										id="{uid}-method"
										class="uf-input"
										bind:value={method}
										aria-invalid={fieldErrors.method ? 'true' : undefined}
									>
										<option value="peap">{$m.network_method_peap}</option>
										<option value="ttls-pap">{$m.network_method_ttls_pap}</option>
										<option value="ttls-mschapv2">{$m.network_method_ttls_mschapv2}</option>
									</select>
									{@render fieldError('method')}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				{#if dialogError}
					<p class="join-error" role="alert" data-dialog-error>{dialogError}</p>
				{/if}

				<div class="offsite-dialog-actions">
					<button
						type="button"
						class="unit-btn-ghost"
						onclick={close}
						disabled={phase === 'sending'}>{$m.common_cancel}</button
					>
					<button type="submit" class="unit-btn-save" disabled={phase === 'sending'}>
						{phase === 'sending' ? $m.config_sending : $m.network_join}
					</button>
				</div>
			</form>
		{:else if phase === 'joining'}
			<h2 class="offsite-dialog-title" id="{uid}-title">
				{@render wifiIcon()}
				{$m.network_joining_title(network.ssid)}
			</h2>
			<div class="offsite-dialog-wait" role="status">
				<div class="join-spinner" aria-hidden="true"></div>
				<p class="offsite-dialog-body">{$m.network_joining_body}</p>
			</div>
			{#if noAnswer}
				<p class="offsite-dialog-body offsite-dialog-muted join-small">
					{$m.network_joining_no_answer}
				</p>
			{/if}
		{:else if phase === 'joined'}
			<h2 class="offsite-dialog-title success" id="{uid}-title">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
				{$m.network_joined_title(network.ssid)}
			</h2>
			<p class="offsite-dialog-body">
				{joinedAddress ? $m.network_joined_address(joinedAddress) : $m.network_joined_body}
			</p>
			<p class="offsite-dialog-body offsite-dialog-muted join-small">{$m.network_joined_saved}</p>
			<div class="offsite-dialog-actions">
				<button type="button" class="unit-btn-save" onclick={close}>{$m.common_close}</button>
			</div>
		{:else if phase === 'failed'}
			<h2 class="offsite-dialog-title error" id="{uid}-title">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
				</svg>
				{$m.network_failed_title(network.ssid)}
			</h2>
			<p class="offsite-dialog-body">{joinFailureText(problem?.code, $m)}</p>
			{#if (problem?.code === 'server_name_mismatch' || problem?.code === 'server_not_trusted') && serverNames.length > 0}
				<p class="offsite-dialog-body join-small">
					{$m.network_fail_server_names(serverNames.join(', '))}
				</p>
			{/if}
			{#if restored === true}
				<p class="offsite-dialog-body offsite-dialog-muted join-small">
					{$m.network_restored_true}
				</p>
			{:else if restored === false}
				<p class="offsite-dialog-body offsite-dialog-muted join-small">
					{$m.network_restored_false}
				</p>
			{/if}
			<div class="offsite-dialog-actions">
				<button type="button" class="unit-btn-ghost" onclick={close}>{$m.common_close}</button>
				<button type="button" class="unit-btn-save" onclick={tryAgain}>{$m.common_retry}</button>
			</div>
		{:else if phase === 'not_received'}
			<h2 class="offsite-dialog-title" id="{uid}-title">
				{@render wifiIcon()}
				{$m.network_not_received_title}
			</h2>
			<p class="offsite-dialog-body">{$m.network_not_received_body}</p>
			<div class="offsite-dialog-actions">
				<button type="button" class="unit-btn-ghost" onclick={close}>{$m.common_close}</button>
				<button type="button" class="unit-btn-save" onclick={tryAgain}>{$m.common_retry}</button>
			</div>
		{:else if phase === 'unknown'}
			<h2 class="offsite-dialog-title" id="{uid}-title">
				{@render wifiIcon()}
				{$m.network_unknown_title}
			</h2>
			<p class="offsite-dialog-body">{$m.network_unknown_body}</p>
			<div class="offsite-dialog-actions">
				<button type="button" class="unit-btn-save" onclick={close}>{$m.common_close}</button>
			</div>
		{:else}
			<h2 class="offsite-dialog-title error" id="{uid}-title">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="10" />
					<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
				</svg>
				{$m.network_lost_title}
			</h2>
			<p class="offsite-dialog-body">{$m.network_lost_body}</p>
			<div class="offsite-dialog-actions">
				<button type="button" class="unit-btn-save" onclick={close}>{$m.common_close}</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.offsite-dialog-title svg {
		flex-shrink: 0;
	}
	.offsite-dialog-title.success svg {
		color: var(--color-success);
	}
	.offsite-dialog-title.error svg {
		color: var(--color-error);
	}

	.join-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
	}
	.join-lead,
	.join-small {
		font-size: var(--text-sm);
	}

	/* The dashboard form fields of users/+page.svelte. */
	.uf-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.uf-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.uf-input {
		font-family: var(--font-family);
		font-size: var(--text-sm);
		color: var(--color-light);
		background-color: var(--color-surface-alt-2);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		padding: 9px 12px;
		outline: none;
		min-height: var(--touch-target-min);
		width: 100%;
		box-sizing: border-box;
	}
	.uf-input:focus {
		border-color: var(--color-primary);
	}
	.uf-input[aria-invalid='true'] {
		border-color: var(--border-color-error);
	}
	.uf-input::placeholder {
		color: var(--color-light-grey);
		opacity: 0.5;
	}
	select.uf-input {
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23ABB7B7' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 12px center;
		padding-right: 36px;
		cursor: pointer;
	}
	.password-wrapper {
		position: relative;
	}
	.password-wrapper .uf-input {
		padding-right: 44px;
	}
	.eye-btn {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--color-light-grey);
		cursor: pointer;
	}
	.eye-btn:hover {
		color: var(--color-light);
	}
	.uf-hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.45;
	}
	.uf-hint.is-secret {
		display: flex;
		gap: 6px;
		align-items: flex-start;
	}
	.uf-hint.is-secret svg {
		flex-shrink: 0;
		margin-top: 3px;
	}
	.uf-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-error);
		line-height: 1.45;
	}

	.join-more {
		background-color: var(--color-surface-alt-2);
		margin-bottom: 0;
	}
	.join-more .accordion-trigger {
		font-size: var(--text-sm);
		padding: 12px 16px;
	}
	.join-more-content {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.join-error {
		margin: 0;
		padding: 10px 12px;
		border: 1px solid rgba(214, 103, 74, 0.45);
		border-radius: var(--radius-md);
		background-color: var(--color-error-bg);
		color: var(--color-light);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.join-spinner {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border: 3px solid var(--border-color);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: join-spin 0.8s linear infinite;
	}
	@keyframes join-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* UnitModeCard's buttons. */
	.unit-btn-save {
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
</style>

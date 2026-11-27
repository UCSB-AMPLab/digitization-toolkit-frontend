<script lang="ts">
	// The first-run wizard (NEH-336), shown while `/auth/setup/status` says the
	// unit needs setting up; otherwise, or when the status cannot be read, the
	// page goes to `/login`. `/welcome` and the login page lead here on a unit
	// with no account. Four steps:
	//
	// 1. Language: one button per language, each in its own. `setLanguage`
	//    writes the cookie and loads `/setup?step=account`, so the rest of the
	//    wizard renders in that language from the server on.
	// 2. Administrator account. At the unit's own screen (the backend, asked
	//    directly at its own address, says the request is local; see
	//    $lib/first-run) the account is created there, with no token. From
	//    anywhere else, or when the direct call fails, the form asks for the
	//    bootstrap token, says that set-up is meant to be done at the unit's
	//    screen, and posts through the API. The language of step 1 goes with
	//    the registration as the unit's default. The new administrator is then
	//    signed in with the same credentials. Once the registration has been
	//    sent, no status answer moves the wizard: the status request still in
	//    flight is aborted and its answer ignored, and only the wizard's own
	//    steps decide where it goes.
	//    A registration that ends in anything but a success or a refusal about
	//    the fields (a 4xx about them, or the token's or set-up's refusal) may
	//    or may not have created the account: no answer in time
	//    (REGISTER_TIMEOUT_MS direct, the API's own limit otherwise), a network
	//    error, a 5xx, or a 401 or 403 that means an account now exists. The
	//    wizard then says neither "failed" nor "created": it reads the status.
	//    With no account the form comes back. With one, it signs in with the
	//    username and password just entered: a success means the account is
	//    this person's, and the wizard goes on as after a registration; a
	//    refused sign-in means it is someone else's, and the wizard says so and
	//    links to the sign-in page. When the status cannot be read, the wizard
	//    says it got no answer and offers to check again.
	//    Every request the wizard starts is aborted when it is destroyed, and
	//    no answer moves it afterwards.
	// 3. Network: Settings > Network, with Continue and Set up later; both go
	//    on to step 4.
	// 4. Time zone (NEH-366): the zones GET /system/timezone lists, the zone
	//    the unit keeps selected. Continue sends the zone selected (PUT, only a zone the list holds) and
	//    goes to the Overview; on a refusal it shows the sentence for its code
	//    (timezoneRefusalText, from Settings > This unit) and stays. Set up
	//    later goes to the Overview with no PUT. Continue waits for the zones
	//    to be read (disabled until the read answers); while the PUT runs,
	//    neither button acts. The state is Settings > This unit's
	//    (ThisUnitCard's unitTimezone). When the unit cannot set the
	//    zone (`canSet` false) the select is disabled with that reason, and
	//    when the zone cannot be read it shows "Not available" with no select;
	//    either way Continue goes on with no PUT.
	//
	// Keyboard and mouse only. Fits 800x480.
	//
	// Version: 0.4.0

	import { onMount, untrack } from 'svelte';
	import { pageLife, type Operation } from '$lib/page-life';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authApi, usersApi } from '$lib/api';
	import { m, locale, setLanguage, type Locale } from '$lib/i18n';
	import { authStore, isUserRole } from '$lib/stores/auth';
	import CaptuaLogo from '$lib/components/CaptuaLogo.svelte';
	import PasswordField from '$lib/components/PasswordField.svelte';
	import NetworkSection from '../../(dashboard)/dashboard/config/NetworkSection.svelte';
	import {
		readTimezone,
		saveTimezone,
		nextChoice,
		selectedZone,
		timezoneRefusalText,
		zoneListed,
		unitTimezone
	} from '../../(dashboard)/dashboard/config/ThisUnitCard.svelte';
	import nehSeal from '$lib/assets/neh-preferred-seal-white.png';
	import { normalizeEmail, emailFormatError } from '$lib/email-field';
	import {
		directBackendBase,
		isLocalUnit,
		registerAtUnit,
		FirstRunTimeout,
		REGISTER_TIMEOUT_MS
	} from '$lib/first-run';
	import {
		PASSWORD_MIN_LENGTH,
		passwordTooShort,
		isPasswordTooShortRefusal
	} from '$lib/password-rule';

	type Step = 'language' | 'account' | 'network' | 'timezone';
	const STEPS = 4;

	let step = $state<Step>(
		untrack(() => ($page.url.searchParams.get('step') === 'account' ? 'account' : 'language'))
	);

	// Each label is in its own language whatever the current one is.
	const STARTS: { code: Locale; greeting: string; label: string }[] = [
		{ code: 'en', greeting: 'Hello!', label: 'Get started in English' },
		{ code: 'es', greeting: '¡Hola!', label: 'Empezar en español' }
	];

	// null until the direct status call has answered or failed.
	let local = $state<boolean | null>(null);
	let directBase: string | null = null;

	let username = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let bootstrapToken = $state('');

	// One busy state for every request the wizard makes: the registration,
	// the status reads, the sign-in and its /users/me. While it is set, every
	// field and button of the account step is disabled and a submit is ignored.
	let busy = $state(false);
	let errorMessage = $state('');
	// The account exists but signing in with it failed.
	let signInFailed = $state(false);
	// An account exists and the sign-in with what was entered was refused.
	let otherAccount = $state(false);
	// The status could not be read after an uncertain registration.
	let noAnswer = $state(false);
	let checkFailed = $state(false);
	let leaving = false;

	// Each request's answer acts only while its operation is current
	// ($lib/page-life): the wizard is mounted and, for the first status check,
	// no registration has started. The registration and everything after it is
	// one operation of the kind 'account'.
	const life = pageLife();
	// The username of the uncertain registration, for the check.
	let pendingName = '';

	onMount(() => {
		const first = life.begin('first');
		authApi
			.setupStatus(first.signal)
			.then(({ needs_setup }) => {
				if (!first.current()) return;
				if (!needs_setup) goto('/login');
			})
			.catch(() => {
				if (!first.current()) return;
				goto('/login');
			});
		directBase = directBackendBase(window.location.hostname);
		const localCheck = life.begin('local');
		isLocalUnit(directBase).then((answer) => {
			if (localCheck.current()) local = answer;
		});
	});

	function chooseLanguage(code: Locale) {
		if (leaving) return;
		leaving = true;
		// The page is left for good: the server renders the next step in `code`.
		setLanguage(code, '/setup?step=account');
	}

	function validate(): string {
		if (!username.trim()) return $m.setup_val_username_required;
		if (username.trim().length < 3) return $m.setup_val_username_short;
		if (emailFormatError(email)) return $m.setup_val_email_format;
		if (!password) return $m.setup_val_password_required;
		if (passwordTooShort(password)) return $m.common_password_too_short(PASSWORD_MIN_LENGTH);
		if (password !== confirmPassword) return $m.setup_val_password_mismatch;
		return '';
	}

	function refusalMessage(err: unknown): string {
		const status = (err as { status?: number } | null)?.status;
		const detail = String((err as { message?: string } | null)?.message ?? '').toLowerCase();
		if (isPasswordTooShortRefusal(err)) return $m.common_password_too_short(PASSWORD_MIN_LENGTH);
		if (detail.includes('already')) return $m.setup_err_exists;
		if (detail.includes('no bootstrap token configured') || detail.includes('setup is unavailable'))
			return $m.setup_err_unavailable;
		if (status === 401 || detail.includes('bootstrap token')) return $m.setup_err_token;
		return $m.setup_err_create;
	}

	// Signs in with what was entered; false when the operation went stale on
	// the way, in which case nothing was set.
	async function signIn(name: string, op: Operation): Promise<boolean> {
		await authApi.login({ username: name, password });
		if (!op.current()) return false;
		const user = await usersApi.me();
		if (!op.current()) return false;
		if (!isUserRole(user.role)) {
			await authApi.logout();
			throw new Error('unknown role');
		}
		authStore.setSession(user, { signIn: true });
		return true;
	}

	async function handleSubmit() {
		if (busy || local === null) return;
		errorMessage = '';
		const invalid = validate();
		if (invalid) {
			errorMessage = invalid;
			return;
		}
		const account = {
			username: username.trim(),
			email: normalizeEmail(email),
			password,
			default_language: $locale
		};
		life.stop('first');
		const op = life.begin('account');
		busy = true;
		try {
			try {
				if (local && directBase)
					await registerAtUnit(directBase, account, fetch, REGISTER_TIMEOUT_MS);
				else await authApi.register(account, bootstrapToken.trim() || undefined);
			} catch (err) {
				if (!op.current()) return;
				if (isFieldRefusal(err)) errorMessage = refusalMessage(err);
				else await settleUncertain(account.username, op);
				return;
			}
			if (!op.current()) return;
			try {
				if (!(await signIn(account.username, op))) return;
				step = 'network';
			} catch {
				if (!op.current()) return;
				signInFailed = true;
			}
		} finally {
			if (op.current()) busy = false;
		}
	}

	// A refusal the backend made about what was entered, or the token's or
	// set-up's refusal: the account was not created. A 401 or 403 that is not
	// the token's means an account now exists (only an administrator creates
	// accounts then); anything else with no such answer is uncertain.
	function isFieldRefusal(err: unknown): boolean {
		if (err instanceof FirstRunTimeout) return false;
		const status = (err as { status?: unknown } | null)?.status;
		if (typeof status !== 'number') return false;
		const detail = String((err as { message?: string } | null)?.message ?? '').toLowerCase();
		if (detail.includes('bootstrap token') || detail.includes('setup is unavailable')) return true;
		if (status === 401 || status === 403) return false;
		return status >= 400 && status < 500;
	}

	// After an uncertain registration (see the header): the status decides.
	// The sign-in here is one ordinary attempt, which counts against the
	// backend's sign-in lockout like any other; it is made once for each
	// registration outcome or press of the check button, and never repeated
	// by itself.
	async function settleUncertain(name: string, op: Operation, again = false) {
		pendingName = name;
		let needsSetup: boolean;
		try {
			({ needs_setup: needsSetup } = await authApi.setupStatus(op.signal));
		} catch {
			if (!op.current()) return;
			noAnswer = true;
			checkFailed = again;
			return;
		}
		if (!op.current()) return;
		noAnswer = false;
		checkFailed = false;
		if (needsSetup) return;
		try {
			if (!(await signIn(name, op))) return;
			step = 'network';
		} catch (err) {
			if (!op.current()) return;
			if ((err as { status?: unknown } | null)?.status === 401) otherAccount = true;
			else noAnswer = true;
		}
	}

	async function checkAccount() {
		if (busy) return;
		const op = life.begin('account');
		busy = true;
		try {
			await settleUncertain(pendingName, op, true);
		} finally {
			if (op.current()) busy = false;
		}
	}

	// The fields are not in a <form>: Enter in a field submits, Enter on a
	// button presses that button.
	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || busy || noAnswer) return;
		const target = event.target as HTMLElement | null;
		if (target?.tagName === 'BUTTON') return;
		handleSubmit();
	}

	function finish() {
		goto('/dashboard');
	}

	// Step 4, from the shared time-zone state. `tzRead` is false until this
	// step's own read has answered.
	let tz = $derived($unitTimezone.read);
	let tzRead = $state(false);
	let tzChosen = $state('');
	let tzError = $state<string | null>(null);
	let tzBusy = $derived($unitTimezone.saving);
	let tzReady = $derived(tz !== null && tz !== 'failed' && tz.zones.length > 0 ? tz : null);
	let tzKnown = $derived(
		tzReady && tzReady.zone !== null && tzReady.zones.includes(tzReady.zone) ? tzReady.zone : null
	);

	function toTimeZone() {
		step = 'timezone';
		tzRead = false;
		const op = life.begin('timezone');
		readTimezone().then(() => {
			if (op.current()) tzRead = true;
		});
	}

	// The selection follows the zone kept, as in Settings > This unit: a
	// choice the state shown no longer lists goes back to the kept zone.
	let tzFollowed: string | undefined = undefined;
	$effect(() => {
		const read = tz;
		if (!read || read === 'failed') return;
		untrack(() => {
			tzChosen = nextChoice(read, tzChosen, tzFollowed);
			tzFollowed = selectedZone(read);
		});
	});

	function laterTimeZone() {
		if (tzBusy) return;
		finish();
	}

	async function continueTimeZone() {
		if (tzBusy || !tzRead) return;
		if (!tzReady || !tzReady.canSet || !zoneListed(tzReady, tzChosen)) {
			finish();
			return;
		}
		const op = life.begin('timezone');
		tzError = null;
		try {
			await saveTimezone(tzChosen);
			if (op.current()) finish();
		} catch (err) {
			if (op.current()) tzError = timezoneRefusalText(err, $m);
		}
	}
</script>

{#if step === 'language'}
	<div class="splash">
		<div class="main">
			<div class="header">
				<!-- The logo is the page's heading. Stacked on screens 600px tall
				     or more, side by side on the 800x480 screen; the hidden one is
				     display: none, so only one is announced. -->
				<h1 class="logo-heading">
					<span class="logo-stacked">
						<CaptuaLogo
							wordmark="descriptor"
							weight="thin"
							layout="stacked"
							class="brand-logo-stacked"
						/>
					</span>
					<span class="logo-beside">
						<CaptuaLogo wordmark="descriptor" weight="thin" class="brand-logo-xl" />
					</span>
				</h1>
			</div>

			<!-- One column per language: the greeting over its button, a group
			     named by its greeting. -->
			<div class="starts">
				{#each STARTS as start (start.code)}
					<div class="start" lang={start.code} role="group" aria-labelledby="greeting-{start.code}">
						<h2 class="title" id="greeting-{start.code}">{start.greeting}</h2>
						<button class="btn" lang={start.code} onclick={() => chooseLanguage(start.code)}>
							{start.label}
						</button>
					</div>
				{/each}
			</div>
		</div>

		<!-- The credit is English whatever the interface language, like the
		     start labels; "Credits / Créditos" is bilingual for the same reason. -->
		<footer class="credit">
			<img src={nehSeal} alt="National Endowment for the Humanities" class="seal" />
			<p lang="en">
				Captua is developed at the Archives, Memory, and Preservation Lab of the University of
				California, Santa Barbara, and at the University of Texas at Austin. It has been made
				possible in part by a major grant from the National Endowment for the Humanities: Democracy
				demands wisdom (NEH Award HAA-304052-25).
			</p>
			<a href="/credits" class="credits-link">Credits / <span lang="es">Créditos</span></a>
		</footer>
	</div>
{:else if step === 'account'}
	<div class="wizard" onkeydown={handleKeydown} role="main">
		<div class="card" class:is-loading={busy}>
			<header class="card-head">
				<CaptuaLogo class="head-logo" />
				<div class="head-text">
					<p class="step">{$m.setup_step(2, STEPS)}</p>
					<h1 class="card-title">{$m.setup_title}</h1>
					<p class="card-subtitle">{$m.setup_subtitle}</p>
				</div>
			</header>

			{#if signInFailed || otherAccount}
				<div class="alert alert-error" role="alert">
					{otherAccount ? $m.setup_other_account : $m.setup_err_signin}
				</div>
				<div class="actions">
					<button type="button" class="btn-primary" onclick={() => goto('/login')} disabled={busy}>
						{$m.setup_go_to_login}
					</button>
				</div>
			{:else if noAnswer}
				<div class="alert alert-error" role="alert">{$m.setup_no_answer}</div>
				{#if checkFailed}
					<p class="checking" role="status">{$m.setup_check_failed}</p>
				{/if}
				<div class="actions">
					<button
						type="button"
						class="btn-primary"
						onclick={checkAccount}
						disabled={busy}
						aria-busy={busy}
					>
						{$m.setup_check_account}
					</button>
				</div>
			{:else if local === null}
				<p class="checking" role="status">{$m.common_loading}…</p>
			{:else}
				<div class="fields">
					<div class="field">
						<label class="field-label" for="su-username">{$m.common_username_label}</label>
						<input
							id="su-username"
							type="text"
							class="field-input"
							placeholder={$m.setup_ph_username}
							bind:value={username}
							disabled={busy}
							autocomplete="username"
							autocapitalize="none"
							autocorrect="off"
							spellcheck="false"
						/>
					</div>
					<div class="field">
						<label class="field-label" for="su-email">{$m.common_email}</label>
						<input
							id="su-email"
							type="email"
							class="field-input"
							placeholder={$m.setup_ph_email}
							bind:value={email}
							disabled={busy}
							autocomplete="email"
						/>
					</div>
					<div class="field">
						<PasswordField
							id="su-password"
							label={$m.common_password_label}
							bind:value={password}
							autocomplete="new-password"
							disabled={busy}
						/>
						<span class="hint">{$m.setup_ph_password}</span>
					</div>
					<div class="field">
						<PasswordField
							id="su-confirm"
							label={$m.common_confirm_password}
							bind:value={confirmPassword}
							autocomplete="new-password"
							disabled={busy}
						/>
					</div>
					{#if !local}
						<div class="field">
							<label class="field-label" for="su-token">{$m.setup_token_label}</label>
							<input
								id="su-token"
								type="text"
								class="field-input"
								placeholder={$m.setup_ph_token}
								bind:value={bootstrapToken}
								disabled={busy}
								autocomplete="off"
								autocapitalize="none"
								autocorrect="off"
								spellcheck="false"
							/>
						</div>
						<!-- Beside the token field, which it explains. -->
						<p class="note">{$m.setup_not_local}</p>
					{/if}
				</div>

				{#if errorMessage}
					<div class="alert alert-error" role="alert">{errorMessage}</div>
				{/if}

				<div class="actions">
					<button
						type="button"
						class="btn-secondary"
						onclick={() => (step = 'language')}
						disabled={busy}>{$m.setup_change_language}</button
					>
					<button
						type="button"
						class="btn-primary"
						onclick={handleSubmit}
						disabled={busy}
						aria-busy={busy}
					>
						{busy ? $m.setup_creating : $m.setup_submit}
					</button>
				</div>
			{/if}
		</div>
	</div>
{:else if step === 'network'}
	<div class="network-step">
		<header class="network-head">
			<p class="step">{$m.setup_step(3, STEPS)}</p>
			<h1 class="card-title">{$m.setup_network_title}</h1>
			<p class="card-subtitle">{$m.setup_network_desc}</p>
		</header>
		<div class="network-body">
			<NetworkSection role="admin" />
		</div>
		<footer class="network-foot">
			<button type="button" class="btn-secondary" onclick={toTimeZone}
				>{$m.setup_network_later}</button
			>
			<button type="button" class="btn-primary" onclick={toTimeZone}
				>{$m.setup_network_continue}</button
			>
		</footer>
	</div>
{:else}
	<div class="network-step">
		<header class="network-head">
			<p class="step">{$m.setup_step(4, STEPS)}</p>
			<h1 class="card-title">{$m.setup_tz_title}</h1>
			<p class="card-subtitle">{$m.setup_tz_desc}</p>
		</header>
		<div class="network-body tz-body">
			<label class="field-label" for="setup-tz">{$m.this_unit_tz_label}</label>
			{#if tzReady}
				<select
					id="setup-tz"
					class="tz-select"
					value={tzChosen}
					disabled={!tzReady.canSet || tzBusy}
					onchange={(e) => {
						tzChosen = (e.currentTarget as HTMLSelectElement).value;
						tzError = null;
					}}
				>
					{#if tzKnown === null}
						<option value="" disabled>{$m.this_unit_tz_unknown}</option>
					{/if}
					{#each tzReady.zones as zone (zone)}
						<option value={zone}>{zone}</option>
					{/each}
				</select>
				{#if !tzReady.canSet}
					<p class="tz-error">{$m.this_unit_tz_err_unavailable}</p>
				{/if}
			{:else if tz !== null}
				<p class="tz-value">{tz !== 'failed' && tz.zone ? tz.zone : $m.this_unit_tz_unknown}</p>
			{/if}
			{#if tzError}
				<p class="tz-error" role="alert">{tzError}</p>
			{/if}
		</div>
		<footer class="network-foot">
			<button type="button" class="btn-secondary" onclick={laterTimeZone} disabled={tzBusy}
				>{$m.setup_tz_later}</button
			>
			<button
				type="button"
				class="btn-primary"
				onclick={continueTimeZone}
				disabled={tzBusy || !tzRead}
				aria-busy={tzBusy}>{$m.setup_tz_continue}</button
			>
		</footer>
	</div>
{/if}

<style>
	/* Step 1: the splash, as the welcome screen had it. */
	.splash {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		background-color: var(--color-bg);
	}

	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.credit {
		display: flex;
		align-items: center;
		gap: 16px;
		box-sizing: border-box;
		width: 100%;
		padding: 8px 24px;
		border-top: 1px solid var(--border-color);
	}

	.seal {
		height: 52px;
		width: auto;
		flex: none;
	}

	.credit p {
		flex: 1;
		margin: 0;
		font-family: var(--font-family);
		font-size: 11px;
		line-height: 1.45;
		color: var(--color-light-grey);
	}

	.credits-link {
		flex: none;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		color: var(--color-secondary);
	}

	@media (max-width: 639px) {
		.credit {
			flex-direction: column;
			gap: 8px;
			padding: 16px 16px 8px;
			text-align: center;
		}

		.credit p {
			flex: none;
		}

		.seal {
			height: 72px;
		}

		.main {
			padding: 0 16px;
		}
	}

	.logo-heading > .logo-stacked {
		display: none;
	}

	@media (min-height: 600px) {
		.logo-heading > .logo-stacked {
			display: block;
		}
		.logo-heading > .logo-beside {
			display: none;
		}
	}

	.header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		margin-bottom: 24px;
	}

	.title {
		font-family: var(--font-family);
		font-size: var(--text-h2);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0 0 24px;
		text-align: center;
	}

	.starts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 16px;
	}

	.start {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.logo-heading {
		margin: 0;
		font-size: inherit;
	}

	.logo-heading > span {
		display: block;
	}

	.btn {
		font-family: var(--font-family);
		font-size: var(--text-base);
		font-weight: var(--fw-semibold);
		color: var(--color-secondary);
		background: transparent;
		border: 1.5px solid var(--color-secondary);
		border-radius: var(--radius-md);
		padding: 10px 24px;
		min-height: var(--touch-target-min);
		cursor: pointer;
		transition: background-color var(--transition-base);
	}

	.btn:hover {
		background-color: rgba(150, 177, 240, 0.1);
	}
	.btn:active {
		transform: scale(0.97);
	}

	/* Step 2: the account form, two fields a row from 600px wide. */
	.wizard {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		box-sizing: border-box;
		background-color: var(--color-bg);
		padding: 12px 16px;
	}

	.card {
		width: 100%;
		max-width: 640px;
		box-sizing: border-box;
		background-color: var(--color-surface);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* The unit's 800x480 screen: the form from another device, with the
	   token field and its note, still fits. */
	@media (max-height: 520px) {
		.wizard {
			padding: 8px 16px;
		}
		.card {
			padding: 12px 20px;
			gap: 10px;
		}
	}

	.card.is-loading .fields {
		pointer-events: none;
		opacity: 0.5;
	}

	.card-head {
		display: flex;
		align-items: center;
		gap: 20px;
	}

	.card-head :global(.head-logo) {
		width: 150px;
		height: auto;
		flex: none;
	}

	.head-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.step {
		margin: 0;
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.card-title {
		margin: 0;
		font-size: var(--text-h5);
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}

	.card-subtitle {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.4;
	}

	.note {
		margin: 0;
		align-self: end;
		padding: 6px 10px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-color);
		background-color: var(--color-surface-alt);
		font-size: 12px;
		color: var(--color-light);
		line-height: 1.35;
	}

	.checking {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}

	.fields {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px 16px;
	}

	@media (min-width: 600px) {
		.fields {
			grid-template-columns: 1fr 1fr;
		}
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	/* The look of PasswordField's label and input, so the four fields match. */
	.field-label {
		font-size: 11px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.field-input {
		font-family: var(--font-family);
		font-size: var(--text-sm);
		color: var(--color-light);
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		padding: 9px 12px;
		outline: none;
		min-height: var(--touch-target-min);
		width: 100%;
		box-sizing: border-box;
		transition: border-color var(--transition-base);
	}

	.field-input:focus {
		border-color: var(--color-primary);
	}

	.hint {
		font-size: 11px;
		color: var(--color-light-grey);
	}

	.alert {
		padding: 8px 12px;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: var(--fw-medium);
	}

	.alert-error {
		background-color: var(--color-error-bg);
		border: 1px solid var(--color-error);
		color: var(--color-error);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 12px;
	}

	.btn-primary,
	.btn-secondary {
		font-family: var(--font-family);
		font-size: var(--text-base);
		font-weight: var(--fw-semibold);
		border-radius: var(--radius-md);
		padding: 10px 20px;
		min-height: var(--touch-target-min);
		cursor: pointer;
		transition: background-color var(--transition-base);
	}

	.btn-primary {
		color: var(--color-light);
		background-color: var(--color-primary);
		border: none;
	}
	.btn-primary:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.btn-secondary {
		color: var(--color-light);
		background-color: transparent;
		border: 1px solid var(--border-color);
	}
	.btn-secondary:hover:not(:disabled) {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Steps 3 and 4: the body scrolls between a fixed head and foot. */
	.network-step {
		display: flex;
		flex-direction: column;
		height: 100vh;
		box-sizing: border-box;
		background-color: var(--color-bg);
	}

	.network-head {
		flex: none;
		padding: 12px 24px 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.network-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 8px 24px;
	}

	.tz-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 480px;
	}

	.tz-select {
		min-height: var(--touch-target-min);
		max-width: 100%;
		padding: 0 12px;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-alt-2);
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: var(--text-base);
	}

	.tz-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.tz-value {
		margin: 0;
		font-size: var(--text-base);
		color: var(--color-light-grey);
	}

	.tz-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-error);
	}

	.network-foot {
		flex: none;
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 10px 24px;
		border-top: 1px solid var(--border-color);
	}
</style>

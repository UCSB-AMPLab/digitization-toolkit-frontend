<script lang="ts">
	// Settings > Language (NEH-336). Every role changes their own language:
	// PUT /users/me/language stores it with the account, so it follows the
	// person to any device they sign in from, and `switchLanguage` writes the
	// cookie and reloads the page in it, or applies it in place when this
	// browser could not keep the signed-in user ($lib/language-switch.ts); the
	// session stays open. An
	// administrator also sets the unit's language, the one the sign-in page is
	// shown in, with PUT /system/unit; the answer replaces the unit's state and
	// nothing reloads. A refusal or a failure leaves the choice as it was, with
	// one line saying so.

	import { m, locale, type Locale } from '$lib/i18n';
	import { pageLife } from '$lib/page-life';
	import { switchLanguage } from '$lib/language-switch';
	import { usersApi, systemApi } from '$lib/api';
	import { authStore, isUserRole } from '$lib/stores/auth';
	import { ensureUnit, opensUnitSettings, unitState, writeUnit } from '$lib/unit-mode';

	let { role }: { role: string | null } = $props();

	// Each name is in its own language, whatever the page's.
	const LANGUAGES: { code: Locale; label: string }[] = [
		{ code: 'es', label: 'Español' },
		{ code: 'en', label: 'English' }
	];

	let isAdmin = $derived(opensUnitSettings(role));
	let unitLanguage = $derived($unitState?.defaultLanguage ?? null);

	let savingMine = $state(false);
	let savingUnit = $state(false);
	let mineError = $state(false);
	let unitError = $state(false);
	// An answer acts on the page only while its operation is current
	// ($lib/page-life): not after the section is gone. The unit's state takes a
	// PUT's answer in the store (writeUnit), whatever the page does.
	const life = pageLife();

	$effect(() => {
		if (isAdmin) ensureUnit();
	});

	async function chooseMine(code: Locale) {
		if (savingMine || code === $locale) return;
		const op = life.begin('mine');
		savingMine = true;
		mineError = false;
		try {
			const user = await usersApi.setMyLanguage(code);
			if (!op.current()) return;
			const current = authStore.getUser();
			if (current) {
				authStore.setSession({
					...current,
					...(isUserRole(user?.role) ? user : {}),
					language: code
				});
			}
			switchLanguage(code);
			savingMine = false;
		} catch {
			if (!op.current()) return;
			mineError = true;
			savingMine = false;
		}
	}

	async function chooseUnit(code: Locale) {
		if (savingUnit || code === unitLanguage) return;
		const op = life.begin('unit');
		savingUnit = true;
		unitError = false;
		try {
			await writeUnit(() => systemApi.setUnit({ defaultLanguage: code }));
			if (!op.current()) return;
		} catch {
			if (!op.current()) return;
			unitError = true;
		}
		savingUnit = false;
	}
</script>

<div class="config-section">
	<h2 class="section-title">{$m.config_section_language}</h2>
	<div class="config-card">
		<div class="config-row">
			<div class="row-info">
				<span class="row-label" id="language-mine-label">{$m.config_language_mine_label}</span>
				<span class="row-desc">{$m.config_language_mine_desc}</span>
				{#if mineError}
					<span class="row-error" role="alert">{$m.config_language_error}</span>
				{/if}
			</div>
			<div class="lang-options" role="group" aria-labelledby="language-mine-label">
				{#each LANGUAGES as lang (lang.code)}
					<button
						type="button"
						class="lang-option"
						lang={lang.code}
						class:active={$locale === lang.code}
						aria-pressed={$locale === lang.code}
						disabled={savingMine}
						onclick={() => chooseMine(lang.code)}
					>
						{lang.label}
					</button>
				{/each}
			</div>
		</div>

		{#if isAdmin}
			<div class="config-row">
				<div class="row-info">
					<span class="row-label" id="language-unit-label">{$m.config_language_unit_label}</span>
					<span class="row-desc">{$m.config_language_unit_desc}</span>
					{#if unitError}
						<span class="row-error" role="alert">{$m.config_language_error}</span>
					{/if}
				</div>
				<div class="lang-options" role="group" aria-labelledby="language-unit-label">
					{#each LANGUAGES as lang (lang.code)}
						<button
							type="button"
							class="lang-option"
							lang={lang.code}
							class:active={unitLanguage === lang.code}
							aria-pressed={unitLanguage === lang.code}
							disabled={savingUnit || unitLanguage === null}
							onclick={() => chooseUnit(lang.code)}
						>
							{lang.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

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

	.config-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	/* The two controls wrap under their text when the body is narrow. */
	.config-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		padding: 18px 20px;
		gap: 12px 20px;
	}

	.config-row + .config-row {
		border-top: 1px solid var(--border-color);
	}

	.row-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1 1 240px;
		min-width: 0;
	}

	.row-label {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-medium);
	}
	.row-desc {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}
	.row-error {
		font-size: var(--text-sm);
		color: var(--color-error);
	}

	/* Toggle buttons, not a dropdown — two options fit on screen, so the
	   current one can be read without opening anything. */
	.lang-options {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.lang-option {
		padding: 8px 16px;
		min-height: var(--touch-target-min);
		border-radius: var(--radius-md);
		border: var(--border-width) solid var(--border-color);
		background-color: transparent;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-medium);
		color: var(--color-light-grey);
		cursor: pointer;
		white-space: nowrap;
		transition:
			color var(--transition-base),
			border-color var(--transition-base);
	}
	.lang-option:hover:not(:disabled) {
		color: var(--color-light);
	}
	.lang-option.active {
		border-color: var(--color-light);
		color: var(--color-light);
		font-weight: var(--fw-bold);
	}
	.lang-option:disabled {
		cursor: not-allowed;
	}
</style>

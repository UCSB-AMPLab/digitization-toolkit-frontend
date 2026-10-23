<script lang="ts">
	// Configuración → Copia externa (NEH-266). Read-only: the destination is
	// set when the appliance is installed, and nothing here changes it.
	//
	// Shows the one box that matches the state classifySnapshot gives for the
	// latest answer of GET /system/catalogue-backup at the current time, or
	// "could not check" when the request failed, timed out or could not be
	// refreshed, never a guessed state (NEH-138).
	import { m, locale } from '$lib/i18n';
	import { catalogueBackupNow } from '$lib/stores/catalogueBackup';
	import {
		classifySnapshot,
		dayRelation,
		formatBackupDate,
		formatBackupTime,
		type BackupLevel
	} from '$lib/catalogue-backup';

	type View = {
		level: BackupLevel;
		headline: string;
		retry: boolean;
		object: string | null;
	};

	let view = $derived.by((): View | null => {
		const { snapshot, now: nowMs } = $catalogueBackupNow;
		const result = classifySnapshot(snapshot, nowMs);
		if (!result) return null;
		const { level, verifiedAt } = result;
		const none = { retry: false, object: null };
		if (level === 'off') return { level, headline: $m.backup_cfg_off, ...none };
		if (level === 'unknown' || snapshot.kind !== 'loaded') return { level: 'unknown', headline: $m.backup_cfg_unknown, ...none };
		if (!verifiedAt) return { level, headline: $m.backup_cfg_never, ...none, retry: true };

		const now = new Date(nowMs);
		const day = dayRelation(verifiedAt, now);
		const date = formatBackupDate(verifiedAt, now, $locale);
		const object = snapshot.status.object;
		if (level === 'current') {
			return { level, headline: $m.backup_cfg_current(day, date, formatBackupTime(verifiedAt, $locale)), retry: false, object };
		}
		return { level, headline: $m.backup_cfg_stale(day, date), retry: true, object };
	});
</script>

<div class="backup-card">
	<p class="desc">{$m.backup_section_desc} {$m.backup_section_scope}</p>

	{#if view === null}
		<p class="muted">{$m.common_loading_ellipsis}</p>
	{:else}
		<div class="state level-{view.level}" data-level={view.level}>
			<svg class="state-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
				stroke-width={view.level === 'current' ? 2.5 : 2.2} aria-hidden="true">
				{#if view.level === 'current'}
					<path d="M20 6 9 17l-5-5" />
				{:else if view.level === 'late'}
					<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
				{:else if view.level === 'overdue'}
					<circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
				{:else if view.level === 'off'}
					<circle cx="12" cy="12" r="9" /><path d="M8 12h8" />
				{:else}
					<circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
				{/if}
			</svg>
			<div class="state-body">
				<p class="headline">{view.headline}</p>
				{#if view.retry}
					<p class="retry">{$m.backup_cfg_retry}</p>
				{/if}
				{#if view.object}
					<p class="fact"><span class="fact-label">{$m.backup_cfg_last_file}</span> · {view.object}</p>
				{/if}
			</div>
		</div>
	{/if}

	<p class="locked">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
		</svg>
		{$m.backup_cfg_locked}
	</p>
</div>

<style>
	.backup-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px;
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
	}

	.desc {
		margin: 0;
		color: var(--color-light-grey);
		line-height: 1.5;
		max-width: 68ch;
	}

	.muted {
		margin: 0;
		color: var(--color-light-grey);
	}

	.state {
		display: flex;
		gap: 12px;
		padding: 14px 16px;
		border-radius: var(--radius-md);
		border: 1px solid var(--state-border);
		background-color: var(--state-bg);
	}

	.state-icon {
		flex-shrink: 0;
		margin-top: 1px;
		color: var(--state-icon);
	}

	.state-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.state-body p {
		margin: 0;
	}

	.headline {
		font-weight: var(--fw-bold);
		color: var(--color-light);
	}

	.retry {
		line-height: 1.5;
		color: var(--color-light);
	}

	.fact {
		color: var(--color-light-grey);
		font-size: 13px;
		overflow-wrap: anywhere;
	}

	.fact-label {
		font-weight: var(--fw-bold);
	}

	.level-current {
		--state-bg: var(--color-success-bg);
		--state-border: var(--color-success);
		--state-icon: var(--color-success);
	}
	.level-late {
		--state-bg: var(--color-warning-bg);
		--state-border: var(--color-warning);
		--state-icon: var(--color-warning);
	}
	.level-overdue {
		--state-bg: var(--color-error-bg);
		--state-border: var(--color-error);
		--state-icon: var(--color-error);
	}
	/* Not configured: the design's grey. The border has no token. */
	.level-off {
		--state-bg: var(--color-surface-alt-2);
		--state-border: rgba(171, 183, 183, 0.35);
		--state-icon: var(--color-light-grey);
	}
	/* Could not check: no fill, so it reads as neither a level nor "not
	   configured". */
	.level-unknown {
		--state-bg: transparent;
		--state-border: var(--border-color);
		--state-icon: var(--color-light-grey);
	}

	.locked {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--color-light-grey);
		font-size: 13px;
	}
	.locked svg {
		flex-shrink: 0;
	}
</style>

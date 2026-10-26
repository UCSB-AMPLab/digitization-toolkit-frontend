<script lang="ts">
	// Sidebar indicator of the offsite catalogue copy (NEH-266).
	//
	// Reads the shared catalogue-backup store and shows one of the four levels
	// from classifySnapshot, re-classified as the clock moves, or "could not
	// check" when the request failed, timed out or could not be refreshed. It
	// shows nothing until the first answer arrives, so it never claims a state
	// the backend has not reported (NEH-138).
	//
	// `href` is the Configuración section; the layout passes it only to roles
	// that can open Configuración, and the others get the same pill without a
	// link.
	//
	// Version: 0.1.0-beta
	import { m, locale } from '$lib/i18n';
	import { catalogueBackupNow } from '$lib/stores/catalogueBackup';
	import { classifySnapshot, dayRelation, formatBackupDate, type BackupLevel } from '$lib/catalogue-backup';

	let { expanded = true, href = null }: { expanded?: boolean; href?: string | null } = $props();

	let view = $derived.by((): { level: BackupLevel; text: string } | null => {
		const { snapshot, now: nowMs } = $catalogueBackupNow;
		const result = classifySnapshot(snapshot, nowMs);
		if (!result) return null;
		const { level, verifiedAt } = result;
		const now = new Date(nowMs);
		switch (level) {
			case 'off':
				return { level, text: $m.backup_ind_off };
			case 'unknown':
				return { level, text: $m.backup_ind_unknown };
			case 'overdue':
				if (!verifiedAt) return { level, text: $m.backup_ind_never };
				return { level, text: $m.backup_ind_stale(dayRelation(verifiedAt, now), formatBackupDate(verifiedAt, now, $locale)) };
			case 'late':
				return { level, text: $m.backup_ind_stale(dayRelation(verifiedAt!, now), formatBackupDate(verifiedAt!, now, $locale)) };
			case 'current':
				return { level, text: $m.backup_ind_current(dayRelation(verifiedAt!, now), formatBackupDate(verifiedAt!, now, $locale)) };
		}
	});
</script>

{#if view}
	<svelte:element
		this={href ? 'a' : 'div'}
		href={href ?? undefined}
		class="backup-pill level-{view.level}"
		class:collapsed={!expanded}
		data-level={view.level}
		title={!expanded ? view.text : undefined}
	>
		<span class="dot" aria-hidden="true"></span>
		{#if expanded}
			<span class="text">{view.text}</span>
		{:else}
			<span class="sr-only">{view.text}</span>
		{/if}
	</svelte:element>
{/if}

<style>
	.backup-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: var(--touch-target-min);
		margin: 0 6px 8px;
		padding: 8px 12px;
		border-radius: var(--radius-full);
		border: 1px solid var(--pill-border);
		background-color: var(--pill-bg);
		color: var(--color-light);
		font-size: var(--text-sm);
		font-weight: var(--fw-bold);
		line-height: 1.3;
		text-decoration: none;
		flex-shrink: 0;
	}

	a.backup-pill:hover {
		color: var(--color-light);
		filter: brightness(1.15);
	}

	.backup-pill.collapsed {
		justify-content: center;
		padding: 8px 0;
	}

	.dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background-color: var(--pill-dot);
	}

	.level-current {
		--pill-bg: var(--color-success-bg);
		--pill-border: var(--color-success);
		--pill-dot: var(--color-success);
	}
	.level-late {
		--pill-bg: var(--color-warning-bg);
		--pill-border: var(--color-warning);
		--pill-dot: var(--color-warning);
	}
	.level-overdue {
		--pill-bg: var(--color-error-bg);
		--pill-border: var(--color-error);
		--pill-dot: var(--color-error);
	}
	/* Not configured: the design's grey. The border has no token. */
	.level-off {
		--pill-bg: var(--color-surface-alt-2);
		--pill-border: rgba(171, 183, 183, 0.35);
		--pill-dot: var(--color-light-grey);
	}
	/* Could not check: no fill and a hollow dot, so it reads as neither a level
	   nor "not configured". */
	.level-unknown {
		--pill-bg: transparent;
		--pill-border: var(--border-color);
		--pill-dot: transparent;
		color: var(--color-light-grey);
	}
	.level-unknown .dot {
		border: 1.5px solid var(--color-light-grey);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>

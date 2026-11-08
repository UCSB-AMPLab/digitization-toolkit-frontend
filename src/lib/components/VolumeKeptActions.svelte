<script lang="ts">
	// ============================================================================
	// Keeping a volume on the unit, and releasing it (NEH-320): the admin's
	// button beside the volume's offsite line, where the free and restore
	// actions sit, and its confirmation.
	//
	// The layout shows it to admins only; the backend refuses both routes to
	// anyone else (allow_admin in app/api/collections.py). Which action is
	// offered, and the message for each refusal, are in kept-volumes.ts. A
	// refused release in Fisqua mode (a reference code Fisqua does not know, or
	// no answer from Fisqua) shows its message, and Captua keeps the volume.
	// Both apply to the volume and every volume inside it (backend
	// kept_volumes.keep and release); the confirmation says so.
	// ============================================================================
	//
	// Version: 0.3.3

	import { collectionsApi, type VolumeOffsiteState } from '$lib/api';
	import { m } from '$lib/i18n';
	import { dismissible, toBody } from '$lib/dialog';
	import { keptActionErrorText, keptActionOf } from '$lib/kept-volumes';
	import type { UnitMode } from '$lib/unit-mode';

	let {
		collectionId,
		offsite,
		isAdmin,
		mode = null,
		onChanged
	}: {
		collectionId: number;
		offsite: VolumeOffsiteState;
		isAdmin: boolean;
		/** The unit's mode: a release only once it is known and not Scanner only (keptActionOf). Null when not known. */
		mode?: UnitMode | null;
		/** After a keep or a release, with the volume it was made for: the layout asks the offsite line again. */
		onChanged: (collectionId: number) => void;
	} = $props();

	let action = $derived(keptActionOf(offsite, isAdmin, mode));
	let open = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function ask() {
		error = null;
		open = true;
	}

	function close() {
		if (busy) return;
		open = false;
		error = null;
	}

	async function confirm() {
		if (!action) return;
		const forId = collectionId;
		const doing = action;
		busy = true;
		error = null;
		try {
			if (doing === 'release') await collectionsApi.releaseFromUnit(forId);
			else await collectionsApi.keepOnUnit(forId);
			open = false;
			onChanged(forId);
		} catch (err) {
			console.error('[VolumeKept] Refused:', err);
			error = keptActionErrorText(err, $m);
		} finally {
			busy = false;
		}
	}
</script>

{#if action}
	<button type="button" class="btn btn-ghost kept-btn" onclick={ask} aria-haspopup="dialog">
		{action === 'release' ? $m.kept_release_action : $m.kept_keep_action}
	</button>
{/if}

{#if open && action}
	<div class="kept-backdrop" use:toBody use:dismissible={{ onDismiss: close }}>
		<div class="kept-card" role="dialog" aria-modal="true" aria-labelledby="kept-title" aria-describedby="kept-desc">
			<h3 class="kept-title" id="kept-title">{action === 'release' ? $m.kept_release_title : $m.kept_keep_title}</h3>
			<p class="kept-body" id="kept-desc">{action === 'release' ? $m.kept_release_body : $m.kept_keep_body}</p>
			<!-- The page does not know whether the volume holds others, so this is said either way. -->
			<p class="kept-body">{action === 'release' ? $m.kept_release_inside : $m.kept_keep_inside}</p>
			{#if error}
				<p class="kept-body kept-error" role="alert">{error}</p>
			{/if}
			<div class="kept-actions">
				<button type="button" class="btn btn-ghost" onclick={close} disabled={busy}>
					{error ? $m.common_close : $m.common_cancel}
				</button>
				{#if !error}
					<button type="button" class="btn btn-primary" onclick={confirm} disabled={busy}>
						{action === 'release' ? $m.kept_release_action : $m.kept_keep_action}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.kept-btn { min-height: 36px; padding: 0 12px; font-size: var(--text-sm); white-space: nowrap; }
	.kept-backdrop {
		position: fixed; inset: 0;
		background-color: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
		display: flex; align-items: center; justify-content: center;
		z-index: 100; padding: 24px;
	}
	.kept-card {
		background-color: var(--color-surface-alt);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 28px;
		width: 100%; max-width: 440px;
		box-shadow: var(--shadow-lg);
		display: flex; flex-direction: column; gap: 12px;
	}
	.kept-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }
	.kept-body { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.6; margin: 0; }
	.kept-error { color: var(--color-error); }
	.kept-actions { display: flex; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border-color); }
	.kept-actions :global(.btn) { flex: 1; }
</style>

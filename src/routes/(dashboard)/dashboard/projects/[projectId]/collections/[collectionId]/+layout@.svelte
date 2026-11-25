<script lang="ts">
	// Full-screen shell for a volume's gallery. The `@` in the filename makes
	// this layout inherit from the root layout instead of the (dashboard) one,
	// so the dashboard navigation sidebar is not rendered. It holds the session
	// guard and the top bar (breadcrumb, offsite copy line, camera button); the
	// page fills the rest of the screen. While the unit hides projects
	// (NEH-313), the breadcrumb starts with "Volúmenes", a link to the list,
	// instead of the project's name, and the back button returns there.
	//
	// For the testing account (NEH-391) the bar has the Capture button and,
	// under the breadcrumb, the date Captua removes the volume; it has no
	// offsite copy line, which the backend refuses it, so nothing polls for it.
	//
	// For an administrator, a volume made by hand has the action that moves
	// its captures into a volume from Fisqua (NEH-419, VolumeAdoptActions):
	// its explanation and its button in the strip under the bar, where the
	// width allows them beside the bar's other controls. A volume whose captures a move
	// took is closed: the line under the bar says so, and the Capture button
	// is not offered. A volume an unsettled move names (NEH-420) has the
	// notice under the bar (AdoptionNotice): the administrator's with
	// Repair, one line for the other roles.
	//
	// Version: 0.3.0

	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth';
	import { m } from '$lib/i18n';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import VolumeOffsiteIndicator from '$lib/components/VolumeOffsiteIndicator.svelte';
	import VolumeOffsiteActions from '$lib/components/VolumeOffsiteActions.svelte';
	import VolumeKeptActions from '$lib/components/VolumeKeptActions.svelte';
	import VolumeColourCard from '$lib/components/VolumeColourCard.svelte';
	import AdoptionNotice from '$lib/components/AdoptionNotice.svelte';
	import VolumeAdoptActions, { hasStoredRequest } from './VolumeAdoptActions.svelte';
	import { setVolumeTopbar, type VolumeTopbarSlot } from '$lib/volume-topbar';
	import type { VolumeOffsiteState } from '$lib/api';
	import { freedAfterRead, freedCountsOf, type FreedCounts } from '$lib/offsite-free';
	import {
		canCapture,
		canEditVolumes,
		canFreeVolumes,
		canManageOffsite,
		canRestoreVolumes,
		ensureUnit,
		inTestingSpace,
		projectsShownIn,
		takesPartInWorkflow,
		unitState,
		volumeBackPath
	} from '$lib/unit-mode';
	import { testingExpiry } from '$lib/testing-space';
	import { formatApiDate } from '$lib/format-date';
	import { locale } from '$lib/i18n';

	let { children } = $props();

	// Controls the page puts in the bar: send for review and take back (NEH-260).
	const topbarSlot = $state<VolumeTopbarSlot>({ actions: null, reloadRecords: null });
	setVolumeTopbar(topbarSlot);

	let projectId = $derived(Number($page.params.projectId) || 0);
	let collectionId = $derived(Number($page.params.collectionId) || 0);

	let currentUser = $state<any>(null);

	onMount(() => {
		const unsub = authStore.subscribe((s) => {
			currentUser = s.user;
			// Shared session guard (NEH-66), also used by live-preview and the page.
			authStore.requireSession();
		});
		ensureUnit();
		return unsub;
	});

	// The move of captures (NEH-419, NEH-420), from the volume read in +layout.ts.
	type AdoptionFields = {
		external_id: string | null;
		captures_adopted_at: string | null;
		adoption_unfinished: boolean;
		testing: boolean;
	};
	let adoption = $derived<AdoptionFields>(
		($page.data as any).collectionAdoption ?? {
			external_id: null,
			captures_adopted_at: null,
			adoption_unfinished: false,
			testing: false
		}
	);
	// The target of a move made on this page, for the volume it was made on:
	// the volume is closed from then on, and the line can name the target.
	let movedInto = $state<{ forId: number; target: string } | null>(null);
	let movedHere = $derived(movedInto?.forId === collectionId ? movedInto.target : null);
	let closed = $derived(!!adoption.captures_adopted_at || movedHere !== null);
	// A move of this volume whose outcome was not known when the page was
	// entered: its id in the session is settled whatever the volume's own
	// reads answer (the volume may be gone), so the strip mounts for it too.
	let storedHere = $derived.by(() => {
		const forId = collectionId;
		return untrack(() => hasStoredRequest(forId));
	});
	// A move this page saw left half done, for the volume it was made on: the notice shows.
	let leftUnfinished = $state<number | null>(null);
	let unfinishedHere = $derived(adoption.adoption_unfinished || leftUnfinished === collectionId);
	let backEl = $state<HTMLButtonElement | null>(null);
	// The strip's own move of this volume whose outcome is not known yet: it shows the working row.
	let pendingFor = $state<number | null>(null);
	let pendingHere = $derived(pendingFor === collectionId);

	// Each callback names the volume it is for; one for a volume no longer shown changes nothing.
	function adopted(sourceId: number, target: string) {
		if (sourceId !== collectionId) return;
		movedInto = { forId: sourceId, target };
		topbarSlot.reloadRecords?.();
	}
	function unfinished(sourceId: number) {
		if (sourceId === collectionId) leftUnfinished = sourceId;
	}

	let canOpenCamera = $derived(canCapture(currentUser?.role) && !closed);
	// The offsite copy line: not for the testing account. Read from the store,
	// so the line is never mounted for it before the subscription runs.
	// Nothing is mounted for it while the signed-in role is not known.
	let showsOffsite = $derived(!!$authStore.user && takesPartInWorkflow($authStore.user.role));

	// Space on the card (NEH-248, NEH-380): free for the admin and the
	// operator, restore for the admin only. The button sits next to the
	// breadcrumb and the offsite copy line, which is what shows what is freed.
	// The backend refuses these routes to other roles.
	// Beside it, keep the volume on the unit or release it (NEH-320), admin
	// only; a release only once the unit mode is known and is not Scanner only (keptActionOf).
	let isAdmin = $derived(canManageOffsite(currentUser?.role));
	let canFree = $derived(canFreeVolumes(currentUser?.role));
	let canRestore = $derived(canRestoreVolumes(currentUser?.role));
	// The last state the line read: a poll that fails keeps it, so an open
	// dialog is not closed under the admin; it is matched to the volume shown.
	let offsiteState = $state<VolumeOffsiteState | null>(null);
	let offsiteRefresh = $state(0);
	let offsiteHere = $derived(!!offsiteState && offsiteState.collection_id === collectionId);
	// What the line last read as freed. When it changes on the volume shown, a
	// free or a restore has moved files, whether or not its dialog was still
	// open, so the page reloads the records and their freed state.
	let lastFreed: FreedCounts | null = null;

	function offsiteRead(s: VolumeOffsiteState | null) {
		if (!s) return;
		offsiteState = s;
		// The page's image screens read whether a restore is possible from here.
		topbarSlot.offsite = { collectionId: s.collection_id, restorable: s.restorable };
		const next = freedCountsOf(s);
		// Advanced only once the records reloaded; a failed reload is tried
		// again on the next poll (freedAfterRead).
		const forId = collectionId;
		freedAfterRead(lastFreed, next, forId, topbarSlot.reloadRecords).then((last) => {
			if (collectionId === forId) lastFreed = last;
		});
	}

	// A job's end, for the volume it was started for: ask the line again. A
	// job of a volume no longer shown changes nothing here.
	function offsiteChanged(forId: number) {
		if (forId === collectionId) offsiteRefresh += 1;
	}

	// Project and volume names come from the load in +layout.ts.
	let projectName = $derived(($page.data as any).projectName ?? '—');
	let collectionName = $derived(($page.data as any).collectionName ?? '—');
	// When Captua removes a testing volume, for the testing account only.
	let expiry = $derived(
		inTestingSpace($authStore.user?.role)
			? testingExpiry(($page.data as any).collectionTestingExpiresAt)
			: null
	);
</script>

<div class="gallery-shell">
	<div class="topbar">
		<div class="topbar-left">
			<button
				bind:this={backEl}
				class="btn-back"
				onclick={() => goto(volumeBackPath($unitState, projectId))}
				aria-label={projectsShownIn($unitState) ? $m.col_back_to_project : $m.col_back_to_volumes}
			>
				<span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
			</button>

			<!-- Breadcrumb, with the volume's offsite copy line below it (NEH-248) -->
			<div class="topbar-title">
				<nav class="breadcrumb" aria-label={$m.col_breadcrumb_nav}>
					{#if projectsShownIn($unitState)}
						<span class="bc-item bc-project">{projectName}</span>
					{:else}
						<a class="bc-item bc-project bc-link" href="/dashboard/volumes">{$m.nav_volumes}</a>
					{/if}
					<span class="bc-sep">/</span>
					<!-- Shortened with an ellipsis when the bar is narrow (NEH-421): the full title is
					     its text (read by assistive technology), its `title` (pointer), and is shown
					     whole while it has keyboard focus. -->
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<span class="bc-item bc-collection" title={collectionName} tabindex="0"
						>{collectionName}</span
					>
					<!-- The volume's colour card shots (NEH-340): its flag, and for
					     admin and operator the list of its sets. -->
					{#key collectionId}
						<VolumeColourCard
							{collectionId}
							summary={($page.data as any).collectionColourCard}
							canOpen={canEditVolumes($authStore.user?.role)}
						/>
					{/key}
				</nav>
				{#if showsOffsite}
					<VolumeOffsiteIndicator {collectionId} refresh={offsiteRefresh} onState={offsiteRead} />
				{/if}
				{#if expiry}
					<p class="testing-expiry" class:soon={expiry.soon}>
						{expiry.due
							? $m.testing_expires_due
							: $m.testing_expires_on(
									formatApiDate(expiry.at.toISOString(), $locale, {
										day: 'numeric',
										month: 'long',
										year: 'numeric'
									})
								)}
					</p>
				{/if}
			</div>
			{#if canFree && offsiteState && offsiteState.collection_id === collectionId}
				{#key collectionId}
					<VolumeOffsiteActions
						{collectionId}
						offsite={offsiteState}
						{canRestore}
						onChanged={offsiteChanged}
					/>
					{#if isAdmin}
						<!-- Keep the volume on the unit, or release it (NEH-320). -->
						<VolumeKeptActions
							{collectionId}
							offsite={offsiteState}
							{isAdmin}
							mode={$unitState?.mode ?? null}
							onChanged={offsiteChanged}
						/>
					{/if}
				{/key}
			{/if}
		</div>

		<!-- Camera button for operator, admin and the testing account -->
		<div class="topbar-right">
			{@render topbarSlot.actions?.()}

			{#if canOpenCamera}
				<button
					class="btn-camera"
					data-tour="capturar"
					onclick={() => goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`)}
					title={$m.col_open_in_camera}
				>
					<span class="material-symbols-outlined" style="font-size:18px">photo_camera</span>
					<span>{$m.col_live_preview}</span>
				</button>
			{/if}

			<!-- Identity and sign-out. The avatar opens the menu (NEH-234). -->
			<UserMenu label={$m.col_current_user} />
		</div>
	</div>

	<!-- The strip under the bar (NEH-419, NEH-420); its padding and border only while it holds something. -->
	<div class="volume-notices">
		{#if isAdmin || unfinishedHere}
			<!-- Keyed: a notice is read again for each volume shown. An administrator's reads the
			     report on every volume page: an unfinished move that names this volume, or a move of
			     it that is running, shows. Other roles get one line on an affected volume. -->
			{#key collectionId}
				<AdoptionNotice
					onVolume
					volumeId={collectionId}
					named={unfinishedHere}
					quietRunning={pendingHere}
				/>
			{/key}
		{/if}
		{#if closed}
			<p class="volume-line">
				{movedHere !== null ? $m.adopt_closed_line(movedHere) : $m.adopt_closed_refusal}
			</p>
		{/if}
		{#if isAdmin && canFree && (offsiteHere || storedHere)}
			<!-- Move a hand-made volume's captures into a volume from Fisqua (NEH-419): its
			     explanation and its button, which do not fit beside the bar's controls at 800 px.
			     Mounted after the move too, so its result stays open. -->
			{#key collectionId}
				<VolumeAdoptActions
					{collectionId}
					{collectionName}
					volume={{
						external_id: adoption.external_id,
						// Not known until the offsite line has answered: counted as kept, so no move is offered.
						kept_on_unit: offsiteHere ? offsiteState?.kept_on_unit === true : true,
						captures_adopted_at: closed ? (adoption.captures_adopted_at ?? 'closed') : null,
						testing: adoption.testing
					}}
					onAdopted={adopted}
					onUnfinished={unfinished}
					onPending={(sourceId, waiting) => {
						if (sourceId === collectionId) pendingFor = waiting ? sourceId : null;
					}}
					focusAfter={() => backEl?.focus()}
				/>
			{/key}
		{/if}
	</div>

	<div class="gallery-content">
		{@render children?.()}
	</div>
</div>

<style>
	.gallery-shell {
		display: flex;
		flex-direction: column;
		width: 100vw;
		/* Less the banner for a unit that is not answering, while it shows. */
		height: calc(100vh - var(--banner-h, 0px));
		background-color: var(--color-bg);
		overflow: hidden;
	}

	/* ── TOPBAR ── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		height: 72px;
		flex-shrink: 0;
		/* Same background and border as the Live Preview top bar. */
		background-color: var(--color-surface-alt);
		border-bottom: 2px solid var(--color-primary);
	}

	/* The title column is the only part of the bar that gives way (NEH-421):
	   every control keeps its width, and the project, then the volume title,
	   shorten on one line. */
	.topbar-left {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		flex: 1 1 auto;
	}
	.topbar-left > :global(*) {
		flex-shrink: 0;
	}
	.topbar-left > .topbar-title {
		flex: 0 1 auto;
		min-width: 0;
	}

	.testing-expiry {
		margin: 2px 0 0;
		font-size: var(--text-xs);
		color: var(--color-light-grey);
	}
	.testing-expiry.soon {
		color: var(--color-warning);
	}

	.topbar-right {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Mirrored by `.btn-review` in live-preview/TopBar.svelte: keep the two
     in step. Touch-target minimum height (44px). */
	.btn-camera {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 20px;
		min-height: var(--touch-target-min);
		border-radius: var(--radius-full);
		border: none;
		background-color: var(--color-primary);
		color: var(--color-light);
		font-family: var(--font-family);
		font-size: 13px;
		font-weight: var(--fw-bold);
		cursor: pointer;
		white-space: nowrap;
		transition: background-color var(--transition-base);
	}
	.btn-camera:hover {
		background-color: var(--color-primary-hover);
	}

	.btn-back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: 50%;
		background: var(--color-bg);
		color: var(--color-light);
		cursor: pointer;
	}
	.btn-back:hover {
		background: var(--border-color);
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 6px;
		min-width: 0;
		font-size: 13px;
	}
	.breadcrumb > :global(*) {
		flex-shrink: 0;
	}
	.bc-item {
		color: var(--color-light-grey);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* The project gives way first, down to its ellipsis. */
	.breadcrumb > .bc-project {
		flex: 0 1000 auto;
		min-width: 1.5em;
	}
	/* Then the volume title, down to a few characters and the ellipsis. */
	.breadcrumb > .bc-collection {
		flex: 0 1 auto;
		min-width: 48px;
	}
	.bc-collection {
		color: var(--color-light);
		font-weight: var(--fw-bold);
	}
	/* With keyboard focus the whole title shows, over what is beside it. */
	.bc-collection:focus-visible {
		position: relative;
		z-index: 2;
		overflow: visible;
		text-overflow: clip;
		background-color: var(--color-surface-alt);
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
	.bc-sep {
		color: var(--color-light-grey);
	}
	.bc-link {
		text-decoration: none;
	}
	.bc-link:hover {
		color: var(--color-light);
		text-decoration: underline;
	}

	.volume-notices {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex-shrink: 0;
		max-height: 40vh;
		overflow-y: auto;
	}
	.volume-notices:has(> *) {
		padding: 8px 16px;
		border-bottom: var(--border-width) solid var(--border-color);
	}
	.volume-line {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--color-light);
	}

	.gallery-content {
		flex: 1;
		overflow: hidden;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>

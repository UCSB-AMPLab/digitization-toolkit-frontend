<script lang="ts">
	// The notice for the unit's cameras (NEH-252, NEH-348): one sentence when
	// cameras of another kind than the one in effect are connected, naming
	// both kinds; when the unit lacks the driver for the kind connected,
	// that instead; and its own sentence for cameras of two or three kinds.
	// A count that could not be measured never makes a notice
	// (lib/camera-kind.ts, kindNotice). Shown on the capture screen under the
	// top bar (`band`), in the "Which camera is this?" step, in Settings >
	// Cameras and in Diagnostics. It reads the shared store only; each of
	// those screens reads the kind again when it opens.
	//
	// With `action`, the administrator gets a link to Settings > Cameras and
	// every other role is told to tell the administrator; without it (in
	// Settings > Cameras itself), the sentence alone.

	import { m } from '$lib/i18n';
	import { authStore } from '$lib/stores/auth';
	import { opensUnitSettings } from '$lib/unit-mode';
	import { cameraKind, kindNotice, noticeText } from '$lib/camera-kind';

	let { action = true, band = false }: { action?: boolean; band?: boolean } = $props();

	let report = $derived($cameraKind.status === 'ready' ? $cameraKind.report : null);
	let notice = $derived(kindNotice(report));
	let isAdmin = $derived(opensUnitSettings($authStore.user?.role ?? null));
</script>

{#if notice && report}
	<div class="kind-notice" class:band role="status" data-camera-kind-notice={notice.kind}>
		<span class="kind-notice-text">{noticeText(notice, report, $m)}</span>
		{#if action}
			{#if isAdmin}
				<a class="kind-notice-link" href="/dashboard/config?section=cameras"
					>{$m.camera_kind_notice_link}</a
				>
			{:else}
				<span class="kind-notice-text">{$m.camera_kind_notice_tell_admin}</span>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.kind-notice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 12px;
		flex-shrink: 0;
		padding: 4px 12px;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-warning);
		background-color: var(--color-warning-bg);
		color: var(--color-light);
		font-size: var(--text-sm);
		line-height: 1.35;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.kind-notice.band {
		margin: 6px 12px 0;
	}
	.kind-notice-text {
		padding: 4px 0;
	}
	.kind-notice-link {
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		color: var(--color-light);
		font-weight: var(--fw-bold);
		text-decoration: underline;
	}
</style>

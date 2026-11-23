<script lang="ts">
	// Settings > Diagnostics, the camera kind (NEH-252, NEH-348): the kind in
	// effect with its driver name, the source the backend reports and its
	// sentence, the stored choice, the cameras connected of each kind and the
	// drivers the unit has, then the notice for cameras of another kind or of
	// two kinds. Driver names are shown here, beside the names, because
	// supporting a unit in the field needs them. Read from the shared store
	// (lib/camera-kind.ts) each time Diagnostics is opened. A backend without
	// the route (404), or a failed read, shows nothing here; the capture
	// system row above it stays.

	import { onMount } from 'svelte';
	import { m } from '$lib/i18n';
	import CameraKindNotice from '$lib/components/CameraKindNotice.svelte';
	import { CAMERA_KINDS, cameraKind, kindName, loadCameraKind, sourceText } from '$lib/camera-kind';

	let report = $derived($cameraKind.status === 'ready' ? $cameraKind.report : null);
	let drivers = $derived(report ? CAMERA_KINDS.filter((k) => report.available[k]) : []);

	onMount(() => {
		loadCameraKind();
	});
</script>

{#if report}
	<div class="diag" data-camera-kind-diagnostics>
		<div class="diag-row">
			<span class="diag-label">{$m.diag_camera_kind}</span>
			<span class="diag-value"
				>{kindName(report.configured, $m)} <code>{report.configured}</code></span
			>
		</div>
		<div class="diag-row">
			<span class="diag-label">{$m.diag_camera_kind_source}</span>
			<span class="diag-value"
				><code>{report.source}</code>
				{sourceText(report.source, $m) ?? ''}</span
			>
		</div>
		<div class="diag-row">
			<span class="diag-label">{$m.diag_camera_kind_stored}</span>
			<span class="diag-value">
				{#if report.stored}
					{kindName(report.stored, $m)} <code>{report.stored}</code>
				{:else}
					{$m.diag_camera_kind_stored_none}
				{/if}
			</span>
		</div>
		<div class="diag-row">
			<span class="diag-label">{$m.diag_camera_kind_connected}</span>
			<ul class="diag-list">
				{#each CAMERA_KINDS as kind (kind)}
					<li>
						{kindName(kind, $m)} <code>{kind}</code>:
						<strong>{report.connected[kind] ?? $m.camera_kind_count_unknown}</strong>
					</li>
				{/each}
			</ul>
		</div>
		<div class="diag-row">
			<span class="diag-label">{$m.diag_camera_kind_available}</span>
			<span class="diag-value">
				{#if drivers.length === 0}
					{$m.diag_camera_kind_available_none}
				{:else}
					{#each drivers as kind, i (kind)}{i > 0 ? ', ' : ''}<code>{kind}</code>{/each}
				{/if}
			</span>
		</div>
		<CameraKindNotice />
	</div>
{/if}

<style>
	.diag {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 20px;
		min-width: 0;
	}
	.diag-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.diag-label {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
	}
	.diag-value,
	.diag-list {
		font-size: var(--text-sm);
		color: var(--color-light);
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	.diag-list {
		margin: 0;
		padding-left: 18px;
	}
	code {
		font-family: var(--font-mono, monospace);
		font-size: 12px;
		color: var(--color-light-grey);
	}
</style>

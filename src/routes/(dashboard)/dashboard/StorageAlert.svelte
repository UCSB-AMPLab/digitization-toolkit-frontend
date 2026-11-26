<script lang="ts">
	// The Overview's storage notice in "Needs attention", from GET
	// /system/storage on the drive that holds the projects root (see
	// `$lib/storage-usage`). It reads the figures on mount and again whenever
	// the page becomes visible after being hidden. Captures happen on other
	// pages, and returning to the overview mounts this component again, so no
	// timer is needed: the figures cannot change much while someone is
	// looking at the overview itself, and a timer would keep asking the
	// backend from a background tab or a kiosk left idle.
	//
	// A failed request or an answer without usable figures shows nothing, and
	// clears figures read earlier: the notice never states a fill level the
	// unit did not just report.
	//
	// "Settings" links to Settings > Storage for the administrator and the
	// operator, the roles that may open that section and free space there
	// (NEH-253, NEH-380); a reviewer is told to ask an administrator or an
	// operator, and the sentence does not mention Settings. The percentage
	// counts the space Captua keeps for its own work (storage-usage.ts). The
	// used and total figures are written by storageSize, in the decimal units
	// of the "You can free" sentence after them and of Settings > Storage.
	//
	// For the administrator and the operator, while the notice shows, "You can
	// free {amount}" follows, from the total bytes of GET
	// /system/storage/freeable (a route for those two roles only), written by
	// the catalogue's size formatter as Settings > Storage writes it. It is
	// left out when the total is 0, when the unit's mode refuses freeing
	// (`mode_allows` false, where Settings lists nothing to free), and when
	// the read fails.
	//
	// Version: 0.3.0

	import { onMount } from 'svelte';
	import { systemApi } from '$lib/api';
	import { m, locale } from '$lib/i18n';
	import { authStore } from '$lib/stores/auth';
	import { storageSize, storageUsage, type StorageUsage } from '$lib/storage-usage';
	import { canFreeVolumes } from '$lib/unit-mode';
	import AttentionNotice from './AttentionNotice.svelte';

	let usage = $state<StorageUsage | null>(null);
	// The bytes that can be freed, or null when there is nothing to say.
	let freeableBytes = $state<number | null>(null);
	let canOpenStorage = $derived(canFreeVolumes($authStore.user?.role));

	// A figure of StorageUsage as the sentence writes sizes.
	const size = (gib: number) => storageSize(gib, $locale);

	onMount(() => {
		let alive = true;
		// Each read takes the next number; an answer from an older read that
		// arrives after a newer one is dropped, so a slow request cannot bring
		// back stale figures.
		let latest = 0;

		async function readFreeable(): Promise<number | null> {
			try {
				const listed = await systemApi.getFreeableVolumes();
				const bytes = listed?.total?.bytes;
				if (listed?.mode_allows === false) return null;
				return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0 ? bytes : null;
			} catch {
				return null;
			}
		}

		async function read() {
			const seq = ++latest;
			let next: StorageUsage | null = null;
			try {
				next = storageUsage(await systemApi.getStorage());
			} catch {
				next = null;
			}
			if (!alive || seq !== latest) return;
			usage = next;
			if (!next?.alert || !canFreeVolumes($authStore.user?.role)) {
				freeableBytes = null;
				return;
			}
			const bytes = await readFreeable();
			if (alive && seq === latest) freeableBytes = bytes;
		}

		function onVisibility() {
			if (document.visibilityState === 'visible') read();
		}

		read();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			alive = false;
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<!-- The Settings page applies the same threshold. -->
{#if usage?.alert}
	<AttentionNotice icon="warn" class="storage-alert-banner">
		<p class="notice-title plain">
			{$m.dash_storage_alert_p1}<strong>{usage.percent}%</strong
			>{#if canOpenStorage}{$m.dash_storage_alert_p2(size(usage.usedGB), size(usage.totalGB))}<a
					href="/dashboard/config?section=storage"
					class="alert-link">{$m.nav_settings}</a
				>{$m.dash_storage_alert_p3}{#if freeableBytes !== null}{' '}{$m.dash_storage_can_free(
						freeableBytes
					)}{/if}{:else}{$m.dash_storage_alert_ask_admin(
					size(usage.usedGB),
					size(usage.totalGB)
				)}{/if}
		</p>
	</AttentionNotice>
{/if}

<script lang="ts">
  // Version: 0.2.1

  import type { Record } from '$lib/api';
  import { m } from '$lib/i18n';

  type RecordStatus = Record['status'];

  let { status }: { status: RecordStatus } = $props();

  const labels = $derived({
    captured:  $m.status_captured,
    in_review: $m.status_in_review,
    rejected:  $m.status_rejected,
    approved:  $m.status_approved,
    excluded:  $m.status_excluded,
  } satisfies { [K in RecordStatus]: string });

  const icons: { [K in RecordStatus]: string } = {
    captured:  'photo_camera',
    in_review: 'rate_review',
    rejected:  'cancel',
    approved:  'check_circle',
    // Fisqua's exclusion (contract 1.6): not a page of the volume.
    excluded:  'block',
  };
</script>

<span class="status-badge status-{status}">
  <span class="material-symbols-outlined icon-sm">{icons[status]}</span>
  {labels[status]}
</span>

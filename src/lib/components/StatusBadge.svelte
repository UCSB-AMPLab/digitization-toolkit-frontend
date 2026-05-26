<script lang="ts">
  import type { Record } from '$lib/api';

  type RecordStatus = Record['status'];

  let { status }: { status: RecordStatus } = $props();

  const labels: Record<RecordStatus, string> = {
    captured:  'Capturado',
    in_review: 'En revisión',
    rejected:  'Rechazado',
    approved:  'Aprobado',
  };

  const icons: Record<RecordStatus, string> = {
    captured:  'photo_camera',
    in_review: 'rate_review',
    rejected:  'cancel',
    approved:  'check_circle',
  };
</script>

<span class="status-badge status-{status}">
  <span class="material-symbols-outlined icon-sm">{icons[status]}</span>
  {labels[status]}
</span>

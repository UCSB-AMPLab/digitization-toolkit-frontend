<script lang="ts">
  import { page } from '$app/stores';
  import { m } from '$lib/i18n';
  import BugReportPanel from '$lib/bug-report/BugReportPanel.svelte';

  let open = $state(false);
</script>

<div class="crash">
  <span class="material-symbols-outlined crash-icon">error</span>
  <h1 class="crash-title">{$m.bug_crash_title}</h1>
  <p class="crash-status">{$page.status}{$page.error?.message ? ` — ${$page.error.message}` : ''}</p>
  <p class="crash-desc">{$m.bug_crash_desc}</p>
  <div class="crash-actions">
    <a class="btn-secondary" href="/dashboard">{$m.nav_overview}</a>
    <button class="btn-primary" onclick={() => (open = true)}>
      <span class="material-symbols-outlined icon-sm">bug_report</span>
      {$m.bug_report_this}
    </button>
  </div>
</div>

{#if open}
  <BugReportPanel onClose={() => (open = false)} />
{/if}

<style>
  .crash { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; background: var(--color-bg); color: var(--color-light); }
  .crash-icon { font-size: 48px; color: var(--color-error); }
  .crash-title { font-size: var(--text-h2); font-weight: var(--fw-bold); margin: 0; }
  .crash-status { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }
  .crash-desc { font-size: var(--text-base); color: var(--color-light-grey); margin: 0 0 8px; max-width: 420px; }
  .crash-actions { display: flex; gap: 12px; }
</style>
<script lang="ts">
  import { m } from '$lib/i18n';
  import BugReportPanel from './BugReportPanel.svelte';

  let { expanded = false }: { expanded?: boolean } = $props();
  let open = $state(false);
</script>

<button class="bug-btn" onclick={() => (open = true)} title={$m.bug_report_button} aria-label={$m.bug_report_button}>
  <span class="material-symbols-outlined icon-sm">bug_report</span>
  {#if expanded}<span class="bug-btn-label">{$m.bug_report_button}</span>{/if}
</button>

{#if open}
  <BugReportPanel onClose={() => (open = false)} />
{/if}

<style>
  .bug-btn {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    width: 100%; padding: 8px 10px; min-height: 40px;
    border-radius: var(--radius-md);
    background: none; border: 1px solid var(--border-color);
    color: var(--color-light-grey); font-family: var(--font-family);
    font-size: var(--text-sm); font-weight: var(--fw-semibold);
    cursor: pointer; transition: all var(--transition-fast); white-space: nowrap;
  }
  .bug-btn:hover { color: var(--color-light); background-color: rgba(255,255,255,0.05); }
  .bug-btn-label { flex: 1; text-align: left; }
</style>
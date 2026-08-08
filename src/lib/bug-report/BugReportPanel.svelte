<script lang="ts">
  import { onMount } from 'svelte';
  import { m } from '$lib/i18n';
  import { captureContext } from './context';
  import { getRecentErrors } from './error-capture';
  import { buildIssueBody, type BugReportForm, type AttachOptions } from './build-issue-body';
  import { buildIssueUrl } from './build-issue-url';

  let { onClose }: { onClose: () => void } = $props();

  let whatHappened = $state('');
  let expected     = $state('');
  let steps        = $state('');
  let attachContext = $state(true);
  let attachErrors  = $state(true);
  let showAttach   = $state(false);
  let triedSubmit  = $state(false);

  // Se captura una vez, al abrir el panel
  const ctx = captureContext();
  const errors = getRecentErrors();

  let whatValid = $derived(whatHappened.trim().length >= 10);

  function submit() {
    triedSubmit = true;
    if (!whatValid) return;
    const form: BugReportForm = { whatHappened, expected, steps };
    const attach: AttachOptions = { context: attachContext, errors: attachErrors };
    const body = buildIssueBody(form, ctx, errors, attach);
    const title = whatHappened.trim().slice(0, 80);
    const url = buildIssueUrl(title, body);
    const win = window.open(url, '_blank');
    if (!win) window.location.href = url;
    onClose();
  }

  // NEH-220: role="dialog" promises the focus lives in here, so move it in on
  // open and hand it back to whatever opened the modal on close.
  let dialogEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogEl?.focus();
    return () => previouslyFocused?.focus();
  });

  // Escape is the keyboard equivalent of clicking the backdrop.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- El backdrop cierra al hacer clic fuera; el equivalente por teclado es
     Escape, arriba. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bug-backdrop"
  onclick={(e) => { if ((e.target as HTMLElement).classList.contains('bug-backdrop')) onClose(); }}
>
  <div
    class="bug-card"
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="bug-report-title"
    tabindex="-1"
  >
    <div class="bug-header">
      <h3 class="bug-title" id="bug-report-title">{$m.bug_report_title}</h3>
      <button class="bug-close" onclick={onClose} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-md">close</span>
      </button>
    </div>
    <p class="bug-desc">{$m.bug_report_desc}</p>

    <label class="bug-label" for="bug-what">{$m.bug_field_what} *</label>
    <textarea id="bug-what" class="bug-input" rows="3" bind:value={whatHappened} placeholder={$m.bug_field_what_ph}></textarea>
    {#if triedSubmit && !whatValid}
      <p class="bug-error">{$m.bug_min_chars}</p>
    {/if}

    <label class="bug-label" for="bug-expected">{$m.bug_field_expected} <span class="bug-optional">({$m.bug_field_optional})</span></label>
    <textarea id="bug-expected" class="bug-input" rows="2" bind:value={expected}></textarea>

    <label class="bug-label" for="bug-steps">{$m.bug_field_steps} <span class="bug-optional">({$m.bug_field_optional})</span></label>
    <textarea id="bug-steps" class="bug-input" rows="2" bind:value={steps}></textarea>

    <button type="button" class="bug-attach-toggle" onclick={() => showAttach = !showAttach}>
      <span class="material-symbols-outlined icon-sm">{showAttach ? 'expand_less' : 'expand_more'}</span>
      {$m.bug_attach_title}
    </button>
    {#if showAttach}
      <div class="bug-attach">
        <label class="bug-check"><input type="checkbox" bind:checked={attachContext} /> {$m.bug_attach_context}</label>
        <label class="bug-check"><input type="checkbox" bind:checked={attachErrors} /> {$m.bug_attach_errors}</label>
      </div>
    {/if}

    <div class="bug-actions">
      <button class="btn btn-secondary" onclick={onClose}>{$m.common_cancel}</button>
      <button class="btn btn-primary" onclick={submit}>
        <span class="material-symbols-outlined icon-sm">open_in_new</span>
        {$m.bug_submit}
      </button>
    </div>
  </div>
</div>

<style>
  .bug-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px; }
  .bug-card { background: var(--color-surface-alt); border: 1px solid var(--border-color); border-radius: var(--radius-xl); padding: 24px; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; color: var(--color-light); display: flex; flex-direction: column; gap: 8px; }
  .bug-card:focus { outline: none; }
  .bug-header { display: flex; align-items: center; justify-content: space-between; }
  .bug-title { font-size: var(--text-h3); font-weight: var(--fw-bold); margin: 0; }
  .bug-close { background: none; border: none; color: var(--color-light-grey); cursor: pointer; }
  .bug-desc { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0 0 6px; line-height: 1.5; }
  .bug-label { font-size: 12px; font-weight: var(--fw-semibold); margin-top: 6px; }
  .bug-optional { color: var(--color-light-grey); font-weight: 400; }
  .bug-input { width: 100%; background: var(--color-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--color-light); font-family: var(--font-family); font-size: var(--text-sm); padding: 10px; resize: vertical; box-sizing: border-box; }
  .bug-input:focus { outline: none; border-color: var(--color-primary); }
  .bug-error { color: var(--color-error); font-size: 12px; margin: 2px 0 0; }
  .bug-attach-toggle { display: flex; align-items: center; gap: 6px; background: none; border: none; color: var(--color-light-grey); cursor: pointer; font-family: var(--font-family); font-size: var(--text-sm); padding: 6px 0; margin-top: 4px; }
  .bug-attach { display: flex; flex-direction: column; gap: 8px; padding: 8px 0 4px; }
  .bug-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--color-light-grey); }
  .bug-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px; }
</style>
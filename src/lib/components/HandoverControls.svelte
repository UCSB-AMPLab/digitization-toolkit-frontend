<script lang="ts">
  // ============================================================================
  // Handover controls (NEH-260): "Enviar a revisión" and "Retirar de revisión"
  // in a volume's top bar, with their confirmation and refusal dialogs and the
  // notice that reports the result.
  //
  // Shown to operators and admins only; the backend refuses both calls to
  // anyone else (allow_contributor in collections.py).
  // ============================================================================

  import { collectionsApi, type Record } from '$lib/api';
  import { m } from '$lib/i18n';
  import { handoverCounts, handoverOffer, promoteBlockers } from '$lib/handover';

  let { records, collectionId, onChanged }: {
    records: Record[];
    collectionId: number;
    onChanged: () => Promise<void> | void;
  } = $props();

  let counts = $derived(handoverCounts(records));
  let offer  = $derived(handoverOffer(counts));

  let dialog   = $state<'send' | 'take-back' | 'refused' | null>(null);
  let busy     = $state(false);
  let blockers = $state<number[]>([]);
  let notice   = $state<{ kind: 'success' | 'error'; text: string } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  let blockerTitles = $derived(
    blockers.map((id) => records.find((r) => r.id === id)?.title || $m.record_fallback_title(id))
  );

  function showNotice(kind: 'success' | 'error', text: string) {
    clearTimeout(noticeTimer);
    notice = { kind, text };
    // An error stays until it is closed; a success clears itself.
    if (kind === 'success') noticeTimer = setTimeout(() => (notice = null), 6000);
  }

  function closeDialog() {
    if (!busy) dialog = null;
  }

  async function confirmSend() {
    busy = true;
    try {
      const { promoted } = await collectionsApi.promote(collectionId);
      dialog = null;
      showNotice('success', promoted > 0 ? $m.col_handover_sent(promoted) : $m.col_handover_nothing_to_send);
      await onChanged();
    } catch (err) {
      const ids = promoteBlockers(err);
      if (ids) {
        // Reload first so the titles in the refusal are the current ones.
        await onChanged();
        blockers = ids;
        dialog = 'refused';
      } else {
        dialog = null;
        showNotice('error', $m.col_handover_send_error);
      }
    } finally {
      busy = false;
    }
  }

  async function confirmTakeBack() {
    busy = true;
    try {
      const { taken_back } = await collectionsApi.takeBack(collectionId);
      dialog = null;
      showNotice('success', taken_back > 0 ? $m.col_takeback_done(taken_back) : $m.col_takeback_nothing);
      await onChanged();
    } catch {
      dialog = null;
      showNotice('error', $m.col_takeback_error);
    } finally {
      busy = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && dialog) closeDialog();
  }

  // Move focus into a dialog when it opens, and back where it was on close.
  function focusOnOpen(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    node.focus();
    return { destroy: () => previous?.focus() };
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if offer.takeBack}
  <button class="btn btn-ghost handover-btn" disabled={busy} onclick={() => (dialog = 'take-back')}>
    {$m.col_handover_take_back}
  </button>
{/if}
{#if offer.send}
  <button class="btn btn-primary handover-btn" disabled={busy} onclick={() => (dialog = 'send')}>
    {offer.send === 'new' ? $m.col_handover_send_new(counts.captured) : $m.col_handover_send}
  </button>
{/if}

{#if dialog}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="handover-backdrop" onclick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
    <div
      class="handover-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handover-title"
      tabindex="-1"
      use:focusOnOpen
    >
      {#if dialog === 'send'}
        <h3 id="handover-title" class="handover-title">{$m.col_handover_confirm_title}</h3>
        <p class="handover-body">{$m.col_handover_confirm_body(counts.captured)}</p>
        <p class="handover-body">{$m.col_handover_confirm_undo(counts.captured)}</p>
        <div class="handover-actions">
          <button class="btn btn-ghost" disabled={busy} onclick={closeDialog}>{$m.common_cancel}</button>
          <button class="btn btn-primary" disabled={busy} onclick={confirmSend}>{$m.col_handover_confirm_submit}</button>
        </div>

      {:else if dialog === 'take-back'}
        <h3 id="handover-title" class="handover-title">{$m.col_takeback_confirm_title}</h3>
        <p class="handover-body">{$m.col_takeback_confirm_body(counts.inReview)}</p>
        {#if counts.approved + counts.rejected > 0}
          <p class="handover-body">{$m.col_takeback_confirm_kept(counts.approved, counts.rejected)}</p>
        {/if}
        <div class="handover-actions">
          <button class="btn btn-ghost" disabled={busy} onclick={closeDialog}>{$m.common_cancel}</button>
          <button class="btn btn-primary" disabled={busy} onclick={confirmTakeBack}>{$m.col_takeback_confirm_submit}</button>
        </div>

      {:else if dialog === 'refused'}
        <h3 id="handover-title" class="handover-title">{$m.col_handover_refused_title}</h3>
        <p class="handover-body">{$m.col_handover_refused_body(blockers.length)}</p>
        <ul class="handover-blockers">
          {#each blockerTitles as title}
            <li>{title}</li>
          {/each}
        </ul>
        <p class="handover-body handover-muted">{$m.col_handover_refused_unchanged}</p>
        <div class="handover-actions">
          <button class="btn btn-ghost" onclick={closeDialog}>{$m.common_close}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if notice}
  <!-- The live region is the message alone, so a screen reader does not
       read the icon's ligature name or the close button with it. -->
  <div class="handover-notice {notice.kind}">
    <span class="material-symbols-outlined" aria-hidden="true">{notice.kind === 'error' ? 'error' : 'check_circle'}</span>
    <span class="handover-notice-text" role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</span>
    <button class="handover-notice-close" onclick={() => (notice = null)} aria-label={$m.common_close}>
      <span class="material-symbols-outlined" aria-hidden="true">close</span>
    </button>
  </div>
{/if}

<style>
  /* Same pill shape as the camera button beside it in the top bar. */
  .handover-btn {
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
  }

  .handover-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 24px;
  }
  .handover-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 28px;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: var(--shadow-lg);
    outline: none;
  }
  .handover-title {
    font-size: var(--text-h4);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0;
  }
  .handover-body {
    font-size: var(--text-base);
    color: var(--color-light);
    line-height: 1.5;
    margin: 0;
  }
  .handover-muted { color: var(--color-light-grey); }
  .handover-blockers {
    margin: 0;
    padding: 0 0 0 20px;
    max-height: 200px;
    overflow-y: auto;
    color: var(--color-light);
  }
  .handover-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  .handover-notice {
    position: fixed;
    top: 84px;
    right: 16px;
    z-index: 350;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 420px;
    padding: 8px 8px 8px 16px;
    border-radius: var(--radius-md);
    border: 1px solid;
    font-size: var(--text-base);
    color: var(--color-light);
    box-shadow: var(--shadow-md);
  }
  .handover-notice.success { background-color: var(--color-surface); border-color: var(--color-success); }
  .handover-notice.success .material-symbols-outlined:first-child { color: var(--color-success); }
  .handover-notice.error { background-color: var(--color-surface); border-color: var(--color-error); }
  .handover-notice.error .material-symbols-outlined:first-child { color: var(--color-error); }
  .handover-notice-text { flex: 1; }
  .handover-notice-close {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    border: none;
    background: none;
    color: var(--color-light-grey);
    cursor: pointer;
  }
</style>

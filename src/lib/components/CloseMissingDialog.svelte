<script lang="ts">
  // The close dialog (NEH-317): an opening or a page that is not there to
  // capture is closed with a reason, through POST /records/{id}/close-missing.
  // The four reasons, details, and what closing does. "Something else" needs
  // the details, as the backend does; the dialog asks for them before
  // sending. The two 409s (not_missing, already_closed) and any other failure
  // are shown in the dialog, which stays open. On success the closed record
  // goes to `onClosed`; the caller takes it off its list or moves the guide on.
  //
  // The app has no folio for a record, so the body is the variant without
  // one (close_body(null)).
  //
  // A record that misses one page (missing_side 'left' or 'right') gets the
  // page wording: title, body, the "elsewhere" reason, what closing does,
  // the button and the errors. A placeholder ('both') gets the opening's.
  //
  // It sits above the capture screen's modal, from which it can be opened.
  //
  // Version: 0.3.3

  import { recordsApi, ApiError, CLOSED_REASONS, type ClosedReason, type Record as ApiRecord } from '$lib/api';
  import { m } from '$lib/i18n';
  import { dismissible } from '$lib/dialog';

  let {
    record,
    onCancel,
    onClosed,
  }: {
    record: Pick<ApiRecord, 'id' | 'missing_side'>;
    onCancel: () => void;
    onClosed: (record: ApiRecord) => void;
  } = $props();

  let reason = $state<ClosedReason>('foliation_skip');
  let note = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let noteMissing = $state(false);

  // One page, not a whole opening.
  let isPage = $derived(record.missing_side === 'left' || record.missing_side === 'right');

  const reasonLabel = $derived({
    foliation_skip: $m.close_reason_skip,
    leaf_missing_from_volume: $m.close_reason_leaf_missing,
    captured_elsewhere: isPage ? $m.close_page_reason_elsewhere : $m.close_reason_elsewhere,
    other: $m.close_reason_other,
  } satisfies { [K in ClosedReason]: string });

  function refusalText(err: unknown): string {
    if (err instanceof ApiError && err.status === 409) {
      const code = (err.detail as { code?: unknown } | undefined)?.code;
      if (code === 'not_missing') return $m.close_err_not_missing;
      if (code === 'already_closed') return isPage ? $m.close_page_err_already_closed : $m.close_err_already_closed;
    }
    return isPage ? $m.close_page_err_failed : $m.close_err_failed;
  }

  async function submit() {
    if (sending) return;
    const details = note.trim();
    noteMissing = reason === 'other' && !details;
    if (noteMissing) return;
    sending = true;
    error = null;
    try {
      const closed = await recordsApi.closeMissing(record.id, { reason, note: details || null });
      onClosed(closed);
    } catch (err) {
      // The backend's English text goes to the console only.
      console.error('[CloseMissingDialog] Error closing the record:', err);
      error = refusalText(err);
    } finally {
      sending = false;
    }
  }

  function cancel() {
    if (sending) return;
    onCancel();
  }
</script>

<div class="cm-backdrop" use:dismissible={{ onDismiss: cancel, escape: !sending }}>
  <div class="cm-card dialog-fit" role="dialog" aria-modal="true" aria-labelledby="cm-title">
    <div class="cm-head">
      <h2 class="cm-title" id="cm-title">{isPage ? $m.close_page_title : $m.close_title}</h2>
      <p class="cm-body">{isPage ? $m.close_page_body : $m.close_body(null)}</p>
    </div>

    <fieldset class="cm-reasons">
      <legend class="cm-legend">{$m.close_legend}</legend>
      {#each CLOSED_REASONS as r (r)}
        <label class="cm-reason">
          <input type="radio" name="cm-reason" value={r} bind:group={reason} disabled={sending} />
          <span>{reasonLabel[r]}</span>
        </label>
      {/each}
    </fieldset>

    <label class="cm-field">
      <span class="input-label">{$m.close_details}</span>
      <textarea class="input cm-note" class:input-error={noteMissing} rows="3" bind:value={note} disabled={sending}></textarea>
    </label>
    {#if noteMissing}
      <p class="cm-hint" role="alert">{$m.close_note_required}</p>
    {/if}

    <p class="cm-after">{isPage ? $m.close_page_after_note : $m.close_after_note}</p>

    {#if error}
      <div class="cm-error" role="alert" aria-live="polite">{error}</div>
    {/if}

    <div class="cm-actions">
      <button class="btn btn-ghost" onclick={cancel} disabled={sending}>{$m.close_back}</button>
      <button class="btn btn-primary" onclick={submit} disabled={sending}>{isPage ? $m.close_page_submit : $m.close_submit}</button>
    </div>
  </div>
</div>

<style>
  .cm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background-color: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  }
  .cm-card {
    width: 100%;
    max-width: 520px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 28px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    background-color: var(--color-surface-alt);
    box-shadow: var(--shadow-lg);
  }
  .cm-head { display: flex; flex-direction: column; gap: 6px; }
  .cm-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); }
  .cm-body { margin: 0; font-size: var(--text-sm); line-height: 1.5; color: var(--color-light-grey); }
  .cm-reasons { margin: 0; padding: 0; border: none; display: flex; flex-direction: column; gap: 8px; }
  .cm-legend { padding: 0; margin-bottom: 8px; font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light); }
  .cm-reason {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--touch-target-min);
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-light);
    cursor: pointer;
  }
  .cm-reason input { flex-shrink: 0; width: 18px; height: 18px; accent-color: var(--color-primary); }
  .cm-field { display: flex; flex-direction: column; }
  .cm-note { resize: vertical; min-height: 80px; }
  .cm-hint { margin: -8px 0 0; font-size: var(--text-sm); color: var(--color-error); }
  .cm-after {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-light-grey);
  }
  .cm-error {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-error);
    background-color: var(--color-error-bg);
    color: var(--color-error);
    font-size: var(--text-sm);
  }
  .cm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; }
</style>

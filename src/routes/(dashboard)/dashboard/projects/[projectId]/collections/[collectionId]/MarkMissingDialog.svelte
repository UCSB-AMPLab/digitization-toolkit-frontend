<script lang="ts">
  // The mark dialog (NEH-317, Insert.dc.html): marks openings never captured
  // after a record of the volume, through POST
  // /collections/{id}/records/missing-opening. It names the record by its
  // sequence `n`; the app has no folio for a record, so the body is the
  // variant without one (mark_body(n, null)). It asks how many openings are
  // missing: not known (count null, which the backend takes as one; the
  // operator adds the others from the capture screen), one, or more than
  // one with a count kept within 2 and 50; what should be there; and a note
  // for the operator. Empty fields are sent as null. A refusal is shown in
  // the dialog, which stays open; on success `onMarked` reloads the grid.
  //
  // Version: 0.3.3

  import { collectionsApi, type Record as ApiRecord } from '$lib/api';
  import { m } from '$lib/i18n';
  import { dismissible } from '$lib/dialog';

  let {
    collectionId,
    afterRecord,
    n,
    onCancel,
    onMarked,
  }: {
    collectionId: number;
    afterRecord: Pick<ApiRecord, 'id'>;
    // The record's sequence, as the grid shows it.
    n: number;
    onCancel: () => void;
    onMarked: () => void;
  } = $props();

  const MIN_MORE = 2;
  const MAX_COUNT = 50;

  let howMany = $state<'unknown' | 'one' | 'more'>('unknown');
  let more = $state<number>(MIN_MORE);
  let expected = $state('');
  let note = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);

  function count(): number | null {
    if (howMany === 'unknown') return null;
    if (howMany === 'one') return 1;
    const value = Math.round(Number(more));
    if (!Number.isFinite(value)) return MIN_MORE;
    return Math.min(MAX_COUNT, Math.max(MIN_MORE, value));
  }

  async function submit() {
    if (sending) return;
    sending = true;
    error = null;
    try {
      await collectionsApi.markMissingOpenings(collectionId, {
        afterRecordId: afterRecord.id,
        count: count(),
        expected: expected.trim() || null,
        note: note.trim() || null,
      });
      onMarked();
    } catch (err) {
      // The backend's English text goes to the console only.
      console.error('[MarkMissingDialog] Error marking openings missing:', err);
      error = $m.mark_error;
    } finally {
      sending = false;
    }
  }

  function cancel() {
    if (sending) return;
    onCancel();
  }
</script>

<div class="mm-backdrop" use:dismissible={{ onDismiss: cancel, escape: !sending }}>
  <div class="mm-card dialog-fit" role="dialog" aria-modal="true" aria-labelledby="mm-title">
    <div class="mm-head">
      <h2 class="mm-title" id="mm-title">{$m.mark_title}</h2>
      <p class="mm-body">{$m.mark_body(n, null)}</p>
    </div>

    <fieldset class="mm-count">
      <legend class="mm-legend">{$m.mark_count_legend}</legend>
      <label class="mm-option">
        <input type="radio" name="mm-count" value="unknown" bind:group={howMany} disabled={sending} />
        <span>{$m.mark_count_unknown}</span>
      </label>
      <label class="mm-option">
        <input type="radio" name="mm-count" value="one" bind:group={howMany} disabled={sending} />
        <span>{$m.mark_count_one}</span>
      </label>
      <div class="mm-option">
        <label class="mm-more">
          <input type="radio" name="mm-count" value="more" bind:group={howMany} disabled={sending} />
          <span>{$m.mark_count_more}</span>
        </label>
        <input
          class="input mm-number"
          type="number"
          min={MIN_MORE}
          max={MAX_COUNT}
          step="1"
          bind:value={more}
          aria-label={$m.mark_count_number_aria}
          disabled={sending || howMany !== 'more'}
        />
      </div>
    </fieldset>

    <label class="mm-field">
      <span class="input-label">{$m.mark_expected}</span>
      <input class="input" type="text" bind:value={expected} disabled={sending} />
    </label>

    <label class="mm-field">
      <span class="input-label">{$m.mark_note}</span>
      <textarea class="input mm-note" rows="3" bind:value={note} disabled={sending}></textarea>
    </label>

    {#if error}
      <div class="mm-error" role="alert" aria-live="polite">{error}</div>
    {/if}

    <div class="mm-actions">
      <button class="btn btn-ghost" onclick={cancel} disabled={sending}>{$m.mark_cancel}</button>
      <button class="btn btn-primary" onclick={submit} disabled={sending}>{$m.mark_submit}</button>
    </div>
  </div>
</div>

<style>
  .mm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background-color: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  }
  .mm-card {
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
  .mm-head { display: flex; flex-direction: column; gap: 6px; }
  .mm-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); }
  .mm-body { margin: 0; font-size: var(--text-sm); line-height: 1.5; color: var(--color-light-grey); }
  .mm-count { margin: 0; padding: 0; border: none; display: flex; flex-direction: column; gap: 8px; }
  .mm-legend { padding: 0; margin-bottom: 8px; font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light); }
  .mm-option,
  .mm-more {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--touch-target-min);
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-light);
  }
  label.mm-option, .mm-more { cursor: pointer; }
  .mm-option input[type='radio'],
  .mm-more input[type='radio'] { flex-shrink: 0; width: 18px; height: 18px; accent-color: var(--color-primary); }
  .mm-number { width: 6rem; }
  .mm-field { display: flex; flex-direction: column; }
  .mm-note { resize: vertical; min-height: 80px; }
  .mm-error {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-error);
    background-color: var(--color-error-bg);
    color: var(--color-error);
    font-size: var(--text-sm);
  }
  .mm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; }
</style>

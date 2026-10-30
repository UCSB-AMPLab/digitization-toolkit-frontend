<script lang="ts">
  // What it means that Fisqua excluded a record (contract 1.6): it is not a
  // page of the volume, and no retake is asked for. When Fisqua's latest
  // exclusion of the record carries a reason, the reason follows. The reason
  // is on the history row of that change, so it is read from GET
  // /collections/{id}/status-changes, and only for an excluded record. If the
  // history cannot be read, the notice shows without the reason.
  //
  // Version: 0.2.1

  import { collectionsApi, type Record } from '$lib/api';
  import { m } from '$lib/i18n';
  import { exclusionNote } from '$lib/excluded';

  let { record }: { record: Pick<Record, 'id' | 'status' | 'collection_id'> } = $props();

  let excluded = $derived(record.status === 'excluded');

  // The note read for `forId`; a note read for another record is not shown.
  let loaded = $state<{ forId: number; note: string | null }>({ forId: 0, note: null });
  let note = $derived(loaded.forId === record.id ? loaded.note : null);
  let seq = 0;

  $effect(() => {
    const id = record.id;
    const collectionId = record.collection_id;
    if (!excluded || collectionId == null) return;
    const mine = ++seq;
    collectionsApi.statusChanges(collectionId).then(
      (changes) => {
        if (mine === seq) loaded = { forId: id, note: exclusionNote(changes, id) };
      },
      (err) => {
        console.error('[ExcludedNotice] Error loading the status history:', err);
      }
    );
  });
</script>

{#if excluded}
  <div class="excluded-notice" role="note">
    <p class="excluded-hint">{$m.status_excluded_hint}</p>
    {#if note}
      <p class="excluded-note"><span class="excluded-note-label">{$m.excluded_note_label}</span> <span>{note}</span></p>
    {/if}
  </div>
{/if}

<style>
  .excluded-notice {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-light-grey);
  }
  .excluded-notice p { margin: 0; }
  .excluded-note-label { font-weight: 600; }
</style>

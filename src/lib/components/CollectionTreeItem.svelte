<script lang="ts">
  import type { Collection } from '$lib/api';

  export let collection: Collection;
  export let level: number = 0;
  export let expandedCollections: Set<number>;
  export let childCollectionsMap: Map<number, Collection[]>;
  export let loadingChildren: Set<number>;

  // Callbacks passed from parent
  export let onToggleExpand: (id: number) => void;
  export let onViewCollection: (collection: Collection) => void;
  export let onAddSubcollection: (parentId: number) => void;

  // Reactive helpers derived from props
  $: children = childCollectionsMap.get(collection.id) || [];
  $: hasKids = children.length > 0;
  $: expanded = expandedCollections.has(collection.id);
  $: loadingKids = loadingChildren.has(collection.id);
  $: showToggle = hasKids || loadingKids || !childCollectionsMap.has(collection.id);
</script>

<div class="collection-tree-item" data-level={level}>
  <div class="collection-item">
    {#if showToggle}
      <button
        class="tree-toggle"
        on:click={() => onToggleExpand(collection.id)}
        disabled={loadingKids}
      >
        {#if loadingKids}
          <span class="material-symbols-outlined">more_horiz</span>
        {:else if expanded}
          <span class="material-symbols-outlined">arrow_menu_close</span>
        {:else}
          <span class="material-symbols-outlined">arrow_menu_open</span>
        {/if}
      </button>
    {:else}
      <span class="tree-toggle-spacer"></span>
    {/if}

    <div
      class="collection-info clickable"
      on:click={() => onViewCollection(collection)}
      on:keydown={(e) => e.key === 'Enter' && onViewCollection(collection)}
      role="button"
      tabindex="0"
    >
      <h4>{collection.name}</h4>
      {#if collection.description}
        <p>{collection.description}</p>
      {/if}
      {#if collection.collection_type}
        <span class="badge">{collection.collection_type}</span>
      {/if}
    </div>
    <div class="collection-actions">
      <button
        class="btn-add-collection"
        on:click={() => onAddSubcollection(collection.id)}
        title="Add subcollection"
      >
        <span class="material-symbols-outlined">create_new_folder</span>
      </button>
    </div>
  </div>

  {#if expanded && childCollectionsMap.has(collection.id)}
    {#each children as child (child.id)}
      <svelte:self
        collection={child}
        level={level + 1}
        {expandedCollections}
        {childCollectionsMap}
        {loadingChildren}
        {onToggleExpand}
        {onViewCollection}
        {onAddSubcollection}
      />
    {/each}
  {/if}
</div>

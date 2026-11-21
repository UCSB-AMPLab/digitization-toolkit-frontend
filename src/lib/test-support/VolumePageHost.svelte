<script lang="ts">
  // The volume page as the app mounts it: its layout around its page. Used
  // by tests only.
  //
  // Version: 0.1.0

  import Layout from '../../routes/(dashboard)/dashboard/projects/[projectId]/collections/[collectionId]/+layout@.svelte';
  import Page from '../../routes/(dashboard)/dashboard/projects/[projectId]/collections/[collectionId]/+page.svelte';
</script>

<Layout>
  <Page />
</Layout>

<script lang="ts">
	// `/welcome` leads to the first-run wizard at `/setup`, which shows while
	// the unit needs setting up and goes to `/login` otherwise. Older links and
	// bookmarks to the splash land there.

	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	if (browser) goto('/setup', { replaceState: true });
</script>

<script lang="ts">
	// The label on or beside a picture of a page that names both facts: the
	// camera that photographed it and the page it is. Role `left` is the
	// even/verso page, photographed by the right camera; role `right` the
	// odd/recto page, by the left camera.
	//
	// It shows the words ("Right camera · even/verso") only when the element
	// it labels is wide enough for them on one line, and otherwise the badge
	// form: the camera symbol, the camera's letter and the page term
	// ("R · even/verso"). The words are always its title, and in the badge
	// form its accessible name too. It never wraps.
	//
	// The caller passes the labelled element's measured width (every site
	// already binds it for its own layout), so the decision is made here and
	// nowhere else. Position and look belong to the caller's `class`, which
	// the caller styles with :global() because this element is not in its
	// scope.
	//
	// Version: 0.3.0

	import { m } from '$lib/i18n';

	let {
		role,
		width,
		title = undefined,
		class: className = '',
		id = undefined
	}: {
		role: 'left' | 'right';
		// The labelled element's width in CSS pixels; 0 before it is measured.
		width: number;
		// Appended to the words in the title, after " · ".
		title?: string;
		class?: string;
		id?: string;
	} = $props();

	// The widest full label ("Cámara izquierda · impar/recto") measures 229px
	// at the capture screen's label size (14px bold, 10px padding); with the
	// 8px offset on each side of the pane that needs an element of 245px.
	// Words are shown only in an element at least 280px wide, which leaves
	// margin for a longer translation; every other site sets the label
	// smaller, so the same bound holds there. The unit's 800x480 screen
	// gives the capture screen's panes about 157-176px.
	const WORDS_MIN = 280;

	let words = $derived(role === 'left' ? $m.cam_page_even : $m.cam_page_odd);
	let letter = $derived(role === 'left' ? $m.badge_cam_right : $m.badge_cam_left);
	let term = $derived(role === 'left' ? $m.page_term_even : $m.page_term_odd);
	let fullTitle = $derived(title ? `${words} · ${title}` : words);
	let isBadge = $derived(width < WORDS_MIN);
</script>

{#if isBadge}
	<span class="pcl {className}" {id} role="img" aria-label={words} title={fullTitle}
		><span class="material-symbols-outlined pcl-cam" aria-hidden="true">photo_camera</span>{letter} ·
		{term}</span
	>
{:else}
	<span class="pcl {className}" {id} title={fullTitle}>{words}</span>
{/if}

<style>
	.pcl {
		white-space: nowrap;
	}
	.pcl-cam {
		font-size: 1em;
		line-height: 1;
		vertical-align: -0.14em;
		margin-right: 1px;
	}
</style>

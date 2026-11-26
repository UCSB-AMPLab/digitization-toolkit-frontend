<script lang="ts">
	// Settings > Capture key (NEH-336), for administrators and operators. A
	// USB digitization pedal behaves as a keyboard that sends a single key,
	// different for each device. The unit stores one key for every browser:
	// "Press the key or pedal to assign" takes the next key pressed, and "Use
	// the default" goes back to the two keys that work with no setup, the
	// space bar and b. Each change is PUT /system/unit/capture-key, whose
	// answer becomes the unit's state, so the capture screen follows it
	// (src/lib/capture-key-unit.ts).
	//
	// While a key is awaited, the window's next keydown is the key: it is
	// taken from whatever has focus. A bare modifier (Control, Alt, Shift,
	// Meta) waits for the key that completes the combination; released with
	// nothing else, it is reported as a device that sends only the modifier.
	// Escape and Cancel end the waiting; Tab is left to move the focus. The
	// waiting takes only keys meant for it: a key typed into a text field, a
	// select or an editable element is left alone, and any other dialog (one
	// opened from the account menu, say) ends the waiting when it opens, as
	// does the page being hidden or left. A key that cannot be saved leaves
	// the one before, with one line saying so. The unit's key is read again
	// when the section opens (watchCaptureChords).

	import { onDestroy } from 'svelte';
	import { pageLife } from '$lib/page-life';
	import { m } from '$lib/i18n';
	import {
		describeChords,
		isTextEntry,
		learnFromEvent,
		readChords,
		type CaptureChord
	} from '$lib/capture-key';
	import { setUnitCaptureKey, watchCaptureChords } from '$lib/capture-key-unit';
	import { dialogOpen, openDialogCount } from '$lib/dialog';

	let chords = $state<readonly CaptureChord[]>(readChords());
	$effect(() => watchCaptureChords((c) => (chords = c)));
	// Another dialog opening ends the waiting.
	$effect(() =>
		dialogOpen.subscribe((open) => {
			if (open) stopLearning();
		})
	);

	function otherDialogOpen(): boolean {
		return (
			openDialogCount() > 0 ||
			document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]') !== null
		);
	}

	let learning = $state(false);
	let pendingModifier = $state<'Control' | 'Alt' | 'Shift' | 'Meta' | null>(null);
	let learnMessage = $state<string | null>(null);
	let saving = $state(false);
	let saveError = $state(false);

	function startLearning() {
		learning = true;
		pendingModifier = null;
		learnMessage = null;
		saveError = false;
	}

	function stopLearning() {
		learning = false;
		pendingModifier = null;
		learnMessage = null;
	}

	// An answer acts on the page only while its save is the current one
	// ($lib/page-life): not after the section is gone. The unit's state takes
	// the answer in the store, unless a later save was started (unit-mode.ts).
	const life = pageLife();

	async function save(chord: CaptureChord | null) {
		const op = life.begin('save');
		saving = true;
		saveError = false;
		try {
			await setUnitCaptureKey(chord);
			if (!op.current()) return;
		} catch {
			if (!op.current()) return;
			saveError = true;
		}
		saving = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!learning) return;
		if (otherDialogOpen()) {
			stopLearning();
			return;
		}
		if (isTextEntry(event.target as Element | null) || isTextEntry(document.activeElement)) return;
		if (event.key === 'Tab') return;
		event.preventDefault();
		if (event.key === 'Escape') {
			stopLearning();
			return;
		}
		const result = learnFromEvent(event);
		if (result.ok) {
			stopLearning();
			save(result.chord);
			return;
		}
		if (result.reason === 'modifier-only') {
			pendingModifier = result.modifier;
			learnMessage = null;
			return;
		}
		// Dead, Unidentified, or an event in the middle of IME composition.
		learnMessage = $m.lv_capture_key_unbindable;
	}

	function handleKeyup(event: KeyboardEvent) {
		if (!learning || otherDialogOpen()) return;
		if (pendingModifier && event.key === pendingModifier) {
			learnMessage = $m.lv_capture_key_modifier_only(pendingModifier);
			pendingModifier = null;
		}
	}

	function useDefault() {
		stopLearning();
		save(null);
	}

	function handleVisibility() {
		if (document.visibilityState === 'hidden') stopLearning();
	}

	onDestroy(stopLearning);
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />
<svelte:document onvisibilitychange={handleVisibility} />

<div class="config-section">
	<h2 class="section-title">{$m.config_section_capture_key}</h2>
	<div class="config-card">
		<div class="config-row">
			<div class="row-info">
				<span class="row-label">
					{$m.lv_capture_key_current(describeChords(chords, $m.lv_capture_key_space))}
				</span>
				<span class="row-desc">{$m.lv_capture_key_desc}</span>
			</div>
			<div class="key-buttons">
				{#if learning}
					<button type="button" class="key-btn" onclick={stopLearning}>{$m.common_cancel}</button>
				{:else}
					<button type="button" class="key-btn" onclick={startLearning} disabled={saving}
						>{$m.lv_capture_key_learn}</button
					>
				{/if}
				<button type="button" class="key-btn" onclick={useDefault} disabled={saving}
					>{$m.lv_capture_key_reset}</button
				>
			</div>
		</div>
		{#if learning || learnMessage || saveError}
			<div class="config-row status-row">
				{#if learning}
					<p class="status" role="status">{$m.lv_capture_key_learning}</p>
				{/if}
				{#if learnMessage}
					<p class="status" role="alert">{learnMessage}</p>
				{/if}
				{#if saveError}
					<p class="status status-error" role="alert">{$m.config_capture_key_error}</p>
				{/if}
			</div>
		{/if}
		<div class="config-row">
			<p class="row-desc">{$m.lv_capture_key_note}</p>
		</div>
	</div>
</div>

<style>
	.config-section {
		margin-bottom: 32px;
	}

	.section-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		margin: 0 0 14px;
	}

	.config-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	/* The buttons wrap under the text when the body is narrow. */
	.config-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		padding: 18px 20px;
		gap: 12px 20px;
	}

	.config-row + .config-row {
		border-top: 1px solid var(--border-color);
	}

	.status-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}

	.row-info {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1 1 240px;
		min-width: 0;
	}

	.row-label {
		font-size: var(--text-base);
		color: var(--color-light);
		font-weight: var(--fw-medium);
	}

	.row-desc {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		line-height: 1.4;
	}

	.key-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
	}

	.key-btn {
		padding: 8px 14px;
		min-height: var(--touch-target-min);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-color);
		background-color: var(--color-surface-alt);
		color: var(--color-light);
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.key-btn:hover:not(:disabled) {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.key-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-primary);
	}

	.status-error {
		color: var(--color-error);
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let visible = $state(false);
	let keyboardDiv: HTMLDivElement | undefined = undefined;
	let keyboard: any = null;
	let currentInput: HTMLInputElement | HTMLTextAreaElement | null = null;
	let cleanupFunctions: Array<() => void> = [];

	onMount(() => {
		if (!browser) {
			console.log('VirtualKeyboard: Not in browser, skipping');
			return;
		}

		console.log('VirtualKeyboard: Initializing...');

		// Small delay to ensure DOM is ready
		setTimeout(() => {
			// Dynamically import keyboard only on client side
			import('simple-keyboard')
				.then((module) => import('simple-keyboard/build/css/index.css').then(() => module))
				.then((module) => {
					if (!keyboardDiv) {
						console.warn('VirtualKeyboard: keyboardDiv not available');
						return;
					}

					console.log('VirtualKeyboard: Creating keyboard instance');
					const KeyboardClass = module.default;

					keyboard = new KeyboardClass(keyboardDiv, {
						onChange: (input: string) => {
							if (currentInput) {
								currentInput.value = input;
								currentInput.dispatchEvent(new Event('input', { bubbles: true }));
							}
						},
						onKeyPress: (button: string) => {
							console.log('Key pressed:', button);
							if (button === '{enter}') {
								visible = false;
								currentInput?.blur();
							} else if (button === '{shift}') {
								handleShift();
							}
						},
						layout: {
							default: [
								'1 2 3 4 5 6 7 8 9 0 {bksp}',
								'q w e r t y u i o p',
								'a s d f g h j k l',
								'{shift} z x c v b n m {shift}',
								'@ {space} . {enter}'
							],
							shift: [
								'! @ # $ % ^ & * ( ) {bksp}',
								'Q W E R T Y U I O P',
								'A S D F G H J K L',
								'{shift} Z X C V B N M {shift}',
								'@ {space} . {enter}'
							]
						},
						display: {
							'{bksp}': '⌫',
							'{enter}': '↵',
							'{shift}': '⇧',
							'{space}': 'Space'
						},
						buttonTheme: [
							{
								class: 'hg-button-space',
								buttons: '{space}'
							},
							{
								class: 'hg-button-enter',
								buttons: '{enter}'
							},
							{
								class: 'hg-button-bksp',
								buttons: '{bksp}'
							}
						]
					});

					function handleShift() {
						const currentLayout = keyboard.options.layoutName;
						const newLayout = currentLayout === 'default' ? 'shift' : 'default';
						keyboard.setOptions({ layoutName: newLayout });
					}

					const handleFocus = (e: FocusEvent) => {
						const target = e.target as HTMLElement;
						console.log('Focus event:', target.tagName, target);
						if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
							currentInput = target as HTMLInputElement | HTMLTextAreaElement;
							keyboard?.setInput(currentInput.value || '');
							visible = true;
							console.log('VirtualKeyboard: Showing keyboard');
						}
					};

					const handleClickOutside = (e: MouseEvent) => {
						const target = e.target as HTMLElement;
						if (
							visible &&
							keyboardDiv &&
							!keyboardDiv.contains(target) &&
							target.tagName !== 'INPUT' &&
							target.tagName !== 'TEXTAREA'
						) {
							visible = false;
							console.log('VirtualKeyboard: Hiding keyboard');
						}
					};

					document.addEventListener('focusin', handleFocus);
					document.addEventListener('click', handleClickOutside);

					cleanupFunctions.push(
						() => document.removeEventListener('focusin', handleFocus),
						() => document.removeEventListener('click', handleClickOutside),
						() => keyboard?.destroy()
					);

					console.log('VirtualKeyboard: Event listeners attached');
				})
				.catch((err) => {
					console.error('Failed to load virtual keyboard:', err);
				});
		}, 100);

		return () => {
			console.log('VirtualKeyboard: Cleaning up');
			cleanupFunctions.forEach((fn) => fn());
		};
	});

	// Debug function
	export function showKeyboard() {
		visible = true;
	}
</script>

{#if browser}
	<!-- Always render the container when in browser, visibility controlled by CSS -->
	<div class="virtual-keyboard-container" class:visible>
		<div bind:this={keyboardDiv} class="virtual-keyboard"></div>
	</div>
{/if}

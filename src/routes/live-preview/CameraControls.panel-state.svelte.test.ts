// NEH-225: whether the camera panel is open, and which of its sections are
// open, are remembered in this browser. Without anything stored, or with
// storage unavailable, the panel starts collapsed with every section open.
// Names in storage that are not sections of the panel are ignored; a section
// not shown for the cameras connected keeps its stored state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { STORAGE_KEYS } from '$lib/storage-keys';
import CameraControls from './CameraControls.svelte';

function props(overrides: Record<string, unknown> = {}) {
	return {
		cameraMode: 'double' as const,
		shutterSpeed: '1/125s',
		iso: '100',
		aperture: '5.6',
		onCameraModeChange: vi.fn(),
		onShutterSpeedChange: vi.fn(),
		onIsoChange: vi.fn(),
		onApertureChange: vi.fn(),
		...overrides
	};
}

function clearStored() {
	localStorage.removeItem(STORAGE_KEYS.cameraPanelOpen);
	localStorage.removeItem(STORAGE_KEYS.cameraPanelSections);
}

beforeEach(() => {
	locale.set('en');
	clearStored();
	vi.spyOn(camerasApi, 'listDevices').mockResolvedValue([]);
	vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(new Error('not needed'));
});

afterEach(() => {
	vi.restoreAllMocks();
	clearStored();
});

const expandButton = (root: HTMLElement) =>
	root.querySelector(
		`button[aria-label="${en.cam_panel_expand_aria}"]`
	) as HTMLButtonElement | null;
const collapseButton = (root: HTMLElement) =>
	root.querySelector(`button[aria-label="${en.cam_panel_collapse}"]`) as HTMLButtonElement | null;
const trigger = (root: HTMLElement, label: string) =>
	[...root.querySelectorAll<HTMLButtonElement>('button.accordion-trigger')].find((b) =>
		b.textContent?.trim().startsWith(label)
	);
const sectionOpen = (root: HTMLElement, label: string) =>
	trigger(root, label)?.parentElement?.querySelector('.accordion-content') != null;

describe('camera panel: open state remembered (NEH-225)', () => {
	it('starts collapsed with every section open when nothing is stored', async () => {
		const screen = render(CameraControls, props());
		await vi.waitFor(() => expect(expandButton(screen.container)).not.toBeNull());
		expandButton(screen.container)!.click();
		await vi.waitFor(() => expect(trigger(screen.container, en.cam_histogram)).toBeTruthy());
		expect(sectionOpen(screen.container, en.cam_histogram)).toBe(true);
	});

	it('keeps the panel open and a closed section closed across a remount', async () => {
		const first = render(CameraControls, props());
		expandButton(first.container)!.click();
		await vi.waitFor(() => expect(trigger(first.container, en.cam_histogram)).toBeTruthy());
		trigger(first.container, en.cam_histogram)!.click();
		await vi.waitFor(() => expect(sectionOpen(first.container, en.cam_histogram)).toBe(false));
		first.unmount();

		const second = render(CameraControls, props());
		await vi.waitFor(() => expect(trigger(second.container, en.cam_histogram)).toBeTruthy());
		expect(expandButton(second.container)).toBeNull();
		expect(sectionOpen(second.container, en.cam_histogram)).toBe(false);
	});

	it('keeps the panel collapsed across a remount once it is closed again', async () => {
		const first = render(CameraControls, props());
		expandButton(first.container)!.click();
		await vi.waitFor(() => expect(collapseButton(first.container)).not.toBeNull());
		collapseButton(first.container)!.click();
		await vi.waitFor(() => expect(expandButton(first.container)).not.toBeNull());
		first.unmount();

		const second = render(CameraControls, props());
		await vi.waitFor(() => expect(expandButton(second.container)).not.toBeNull());
		expect(collapseButton(second.container)).toBeNull();
	});

	it('uses the defaults, and works, when storage throws', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('denied');
		});
		const screen = render(CameraControls, props());
		await vi.waitFor(() => expect(expandButton(screen.container)).not.toBeNull());
		expandButton(screen.container)!.click();
		await vi.waitFor(() => expect(trigger(screen.container, en.cam_histogram)).toBeTruthy());
		expect(sectionOpen(screen.container, en.cam_histogram)).toBe(true);
		trigger(screen.container, en.cam_histogram)!.click();
		await vi.waitFor(() => expect(sectionOpen(screen.container, en.cam_histogram)).toBe(false));
	});

	it('ignores stored names that are not sections, and stored values it cannot read', async () => {
		localStorage.setItem(STORAGE_KEYS.cameraPanelOpen, 'true');
		localStorage.setItem(STORAGE_KEYS.cameraPanelSections, JSON.stringify(['colour', 7, 'basic']));
		const screen = render(CameraControls, props());
		await vi.waitFor(() => expect(trigger(screen.container, en.cam_histogram)).toBeTruthy());
		expect(sectionOpen(screen.container, en.cam_histogram)).toBe(false);
		trigger(screen.container, en.cam_histogram)!.click();
		await vi.waitFor(() => expect(sectionOpen(screen.container, en.cam_histogram)).toBe(true));
		expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.cameraPanelSections)!)).toEqual([
			'basic',
			'histogram'
		]);
		screen.unmount();

		localStorage.setItem(STORAGE_KEYS.cameraPanelSections, '{not json');
		localStorage.setItem(STORAGE_KEYS.cameraPanelOpen, 'maybe');
		const again = render(CameraControls, props());
		await vi.waitFor(() => expect(expandButton(again.container)).not.toBeNull());
		expandButton(again.container)!.click();
		await vi.waitFor(() => expect(trigger(again.container, en.cam_histogram)).toBeTruthy());
		expect(sectionOpen(again.container, en.cam_histogram)).toBe(true);
	});

	it('leaves the stored state of a section not shown untouched', async () => {
		localStorage.setItem(STORAGE_KEYS.cameraPanelOpen, 'true');
		localStorage.setItem(STORAGE_KEYS.cameraPanelSections, JSON.stringify(['focus', 'histogram']));
		// Without the set-up controls, Basic, Focus and Settings are not shown.
		const screen = render(CameraControls, props({ setupControls: false }));
		await vi.waitFor(() => expect(trigger(screen.container, en.cam_histogram)).toBeTruthy());
		expect(trigger(screen.container, en.cam_section_basic)).toBeUndefined();
		trigger(screen.container, en.cam_histogram)!.click();
		await vi.waitFor(() => expect(sectionOpen(screen.container, en.cam_histogram)).toBe(false));
		expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.cameraPanelSections)!)).toEqual(['focus']);
	});
});

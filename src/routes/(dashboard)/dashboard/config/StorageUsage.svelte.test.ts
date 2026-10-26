// Configuración → Almacenamiento: the usage row and bar show only figures
// GET /system/storage reported (NEH-290). Fixtures are shaped as
// get_storage_info in app/api/system.py; every other request the page makes
// fails, which the page already tolerates.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import ConfigPage from './+page.svelte';

const GIB = 1024 ** 3;

function storage(usedGB: number, totalGB: number, available = true) {
	return {
		projects_path: '/data/projects',
		is_override: false,
		override_invalid: false,
		total_bytes: available ? totalGB * GIB : 0,
		used_bytes: available ? usedGB * GIB : 0,
		free_bytes: available ? (totalGB - usedGB) * GIB : 0,
		available,
		unavailable_reason: available ? null : 'The storage path for projects cannot be read.'
	};
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** `/system/storage` answers with `storageAnswer`; everything else with a 500. */
function serve(storageAnswer: Response) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		if (/\/system\/storage(\?|$)/.test(url)) return storageAnswer;
		return json(500, { detail: 'not in this test' });
	});
}

async function usageRow(container: HTMLElement) {
	await expect
		.poll(() => container.querySelector('[data-storage-used]'))
		.not.toBeNull();
	return container.querySelector('[data-storage-used]') as HTMLElement;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Configuración storage usage', () => {
	it('shows the reported figures, the bar and the alert at 85%', async () => {
		serve(json(200, storage(51, 60)));
		const { container } = render(ConfigPage);
		const row = await usageRow(container);
		expect(row.textContent).toContain('51 GB / 60 GB');
		expect(container.querySelector('.storage-bar-fill')).not.toBeNull();
		expect(container.querySelector('.storage-alert')?.textContent).toContain('85%');
	});

	it('shows no figures, no bar and no alert when the backend marks the root unavailable', async () => {
		serve(json(200, storage(0, 0, false)));
		const { container } = render(ConfigPage);
		const row = await usageRow(container);
		expect(row.textContent?.trim()).toBe('—');
		expect(container.querySelector('.storage-bar-fill')).toBeNull();
		expect(container.querySelector('.storage-alert')).toBeNull();
		expect(container.textContent).not.toContain('NaN');
		expect(container.textContent).not.toContain('0 GB / 0 GB');
	});

	it('shows no figures, no bar and no alert when the request fails', async () => {
		serve(json(500, { detail: 'boom' }));
		const { container } = render(ConfigPage);
		const row = await usageRow(container);
		expect(row.textContent?.trim()).toBe('—');
		expect(container.querySelector('.storage-bar-fill')).toBeNull();
		expect(container.querySelector('.storage-alert')).toBeNull();
		expect(container.textContent).not.toContain('NaN');
		expect(container.textContent).not.toContain('0 GB / 0 GB');
	});
});

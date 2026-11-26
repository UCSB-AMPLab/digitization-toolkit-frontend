// `/welcome` leads to the first-run wizard, which decides between itself and
// the login page.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import Page from './+page.svelte';

describe('/welcome', () => {
	it('replaces itself with /setup', async () => {
		render(Page);
		await expect.poll(() => gotoMock.mock.calls[0]).toEqual(['/setup', { replaceState: true }]);
	});
});

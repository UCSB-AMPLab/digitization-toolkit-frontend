// "Digitalizaciones en curso" while the unit hides projects (NEH-313): no
// project column, no project name on the cards, and no link to a project
// page; with projects shown, or the unit's state not read, the project
// column and its link stay.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { activityApi, type Collection, type Project } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { keepUnitState, resetUnit } from '$lib/unit-mode';
import InProgress from './InProgress.svelte';

const VIEW_KEY = 'captua_dashboard_in_progress_view';
const projects: Project[] = [{ id: 1, name: 'Fondo Rionegro' } as Project];
const collections: Collection[] = [
	{ id: 1, name: 'Tomo 1', project_id: 1, created_at: '2026-01-01T00:00:00', last_activity_at: '2026-10-22T10:00:00' }
];

function unit(projectsShown: boolean) {
	return { mode: projectsShown ? 'offline' : 'backup', projectsEnabled: projectsShown, projectsShown, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

beforeEach(() => {
	locale.set('es');
	localStorage.removeItem(VIEW_KEY);
	vi.spyOn(activityApi, 'collections').mockResolvedValue([
		{ collection_id: 1, status_counts: { captured: 3, in_review: 0, rejected: 0, approved: 0, excluded: 0 }, record_count: 3, last_status_change_at: '2026-10-22T10:00:00' }
	]);
});
afterEach(() => {
	vi.restoreAllMocks();
	localStorage.removeItem(VIEW_KEY);
	resetUnit();
});

describe('InProgress and hidden projects', () => {
	it('shows no project, in the table or on the board, while projects are hidden', async () => {
		keepUnitState(unit(false));
		const screen = render(InProgress, { collections, projects });
		await expect.element(page.getByText('Tomo 1').first()).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('Fondo Rionegro');
		expect(screen.container.querySelector('a[href^="/dashboard/projects/1"]:not([href*="/collections/"])')).toBeNull();
		expect(page.getByText(es.dash_col_project, { exact: true }).elements()).toHaveLength(0);
		await userEvent.click(page.getByRole('button', { name: es.dash_view_board }));
		await expect.element(page.getByRole('article').first()).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('Fondo Rionegro');
	});

	it('keeps the project column and its link while projects are shown', async () => {
		keepUnitState(unit(true));
		const screen = render(InProgress, { collections, projects });
		await expect.element(page.getByText('Fondo Rionegro')).toBeInTheDocument();
		expect(screen.container.querySelector('a[href="/dashboard/projects/1"]')).not.toBeNull();
	});
});

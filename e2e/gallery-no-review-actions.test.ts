// NEH-210: Gallery view must never expose approve/reject — quality review
// requires viewing the image at full size (Book view), which a thumbnail
// grid/list doesn't guarantee. This runs against a real backend (docker
// compose stack — see README/CLAUDE.md), the same
// create-then-delete-throwaway-fixtures pattern as book-view-approve-reject.
//
// Requires an admin- or reviewer-role account to already exist in the
// target backend. Configure via env vars (falls back to the throwaway
// `e2e_neh210` account provisioned in this dev environment):
//   E2E_USERNAME, E2E_PASSWORD
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.PUBLIC_API_BASE ?? 'http://localhost:8000';
const E2E_USERNAME = process.env.E2E_USERNAME ?? 'e2e_neh210';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';

// 1x1 px JPEG, just enough for the backend's image-upload validation.
const TINY_JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AL+n/9k=',
	'base64'
);

interface SetupResult {
	token: string;
	projectId: number;
	collectionId: number;
}

async function login(request: APIRequestContext): Promise<string> {
	const resp = await request.post(`${API_BASE}/auth/login`, {
		data: { username: E2E_USERNAME, password: E2E_PASSWORD }
	});
	if (!resp.ok()) {
		throw new Error(
			`E2E login failed (${resp.status()}). Set E2E_USERNAME/E2E_PASSWORD to a valid admin/reviewer account. Body: ${await resp.text()}`
		);
	}
	const { access_token } = await resp.json();
	return access_token as string;
}

async function setup(request: APIRequestContext): Promise<SetupResult> {
	const token = await login(request);
	const authHeaders = { Authorization: `Bearer ${token}` };
	const suffix = Date.now();

	const projResp = await request.post(`${API_BASE}/projects/`, {
		headers: authHeaders,
		data: { name: `NEH-210 e2e ${suffix}` }
	});
	expect(projResp.ok(), await projResp.text()).toBeTruthy();
	const project = await projResp.json();

	const colResp = await request.post(`${API_BASE}/collections/`, {
		headers: authHeaders,
		data: { name: `Gallery ${suffix}`, project_id: project.id }
	});
	expect(colResp.ok(), await colResp.text()).toBeTruthy();
	const collection = await colResp.json();

	// A couple of records with images so the grid/list actually render cards.
	for (const title of ['Record A', 'Record B']) {
		const recResp = await request.post(`${API_BASE}/records/`, {
			headers: authHeaders,
			data: { title, collection_id: collection.id, capture_mode: 'single' }
		});
		expect(recResp.ok(), await recResp.text()).toBeTruthy();
		const record = await recResp.json();

		const imgResp = await request.post(`${API_BASE}/records/${record.id}/images?role=single`, {
			headers: authHeaders,
			multipart: { file: { name: 'single.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } }
		});
		expect(imgResp.ok(), await imgResp.text()).toBeTruthy();
	}

	return { token, projectId: project.id, collectionId: collection.id };
}

async function teardown(request: APIRequestContext, token: string, projectId: number) {
	// Neither DELETE /projects/{id} nor DELETE /collections/{id} cascade —
	// both 409 on anything non-empty — so records must go first, then
	// collections, then the project itself.
	const authHeaders = { Authorization: `Bearer ${token}` };

	const colsResp = await request.get(`${API_BASE}/collections/?project_id=${projectId}`, {
		headers: authHeaders
	});
	const collections = await colsResp.json();

	for (const collection of collections) {
		const recsResp = await request.get(`${API_BASE}/records/?collection_id=${collection.id}`, {
			headers: authHeaders
		});
		const records = await recsResp.json();
		for (const record of records) {
			await request.delete(`${API_BASE}/records/${record.id}`, { headers: authHeaders });
		}
		await request.delete(`${API_BASE}/collections/${collection.id}`, { headers: authHeaders });
	}

	await request.delete(`${API_BASE}/projects/${projectId}`, { headers: authHeaders });
}

async function openGallery(page: Page, ctx: SetupResult) {
	await page.addInitScript(
		([token, user]) => {
			localStorage.setItem('access_token', token as string);
			localStorage.setItem('auth_user', user as string);
		},
		[ctx.token, JSON.stringify({ id: 0, username: E2E_USERNAME, email: 'e2e@example.com', role: 'admin', is_active: true })]
	);
	await page.goto(`/dashboard/projects/${ctx.projectId}/collections/${ctx.collectionId}`);
}

// No approve/reject button, no checkbox, and no bulk action bar — in any
// view mode, in any state (default, after opening filters, after clicking
// a card, after toggling reorder mode).
async function expectNoReviewActions(page: Page) {
	await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Rechazar' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toHaveCount(0);
	await expect(page.locator('.action-bar')).toHaveCount(0);
	await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
	await expect(page.locator('.selectable-overlay, .selectable-check')).toHaveCount(0);
}

test.describe('Gallery — no review actions (NEH-210)', () => {
	let ctx: SetupResult;

	test.beforeAll(async ({ request }) => {
		ctx = await setup(request);
	});

	test.afterAll(async ({ request }) => {
		await teardown(request, ctx.token, ctx.projectId);
	});

	test('list view: no approve/reject/select control, and clicking a row navigates to Book view instead of selecting it', async ({ page }) => {
		await openGallery(page, ctx);
		await expect(page.getByText('Record A')).toBeVisible();
		await expectNoReviewActions(page);

		await page.getByText('Record A').click();
		// Clicking a row opens Book view (spread, identified by its rotate
		// controls) — it never toggles a selection state that could feed a
		// bulk review action.
		await expect(page.getByRole('button', { name: 'Vista libro abierto' })).toHaveClass(/active/);
		await expectNoReviewActions(page);
	});

	test('grid view: toolbar keeps Filtros/Renumerar/Reordenar/columns, but no approve/reject control anywhere', async ({ page }) => {
		await openGallery(page, ctx);
		await page.getByTitle('Vista cuadrícula').click();

		await expect(page.getByRole('button', { name: 'Filtros' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Renumerar' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Reordenar' })).toBeVisible();
		await expect(page.locator('.columns-slider')).toBeVisible();
		await expectNoReviewActions(page);

		// Opening the status filter panel still only filters — no action leaks in.
		await page.getByRole('button', { name: 'Filtros' }).click();
		await expect(page.getByRole('button', { name: 'Aprobado' })).toBeVisible();
		await expectNoReviewActions(page);

		// Clicking a card does nothing review-related (no select-to-approve).
		await page.locator('.grid-card').first().click();
		await expectNoReviewActions(page);

		// Reorder mode is a pure drag-and-drop affordance, not a review action.
		await page.getByRole('button', { name: 'Reordenar' }).click();
		await expect(page.getByRole('button', { name: 'Listo' })).toBeVisible();
		await expectNoReviewActions(page);
	});
});

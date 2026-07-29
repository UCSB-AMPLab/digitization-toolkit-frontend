// NEH-209: Approve/Reject from Book view, end to end against a real
// running backend (docker compose stack — see README/CLAUDE.md for how to
// start it). Test data (project/collection/records/images) is created and
// torn down via direct API calls in beforeAll/afterAll, the same
// create-then-delete-throwaway-fixtures pattern used elsewhere in this
// project's manual verification passes — there's no seed/fixture script in
// this repo yet.
//
// Requires an admin- or reviewer-role account to already exist in the
// target backend. Configure via env vars (falls back to the throwaway
// `e2e_neh209` account provisioned in this dev environment):
//   E2E_USERNAME, E2E_PASSWORD
import { test, expect, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.PUBLIC_API_BASE ?? 'http://localhost:8000';
const E2E_USERNAME = process.env.E2E_USERNAME ?? 'e2e_neh209';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';

// 1x1 px JPEG, just enough for the backend's image-upload validation.
const TINY_JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AL+n/9k=',
	'base64'
);

interface SetupResult {
	token: string;
	projectId: number;
	dualCollectionId: number;
	singleCollectionId: number;
	dualRecordId: number;
	singleRecordId: number;
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

async function createRecordWithImages(
	request: APIRequestContext,
	token: string,
	collectionId: number,
	title: string,
	captureMode: 'single' | 'dual'
): Promise<number> {
	const authHeaders = { Authorization: `Bearer ${token}` };

	const recResp = await request.post(`${API_BASE}/records/`, {
		headers: authHeaders,
		data: { title, collection_id: collectionId, capture_mode: captureMode }
	});
	expect(recResp.ok(), await recResp.text()).toBeTruthy();
	const record = await recResp.json();

	const roles = captureMode === 'dual' ? ['left', 'right'] : ['single'];
	for (const role of roles) {
		// `role` is a query param on this endpoint, not a multipart field
		// (it isn't declared with FastAPI's Form()) — sending it as form
		// data gets silently ignored and every image ends up with role=null.
		const imgResp = await request.post(
			`${API_BASE}/records/${record.id}/images?role=${role}`,
			{
				headers: authHeaders,
				multipart: {
					file: { name: `${role}.jpg`, mimeType: 'image/jpeg', buffer: TINY_JPEG }
				}
			}
		);
		expect(imgResp.ok(), await imgResp.text()).toBeTruthy();
	}

	return record.id as number;
}

async function setup(request: APIRequestContext): Promise<SetupResult> {
	const token = await login(request);
	const authHeaders = { Authorization: `Bearer ${token}` };
	const suffix = Date.now();

	const projResp = await request.post(`${API_BASE}/projects/`, {
		headers: authHeaders,
		data: { name: `NEH-209 e2e ${suffix}` }
	});
	expect(projResp.ok(), await projResp.text()).toBeTruthy();
	const project = await projResp.json();

	const dualColResp = await request.post(`${API_BASE}/collections/`, {
		headers: authHeaders,
		data: { name: `Dual ${suffix}`, project_id: project.id }
	});
	expect(dualColResp.ok(), await dualColResp.text()).toBeTruthy();
	const dualCollection = await dualColResp.json();

	const singleColResp = await request.post(`${API_BASE}/collections/`, {
		headers: authHeaders,
		data: { name: `Single ${suffix}`, project_id: project.id }
	});
	expect(singleColResp.ok(), await singleColResp.text()).toBeTruthy();
	const singleCollection = await singleColResp.json();

	const dualRecordId = await createRecordWithImages(
		request,
		token,
		dualCollection.id,
		'Dual-mode document',
		'dual'
	);
	const singleRecordId = await createRecordWithImages(
		request,
		token,
		singleCollection.id,
		'Single-mode document',
		'single'
	);

	return {
		token,
		projectId: project.id,
		dualCollectionId: dualCollection.id,
		singleCollectionId: singleCollection.id,
		dualRecordId,
		singleRecordId
	};
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

async function openBookView(page: import('@playwright/test').Page, ctx: SetupResult, collectionId: number) {
	await page.addInitScript(
		([token, user]) => {
			localStorage.setItem('access_token', token as string);
			localStorage.setItem('auth_user', user as string);
		},
		[ctx.token, JSON.stringify({ id: 0, username: E2E_USERNAME, email: 'e2e@example.com', role: 'admin', is_active: true })]
	);
	await page.goto(`/dashboard/projects/${ctx.projectId}/collections/${collectionId}`);
	// Switch to Book view (spread).
	await page.getByTitle('Vista libro').click();
	// Approve/Reject live in the left panel's "Anotaciones" tab (NEH-209
	// correction) — collapsed by default, open it.
	await page.getByRole('button', { name: 'Anotaciones' }).click();
	// Wait for the panel to actually be interactive before any test starts
	// clicking inside it — avoids a race where a click lands before the
	// tab's content has finished rendering.
	await expect(page.getByText('Motivo del rechazo (obligatorio):')).toBeVisible();
}

// Taps each given reason chip (always visible, no dropdown to open) and
// asserts it registers as selected before moving on, then saves it as one
// annotation via "Guardar" — "Rechazar" depends on a SAVED error annotation
// existing, not on the live chip selection.
async function flagErrors(page: import('@playwright/test').Page, labels: string[], comment?: string) {
	for (const label of labels) {
		const chip = page.getByRole('button', { name: label, exact: true });
		await expect(chip).toBeVisible();
		await chip.click();
		await expect(chip).toHaveClass(/selected/);
	}
	if (comment) {
		await page.getByPlaceholder('Agrega un comentario (opcional)...').fill(comment);
	}
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
}

test.describe('Book view — approve/reject (NEH-209)', () => {
	let ctx: SetupResult;

	test.beforeAll(async ({ request }) => {
		ctx = await setup(request);
	});

	test.afterAll(async ({ request }) => {
		await teardown(request, ctx.token, ctx.projectId);
	});

	test('dual-camera document: reject shows both images pending recapture', async ({ page }) => {
		await openBookView(page, ctx, ctx.dualCollectionId);

		await flagErrors(page, ['Imagen Borrosa']);
		await page.getByRole('button', { name: 'Rechazar' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect(page.locator('.pending-recapture-badge')).toHaveCount(2);
	});

	test('single-camera document: reject shows exactly one image pending recapture', async ({ page }) => {
		await openBookView(page, ctx, ctx.singleCollectionId);

		await flagErrors(page, ['Imagen Borrosa']);
		await page.getByRole('button', { name: 'Rechazar' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect(page.locator('.pending-recapture-badge')).toHaveCount(1);
	});

	test('approve reflects immediately without a page reload, and shows the "Aprobada" tag', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `Approve ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		await createRecordWithImages(request, ctx.token, collection.id, 'Approve-me document', 'single');

		await openBookView(page, ctx, collection.id);

		await page.getByRole('button', { name: 'Aprobar' }).click();
		await expect(page.getByText('¿Confirmas que quieres aprobar esta imagen?')).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect(page.getByText(/pendiente de recaptura/)).toHaveCount(0);
		await expect(page.locator('.approved-badge')).toHaveCount(1);
		await expect(page.getByText('Aprobada')).toBeVisible();
		// No navigation happened — still on the same collection URL.
		await expect(page).toHaveURL(new RegExp(`/collections/${collection.id}$`));
	});

	test('undo: approving then rejecting-to-undo brings the record back to in_review, fully interactive again', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `Undo ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		const recordId = await createRecordWithImages(request, ctx.token, collection.id, 'Undo document', 'single');

		await openBookView(page, ctx, collection.id);

		// Approve it.
		await page.getByRole('button', { name: 'Aprobar' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
		await expect(page.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Rechazar' })).toBeEnabled();

		// Undo the approval: Rechazar on an approved record reverts to
		// in_review (no reason required) instead of a formal rejection.
		await page.getByRole('button', { name: 'Rechazar' }).click();
		await expect(page.getByText('¿Confirmas que quieres deshacer la aprobación de esta imagen?')).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect(page.locator('.approved-badge')).toHaveCount(0);
		const statusResp = await request.get(`${API_BASE}/records/${recordId}`, {
			headers: { Authorization: `Bearer ${ctx.token}` }
		});
		expect((await statusResp.json()).status).toBe('in_review');

		// Back to fully interactive: both buttons available again (Rechazar
		// still needs a reason picked).
		await expect(page.getByRole('button', { name: 'Aprobar' })).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
	});

	test('undo: rejecting then approving-to-undo brings the record back to in_review', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `Undo2 ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		const recordId = await createRecordWithImages(request, ctx.token, collection.id, 'Undo2 document', 'single');

		await openBookView(page, ctx, collection.id);

		// Reject it.
		await flagErrors(page, ['Imagen Borrosa']);
		await page.getByRole('button', { name: 'Rechazar' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
		await expect(page.getByRole('button', { name: 'Rechazar' })).toBeDisabled();

		// Undo the rejection: Aprobar on a rejected record reverts to
		// in_review instead of jumping straight to approved.
		await page.getByRole('button', { name: 'Aprobar' }).click();
		await expect(page.getByText('¿Confirmas que quieres deshacer el rechazo de esta imagen?')).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect(page.locator('.pending-recapture-badge')).toHaveCount(0);
		const statusResp = await request.get(`${API_BASE}/records/${recordId}`, {
			headers: { Authorization: `Bearer ${ctx.token}` }
		});
		expect((await statusResp.json()).status).toBe('in_review');
	});

	test('cancelling the confirm popup performs no action', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `Cancel ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		const recordId = await createRecordWithImages(request, ctx.token, collection.id, 'Cancel document', 'single');

		await openBookView(page, ctx, collection.id);

		await page.getByRole('button', { name: 'Aprobar' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();

		await expect(page.getByText('¿Confirmas que quieres aprobar esta imagen?')).toHaveCount(0);
		const statusResp = await request.get(`${API_BASE}/records/${recordId}`, {
			headers: { Authorization: `Bearer ${ctx.token}` }
		});
		expect((await statusResp.json()).status).toBe('in_review');
	});

	test('multi-select reasons + note save as ONE annotation with both tags visible in the Anotaciones list', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `MultiTag ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		await createRecordWithImages(request, ctx.token, collection.id, 'MultiTag document', 'single');

		await openBookView(page, ctx, collection.id);

		await flagErrors(page, ['Imagen Borrosa', 'Reflejo/Brillo'], 'dos motivos a la vez');

		await expect(page.getByText('dos motivos a la vez')).toBeVisible();
		const card = page.locator('.annotation-card', { hasText: 'dos motivos a la vez' });
		await expect(card.getByText('Imagen Borrosa')).toBeVisible();
		await expect(card.getByText('Reflejo/Brillo')).toBeVisible();
	});

	test('rejecting with multiple reasons selected sends only the FIRST one to the backend', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `FirstReason ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		const recordId = await createRecordWithImages(request, ctx.token, collection.id, 'FirstReason document', 'single');

		await openBookView(page, ctx, collection.id);

		// Pick "Reflejo/Brillo" (glare) first, then "Imagen Borrosa" (blur) —
		// saved as one annotation, so the reject sends the first of the two.
		await flagErrors(page, ['Reflejo/Brillo', 'Imagen Borrosa']);
		await page.getByRole('button', { name: 'Rechazar' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect(page.locator('.pending-recapture-badge')).toHaveCount(1);
		const rejectionsResp = await request.get(`${API_BASE}/records/${recordId}/rejections`, {
			headers: { Authorization: `Bearer ${ctx.token}` }
		});
		const rejections = await rejectionsResp.json();
		expect(rejections[0].predefined_reason).toBe('glare');
	});

	test('"Recapturar imagen" on a rejected record navigates to live-preview with the record id', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `Recapture ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		const recordId = await createRecordWithImages(request, ctx.token, collection.id, 'Recapture document', 'single');
		await request.post(`${API_BASE}/records/${recordId}/reject`, {
			headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
			data: { predefined_reason: 'blur' }
		});

		await openBookView(page, ctx, collection.id);

		await expect(page.getByRole('button', { name: 'Rechazar' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Recapturar imagen' }).click();

		await expect(page).toHaveURL(new RegExp(`/live-preview\\?projectId=${ctx.projectId}&collectionId=${collection.id}&recordId=${recordId}$`));
	});

	test('regression: the old isolated rejection-comment modal never appears, and all 6 reason chips are visible with no dropdown to open', async ({ page, request }) => {
		const colResp = await request.post(`${API_BASE}/collections/`, {
			headers: { Authorization: `Bearer ${ctx.token}` },
			data: { name: `Regression ${Date.now()}`, project_id: ctx.projectId }
		});
		const collection = await colResp.json();
		await createRecordWithImages(request, ctx.token, collection.id, 'Regression-check document', 'single');

		await openBookView(page, ctx, collection.id);

		// The removed ActionBar modal used to render as a dialog with this
		// heading and a plain textarea with no reason picker.
		await expect(page.getByText('Rechazar registros')).toHaveCount(0);
		await expect(page.getByPlaceholder('Describe el motivo del rechazo…')).toHaveCount(0);
		// All 6 reason chips render immediately, no dropdown/listbox involved.
		await expect(page.getByRole('button', { name: 'Imagen Borrosa', exact: true })).toBeVisible();
		await expect(page.getByRole('listbox')).toHaveCount(0);
		// Rechazar/Aprobar are inline in the panel, no dialog/modal involved
		// until a click actually requests confirmation.
		await expect(page.locator('[role="dialog"]')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Rechazar' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Aprobar' })).toBeVisible();
	});
});

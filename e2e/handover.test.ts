// NEH-260: an operator sends a volume for review and takes it back through
// the volume's top bar, end to end against a running backend. The
// review spec hands its fixtures over through the API; this one goes
// through the screen.
//
// Same requirements as book-view-approve-reject.test.ts: an admin account
// in the target backend (E2E_USERNAME, E2E_PASSWORD), since the controls
// are offered to operators and admins.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.PUBLIC_API_BASE ?? 'http://localhost:8000';
const E2E_USERNAME = process.env.E2E_USERNAME ?? 'e2e_neh209';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'E2ePassword123!';

// 1x1 px JPEG, just enough for the backend's image-upload validation.
const TINY_JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AL+n/9k=',
	'base64'
);

interface Ctx {
	token: string;
	projectId: number;
	readyCollectionId: number;
	readyRecordIds: number[];
	blockedCollectionId: number;
	blockedRecordId: number;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(request: APIRequestContext): Promise<string> {
	const resp = await request.post(`${API_BASE}/auth/login`, {
		data: { username: E2E_USERNAME, password: E2E_PASSWORD }
	});
	if (!resp.ok()) {
		throw new Error(`E2E login failed (${resp.status()}). Set E2E_USERNAME/E2E_PASSWORD to a valid admin account.`);
	}
	return (await resp.json()).access_token as string;
}

async function post<T>(request: APIRequestContext, token: string, path: string, data: unknown): Promise<T> {
	const resp = await request.post(`${API_BASE}${path}`, { headers: auth(token), data });
	expect(resp.ok(), await resp.text()).toBeTruthy();
	return (await resp.json()) as T;
}

// A captured record, left captured: nothing here promotes.
async function createRecord(request: APIRequestContext, token: string, collectionId: number, title: string, withImage: boolean) {
	const record = await post<{ id: number }>(request, token, '/records/', {
		title,
		collection_id: collectionId,
		capture_mode: 'single'
	});
	if (withImage) {
		const imgResp = await request.post(`${API_BASE}/records/${record.id}/images?role=single`, {
			headers: auth(token),
			multipart: { file: { name: 'single.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG } }
		});
		expect(imgResp.ok(), await imgResp.text()).toBeTruthy();
	}
	return record.id;
}

async function statuses(request: APIRequestContext, token: string, collectionId: number): Promise<string[]> {
	const resp = await request.get(`${API_BASE}/records/?collection_id=${collectionId}`, { headers: auth(token) });
	expect(resp.ok()).toBeTruthy();
	return ((await resp.json()) as { status: string }[]).map((r) => r.status);
}

async function setup(request: APIRequestContext): Promise<Ctx> {
	const token = await login(request);
	const suffix = Date.now();
	const project = await post<{ id: number }>(request, token, '/projects/', { name: `NEH-260 handover e2e ${suffix}` });
	const ready = await post<{ id: number }>(request, token, '/collections/', { name: `Ready ${suffix}`, project_id: project.id });
	const blocked = await post<{ id: number }>(request, token, '/collections/', { name: `Blocked ${suffix}`, project_id: project.id });
	const readyRecordIds = [
		await createRecord(request, token, ready.id, 'Folio 1', true),
		await createRecord(request, token, ready.id, 'Folio 2', true)
	];
	await createRecord(request, token, blocked.id, 'Folio con imagen', true);
	const blockedRecordId = await createRecord(request, token, blocked.id, 'Folio sin imagen', false);
	return {
		token,
		projectId: project.id,
		readyCollectionId: ready.id,
		readyRecordIds,
		blockedCollectionId: blocked.id,
		blockedRecordId
	};
}

async function teardown(request: APIRequestContext, token: string, projectId: number) {
	// Nothing cascades: records, then collections, then the project. The
	// account is an admin, so records in review can be deleted too.
	const cols = await (await request.get(`${API_BASE}/collections/?project_id=${projectId}`, { headers: auth(token) })).json();
	for (const col of cols) {
		const recs = await (await request.get(`${API_BASE}/records/?collection_id=${col.id}`, { headers: auth(token) })).json();
		for (const r of recs) await request.delete(`${API_BASE}/records/${r.id}`, { headers: auth(token) });
		await request.delete(`${API_BASE}/collections/${col.id}`, { headers: auth(token) });
	}
	await request.delete(`${API_BASE}/projects/${projectId}`, { headers: auth(token) });
}

async function openVolume(page: Page, ctx: Ctx, collectionId: number) {
	await page.addInitScript(
		([token, user]) => {
			localStorage.setItem('access_token', token as string);
			localStorage.setItem('auth_user', user as string);
		},
		[ctx.token, JSON.stringify({ id: 0, username: E2E_USERNAME, email: 'e2e@example.com', role: 'admin', is_active: true })]
	);
	await page.goto(`/dashboard/projects/${ctx.projectId}/collections/${collectionId}`);
}

test.describe('Volume top bar — send for review and take back (NEH-260)', () => {
	let ctx: Ctx;

	test.beforeAll(async ({ request }) => {
		ctx = await setup(request);
	});

	test.afterAll(async ({ request }) => {
		await teardown(request, ctx.token, ctx.projectId);
	});

	test('send the volume, then take it back', async ({ page, request }) => {
		await openVolume(page, ctx, ctx.readyCollectionId);

		// The controls are mounted only after the records have loaded, on
		// the client, so a visible button is already hydrated.
		await page.getByRole('button', { name: 'Enviar a revisión' }).click();
		const confirm = page.getByRole('dialog');
		await expect(confirm.getByText('Los 2 registros capturados quedarán en revisión.', { exact: false })).toBeVisible();
		await confirm.getByRole('button', { name: 'Enviar', exact: true }).click();

		await expect(page.getByRole('status')).toHaveText('Se enviaron 2 registros a revisión.');
		expect(await statuses(request, ctx.token, ctx.readyCollectionId)).toEqual(['in_review', 'in_review']);
		await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeHidden();

		await page.getByRole('button', { name: 'Retirar de revisión' }).click();
		const takeBack = page.getByRole('dialog');
		await expect(takeBack.getByText('Los 2 registros en revisión quedarán otra vez en estado Capturado', { exact: false })).toBeVisible();
		await takeBack.getByRole('button', { name: 'Retirar', exact: true }).click();

		await expect(page.getByRole('status')).toHaveText('Se retiraron 2 registros de revisión.');
		expect(await statuses(request, ctx.token, ctx.readyCollectionId)).toEqual(['captured', 'captured']);
		await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible();
	});

	test('a record without an image blocks the send, and nothing changes', async ({ page, request }) => {
		await openVolume(page, ctx, ctx.blockedCollectionId);

		await page.getByRole('button', { name: 'Enviar a revisión' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Enviar', exact: true }).click();

		const refusal = page.getByRole('dialog');
		await expect(refusal.getByText('No se pudo enviar el volumen')).toBeVisible();
		await expect(refusal.getByText('Hay un registro que todavía no se puede enviar', { exact: false })).toBeVisible();
		await expect(refusal.getByText('Folio sin imagen')).toBeVisible();
		await expect(refusal.getByText('Folio con imagen')).toBeHidden();
		expect(await statuses(request, ctx.token, ctx.blockedCollectionId)).toEqual(['captured', 'captured']);
	});
});

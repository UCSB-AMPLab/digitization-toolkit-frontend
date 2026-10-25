// The volume's Fisqua line, under the offsite copy line of the volume view's
// top bar: read from the same GET /collections/{id}/offsite poll, with no
// request of its own. Fixtures are shaped as volume_fisqua_state in
// app/core/fisqua_outbox.py. The catalogue is the default one, Spanish.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, systemApi, type VolumeFisquaState, type VolumeOffsiteState } from '$lib/api';
import { es } from '$lib/i18n/es';
import VolumeOffsiteIndicator from './VolumeOffsiteIndicator.svelte';

const MID = '7f0c1f9e-2b1a-4f3e-9a51-3d1f0a2b9c11';

function offsite(fisqua: VolumeFisquaState | null): VolumeOffsiteState {
	return {
		collection_id: 7,
		filename_stem: 'co-ahrb-aht-003',
		uploadable: true,
		total: 10,
		verified: 10,
		pending: 0,
		refused: 0,
		last_verified_at: null,
		received: true,
		refusals: [],
		freed_files: 0,
		freed_bytes: 0,
		fisqua
	};
}

function entry(over: Record<string, unknown> = {}) {
	return {
		manifest_id: MID,
		stem: 'co-ahrb-aht-003',
		state: 'delivered',
		created_at: '2026-10-24T14:30:00',
		attempts: 1,
		next_attempt_at: null,
		last_attempt_at: '2026-10-24T14:31:00',
		last_error: null,
		refusal: null,
		problems: null,
		response: { manifestId: MID, volumeId: 'fq-1' },
		external_id: 'fq-1',
		delivered_at: '2026-10-24T14:31:00',
		...over
	};
}

function fisqua(over: Partial<VolumeFisquaState> = {}): VolumeFisquaState {
	return { environment: 'production', config_error: null, outbox: [entry()], status: null, ...over };
}

let offsiteSpy: ReturnType<typeof vi.spyOn>;

function answer(state: VolumeOffsiteState) {
	offsiteSpy = vi.spyOn(collectionsApi, 'getOffsiteState').mockResolvedValue(state);
}

beforeEach(() => {
	vi.spyOn(systemApi, 'getCatalogueBackup').mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
	vi.restoreAllMocks();
});

async function shown(state: VolumeOffsiteState) {
	answer(state);
	const screen = render(VolumeOffsiteIndicator, { collectionId: 7 });
	await expect.poll(() => screen.container.querySelector('.offsite-indicator')).not.toBeNull();
	return screen;
}

describe('VolumeFisquaLine', () => {
	it('renders nothing when the unit has no Fisqua configured', async () => {
		const screen = await shown(offsite(null));
		expect(screen.container.querySelector('[data-fisqua]')).toBeNull();
	});

	it("shows Fisqua's status with a chip in the offsite line's style, from the same request", async () => {
		const screen = await shown(
			offsite(fisqua({ status: { status: 'published', status_at: null, status_checked_at: '2026-10-24T15:00:00', problems: null, manifest_id: MID } }))
		);
		const line = screen.container.querySelector('[data-fisqua]') as HTMLElement;
		expect(line).not.toBeNull();
		expect(line.dataset.kind).toBe('status_published');
		expect(line.classList.contains('offsite-indicator')).toBe(true);
		expect(line.classList.contains('fisqua-ok')).toBe(true);
		expect(line.textContent).toContain(es.fisqua_st_published);
		expect(offsiteSpy).toHaveBeenCalledTimes(1);
	});

	it.each([
		['retakes_requested', 'fisqua-attention', 'fisqua_st_retakes_requested'],
		['approved', 'fisqua-ok', 'fisqua_st_approved'],
		['preparing_review', 'fisqua-progress', 'fisqua_st_preparing_review'],
		['in_capture_qc', 'fisqua-progress', 'fisqua_st_in_capture_qc']
	] as const)("shows Fisqua's status %s with the %s style", async (st, cls, key) => {
		const screen = await shown(
			offsite(fisqua({ status: { status: st, status_at: null, status_checked_at: '2026-10-24T15:00:00', problems: null, manifest_id: MID } }))
		);
		const line = screen.container.querySelector('[data-fisqua]') as HTMLElement;
		expect(line.classList.contains(cls)).toBe(true);
		expect(line.textContent).toContain(es[key]);
	});

	it('shows a waiting manifest', async () => {
		const screen = await shown(offsite(fisqua({ outbox: [entry({ state: 'waiting_for_upload', attempts: 0, delivered_at: null, response: null, external_id: null })] })));
		expect(screen.container.querySelector('[data-fisqua]')!.textContent).toContain(es.fisqua_out_waiting);
	});

	it("lists a refusal's problems", async () => {
		const problems = [
			{ rule: 'reference_code_differs', message: 'The reference code differs from the stem', record_ids: [], image_ids: [] },
			{ rule: 'sequence_missing', message: 'x', record_ids: [3], image_ids: [] }
		];
		const screen = await shown(
			offsite(fisqua({ outbox: [entry({ state: 'refused', refusal: 'not_exportable', problems, attempts: 0, delivered_at: null, response: null, external_id: null })] }))
		);
		const items = [...screen.container.querySelectorAll('.fisqua-problems li')].map((li) => li.textContent ?? '');
		expect(items).toHaveLength(2);
		expect(items[0]).toContain(es.col_manifest_rule_reference_code_differs);
		expect(items[1]).toContain(es.col_manifest_rule_sequence_missing);
		expect(items[1]).toContain(es.col_manifest_records([3]));
		expect(screen.container.querySelector('.fisqua-problems summary')!.textContent).toContain(es.fisqua_problems(2));
	});

	it("marks Fisqua's own problems as Fisqua's", async () => {
		const problems = [{ rule: 'run-started', message: 'A run has started on the older manifest.' }];
		const screen = await shown(offsite(fisqua({ outbox: [entry({ state: 'refused', refusal: 'fisqua', problems, delivered_at: null })] })));
		const item = screen.container.querySelector('.fisqua-problems li') as HTMLElement;
		expect(item.textContent).toContain(es.fisqua_problem_from_fisqua('A run has started on the older manifest.'));
		expect(item.dataset.source).toBe('fisqua');
		expect(screen.container.querySelector('[data-incident]')).toBeNull();
	});

	it("shows Fisqua's object-missing refusal as an incident listing each key", async () => {
		const problems = [
			{ rule: 'object-missing', message: 'x', key: 'rionegro/co-x/co-x_0001_L.jpg', captureId: 'cap-1', role: 'left' },
			{ rule: 'object-missing', message: 'x', key: 'rionegro/co-x/co-x_0001_R.jpg', captureId: 'cap-1', role: 'right' }
		];
		const screen = await shown(offsite(fisqua({ outbox: [entry({ state: 'refused', refusal: 'fisqua', problems, delivered_at: null })] })));
		const incident = screen.container.querySelector('[data-incident="object-missing"]') as HTMLElement;
		expect(incident).not.toBeNull();
		expect(incident.textContent).toContain(es.fisqua_incident_object_missing);
		const items = [...incident.querySelectorAll('li')].map((li) => li.textContent ?? '');
		expect(items).toHaveLength(2);
		expect(items[0]).toContain('rionegro/co-x/co-x_0001_L.jpg');
		expect(items[0]).toContain('cap-1');
		expect(items[0]).toContain(es.col_role_left);
		expect(items[1]).toContain(es.col_role_right);
		expect(screen.container.querySelector('[data-fisqua]')!.classList.contains('fisqua-attention')).toBe(true);
		expect(screen.container.querySelector('.fisqua-problems')).toBeNull();
	});

	it('warns that sending is stopped while Fisqua refuses the configuration', async () => {
		const screen = await shown(
			offsite(fisqua({ config_error: { at: '2026-10-24T09:30:00', status_code: 401, reason: 'token', config_fingerprint: 'ab12cd34' } }))
		);
		const warning = screen.container.querySelector('.fisqua-config-error') as HTMLElement;
		expect(warning).not.toBeNull();
		expect(warning.textContent).toContain(es.fisqua_cfg_token);
		expect(screen.container.querySelector('[data-fisqua]')!.classList.contains('fisqua-attention')).toBe(true);
	});

	it('keeps withdrawn manifests in the history only', async () => {
		const screen = await shown(offsite(fisqua({ outbox: [entry({ manifest_id: 'b2', state: 'withdrawn', delivered_at: null }), entry()] })));
		expect(screen.container.querySelector('[data-fisqua]')!.getAttribute('data-kind')).toBe('delivered');
		const history = [...screen.container.querySelectorAll('.fisqua-history li')].map((li) => li.textContent ?? '');
		expect(history).toHaveLength(1);
		expect(history[0]).toContain(es.fisqua_out_withdrawn);
	});
});

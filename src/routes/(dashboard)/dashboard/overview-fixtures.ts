// The Overview's states for its tests, as the approved mock-up draws them:
// all in order; with notices; with notices and nothing to free; one camera
// not answering; no camera; cameras of another kind; figures not loaded.
// `serveOverview` answers every call the page makes through the API
// objects, and every other request with a 500. Used by tests only.

import { vi } from 'vitest';
import {
	activityApi,
	cameraKindApi,
	camerasApi,
	collectionsApi,
	projectsApi,
	recordsApi,
	systemApi,
	type CameraDevice,
	type Collection,
	type RetakeSummary
} from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { writeUnit } from '$lib/unit-mode';

export type OverviewState =
	| 'ok'
	| 'notices'
	| 'storage0'
	| 'camera'
	| 'nocams'
	| 'kind'
	| 'figures'
	// Listed cameras the unit cannot capture with: one, or both.
	| 'unusable1'
	| 'unusable2';
export type OverviewRole = 'admin' | 'operator' | 'reviewer';

export const STATES: OverviewState[] = [
	'ok',
	'notices',
	'storage0',
	'camera',
	'nocams',
	'kind',
	'figures'
];
export const ROLES: OverviewRole[] = ['admin', 'operator', 'reviewer'];

const GIB = 1024 ** 3;

export function device(index: number, over: Partial<CameraDevice> = {}): CameraDevice {
	return {
		index,
		hardware_id: `hw${index}`,
		model: 'Canon PowerShot A2500',
		calibrated: false,
		role: null,
		role_confirmed: false,
		...over
	};
}

// The backend's reason for a body that cannot capture (the device list's `error`).
export const UNUSABLE = 'Two cameras report the odd pages.';

// Both cameras with the two confirmed roles: the rows read left and right.
export const BOTH = [
	device(0, { role: 'right', role_confirmed: true }),
	device(1, { role: 'left', role_confirmed: true })
];

export function storage(usedGB: number, totalGB: number) {
	return {
		projects_path: '/data/projects',
		is_override: false,
		override_invalid: false,
		total_bytes: totalGB * GIB,
		used_bytes: usedGB * GIB,
		free_bytes: (totalGB - usedGB) * GIB,
		available: true,
		unavailable_reason: null
	};
}

export function freeable(bytes: number, modeAllows = true) {
	return {
		volumes:
			bytes > 0
				? [
						{
							collection_id: 7,
							project_id: 1,
							name: 'Tomo 7',
							filename_stem: 'co-ej-t007',
							files: 10,
							bytes,
							unmeasured_files: 0
						}
					]
				: [],
		total: { volumes: bytes > 0 ? 1 : 0, files: bytes > 0 ? 10 : 0, bytes, unmeasured_files: 0 },
		mode_allows: modeAllows,
		restorable: true,
		jobs: []
	};
}

export const RETAKES: RetakeSummary = {
	pendingRecords: 23,
	volumes: [
		{
			collectionId: 12,
			projectId: 1,
			name: 'Notaría primera, tomo 12',
			filenameStem: 'co-ej-not-t012',
			pending: 17,
			total: 21,
			excluded: 0,
			firstPendingRecordId: 501,
			pendingRecordIds: Array.from({ length: 17 }, (_, i) => 501 + i)
		},
		{
			collectionId: 7,
			projectId: 1,
			name: 'Juzgado civil, legajo 7',
			filenameStem: 'co-ej-juz-l007',
			pending: 6,
			total: 8,
			excluded: 0,
			firstPendingRecordId: 601,
			pendingRecordIds: Array.from({ length: 6 }, (_, i) => 601 + i)
		}
	],
	turn: { state: 'recaptures', unlockedBy: null }
};

const NO_RETAKES: RetakeSummary = {
	pendingRecords: 0,
	volumes: [],
	turn: { state: 'free', unlockedBy: null }
};

export function volume(id: number, over: Partial<Collection> = {}): Collection {
	return {
		id,
		name: `Tomo ${id}`,
		project_id: 1,
		created_at: '2026-11-01T00:00:00',
		last_activity_at: `2026-11-${String(10 + id).padStart(2, '0')}T10:00:00`,
		archival_metadata: { signatura: `co-ej-t${String(id).padStart(3, '0')}` },
		...over
	};
}

export const VOLUMES: Collection[] = [
	volume(1),
	volume(2, { colour_card: { enabled: true, status: 'none' } as never }),
	volume(3, { colour_card: { enabled: true, status: 'skipped' } as never }),
	volume(4)
];

// GET /system/camera-kind: a unit set for Pi cameras with two Canon DSLRs.
export const KIND_MISMATCH = {
	configured: 'picamera2',
	source: 'detected',
	stored: null,
	pending_restart: false,
	connected: { picamera2: 0, gphoto2: 2, chdk: 0 },
	available: { picamera2: true, gphoto2: true, chdk: true },
	mixed: false,
	mismatch: true
};
const KIND_OK = {
	...KIND_MISMATCH,
	connected: { picamera2: 2, gphoto2: 0, chdk: 0 },
	mismatch: false
};

// 182 local days ending today, with captures on weekdays.
function daily() {
	const out = [];
	const today = new Date();
	for (let i = 181; i >= 0; i--) {
		const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
		const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const weekday = d.getDay() !== 0 && d.getDay() !== 6;
		out.push({
			date: iso,
			captured_images: weekday ? 40 + (i % 7) * 30 : 0,
			reviewed_records: weekday ? 10 : 0
		});
	}
	return out as never;
}

export const USERS: Record<OverviewRole, { id: number; username: string }> = {
	admin: { id: 1, username: 'admin' },
	operator: { id: 2, username: 'operario' },
	reviewer: { id: 3, username: 'revisor' }
};

export function signIn(role: OverviewRole) {
	authStore.setSession({ ...USERS[role], email: null, role, is_active: true });
}

/** Projects hidden, as the mock-up draws the unit: two figures, a four-column table. */
export function hideProjects() {
	return writeUnit(async () => ({
		mode: 'backup',
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: 1,
		prerequisites: { backup: [], fisqua: [] }
	}));
}

export interface Served {
	listDevices: ReturnType<typeof vi.fn>;
	rescan: ReturnType<typeof vi.fn>;
	getFreeable: ReturnType<typeof vi.fn>;
	fetch: ReturnType<typeof vi.fn>;
}

/** Answer the page's calls for `state`; `over` replaces single answers. */
export function serveOverview(
	state: OverviewState,
	over: {
		devices?: CameraDevice[];
		rescan?: CameraDevice[];
		freeable?: unknown;
	} = {}
): Served {
	const notices = state === 'notices' || state === 'storage0';
	const devices =
		over.devices ??
		(state === 'camera'
			? [device(0)]
			: state === 'nocams' || state === 'kind'
				? []
				: state === 'unusable1'
					? [BOTH[0], { ...BOTH[1], error: UNUSABLE }]
					: state === 'unusable2'
						? BOTH.map((d) => ({ ...d, error: UNUSABLE }))
						: BOTH);
	const fetchSpy = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async () => new Response('{}', { status: 500 }));
	vi.spyOn(projectsApi, 'list').mockResolvedValue([
		{ id: 1, name: 'Proyecto', created_at: '2026-11-01T00:00:00' } as never
	]);
	if (state === 'figures') {
		vi.spyOn(collectionsApi, 'count').mockRejectedValue(new Error('down'));
		vi.spyOn(recordsApi, 'count').mockRejectedValue(new Error('down'));
	} else {
		vi.spyOn(collectionsApi, 'count').mockResolvedValue(38);
		vi.spyOn(recordsApi, 'count').mockResolvedValue(12480);
	}
	vi.spyOn(collectionsApi, 'listAll').mockResolvedValue(VOLUMES);
	vi.spyOn(activityApi, 'collections').mockResolvedValue(
		VOLUMES.map((v) => ({
			collection_id: v.id,
			status_counts: { captured: 5, rejected: 0, in_review: 0, approved: 0, excluded: 0 } as never,
			record_count: 5,
			last_status_change_at: null
		}))
	);
	vi.spyOn(activityApi, 'daily').mockResolvedValue(daily());
	vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(notices ? RETAKES : NO_RETAKES);
	vi.spyOn(systemApi, 'getStorage').mockResolvedValue(
		(notices ? storage(466, 507) : storage(200, 507)) as never
	);
	const getFreeable = vi
		.spyOn(systemApi, 'getFreeableVolumes')
		.mockResolvedValue(
			(over.freeable ?? freeable(state === 'storage0' ? 0 : 38 * 10 ** 9)) as never
		);
	const listDevices = vi.spyOn(camerasApi, 'listDevices').mockResolvedValue(devices);
	const rescan = vi.spyOn(camerasApi, 'rescan').mockResolvedValue(over.rescan ?? devices);
	vi.spyOn(cameraKindApi, 'get').mockResolvedValue(
		(state === 'kind' ? KIND_MISMATCH : KIND_OK) as never
	);
	return {
		listDevices: listDevices as never,
		rescan: rescan as never,
		getFreeable: getFreeable as never,
		fetch: fetchSpy as never
	};
}

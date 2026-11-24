// Colour card shots (NEH-340): what the capture screen, the volume and its
// lists read from GET /collections/{id}/colour-card and the volume's
// `colour_card` summary, and how a refusal of the colour card routes is told
// apart (app/api/colour_card.py, app/core/colour_card.py in the backend).
//
// Version: 0.3.0
import { describe, expect, it } from 'vitest';
import {
	cameraOrder,
	colourCardFlag,
	colourCardRefusal,
	deliveryText,
	readColourCardState,
	readColourCardSet,
	setComplete,
	shotImageUrl,
	stepOpens
} from './colour-card';
import { en } from './i18n/en';

const shot = (camera_index: number, over: Record<string, unknown> = {}) => ({
	id: 10 + camera_index,
	camera_index,
	hardware_id: `h${camera_index}`,
	role: camera_index === 0 ? 'right' : 'left',
	capture_id: `c-${camera_index}`,
	filename: `co-x-cal_01_c${camera_index}.jpg`,
	sha256: 'a'.repeat(64),
	preview_filename: null,
	preview_sha256: null,
	preview: true,
	rotate_deg: 90,
	captured_at: '2026-11-22T10:00:00',
	captured_by: 'operator',
	settings: {},
	url: `/collections/9/colour-card/shots/${10 + camera_index}/preview`,
	...over
});

const set = (over: Record<string, unknown> = {}) => ({
	id: 5,
	number: 1,
	outcome: null,
	capture_mode: 'dual',
	cameras: [
		{ camera_index: 0, hardware_id: 'h0', role: 'right', settings: {} },
		{ camera_index: 1, hardware_id: 'h1', role: 'left', settings: {} }
	],
	opened_at: '2026-11-22T09:59:00',
	opened_by: 'operator',
	completed_at: null,
	completed_by: null,
	shots: [],
	delivery: null,
	delivery_reason: null,
	...over
});

describe('readColourCardState', () => {
	it('reads the answer of GET /collections/{id}/colour-card', () => {
		const state = readColourCardState({
			enabled: true,
			needed: true,
			reason: 'begun_without',
			status: 'none',
			sets: [set({ shots: [shot(0)] })]
		});
		expect(state).toMatchObject({ enabled: true, needed: true, reason: 'begun_without' });
		expect(state?.sets[0].shots[0].camera_index).toBe(0);
	});

	it('keeps needed null (a camera that could not be read) apart from false', () => {
		expect(
			readColourCardState({ enabled: true, needed: null, reason: null, status: 'none', sets: [] })
				?.needed
		).toBeNull();
	});

	it('refuses an answer of another shape', () => {
		expect(readColourCardState(null)).toBeNull();
		expect(readColourCardState({ needed: true })).toBeNull();
		expect(readColourCardState([])).toBeNull();
	});
});

describe('stepOpens', () => {
	it('opens only when enabled and needed is true', () => {
		const base = { status: 'none' as const, sets: [] };
		expect(stepOpens({ ...base, enabled: true, needed: true, reason: 'start' })).toBe(true);
		expect(stepOpens({ ...base, enabled: true, needed: null, reason: null })).toBe(false);
		expect(stepOpens({ ...base, enabled: true, needed: false, reason: null })).toBe(false);
		expect(stepOpens({ ...base, enabled: false, needed: true, reason: 'start' })).toBe(false);
		expect(stepOpens(null)).toBe(false);
	});
});

describe('setComplete', () => {
	it('is true only when every camera of the set has a shot', () => {
		expect(setComplete(readColourCardSet(set())!)).toBe(false);
		expect(setComplete(readColourCardSet(set({ shots: [shot(1)] }))!)).toBe(false);
		expect(setComplete(readColourCardSet(set({ shots: [shot(0), shot(1)] }))!)).toBe(true);
	});
});

describe('cameraOrder', () => {
	it('puts the camera of the left pane first, as the capture screen shows them', () => {
		const s = readColourCardSet(set())!;
		expect(cameraOrder(s, 0)).toEqual([0, 1]);
		expect(cameraOrder(s, 1)).toEqual([1, 0]);
	});

	it('a single-camera set has its one camera', () => {
		const s = readColourCardSet(
			set({
				capture_mode: 'single',
				cameras: [{ camera_index: 0, hardware_id: 'h0', role: 'single', settings: {} }]
			})
		)!;
		expect(cameraOrder(s, 1)).toEqual([0]);
	});
});

describe('shotImageUrl', () => {
	it('names the shot and the capture it holds, so a shot taken again is not the cached one', () => {
		const a = readColourCardSet(set({ shots: [shot(0)] }))!.shots[0];
		const b = readColourCardSet(set({ shots: [shot(0, { capture_id: 'c-new' })] }))!.shots[0];
		expect(shotImageUrl('/api', a)).toBe('/api/collections/9/colour-card/shots/10/preview?v=c-0');
		expect(shotImageUrl('/api', b)).not.toBe(shotImageUrl('/api', a));
	});
});

describe('colourCardFlag', () => {
	it('flags a volume asked for shots whose status is not present', () => {
		expect(colourCardFlag({ enabled: true, status: 'none', sets: 0 })).toBe('none');
		expect(colourCardFlag({ enabled: true, status: 'skipped', sets: 1 })).toBe('skipped');
		expect(colourCardFlag({ enabled: true, status: 'present', sets: 1 })).toBeNull();
	});

	it('shows nothing with the setting off, or from an older backend', () => {
		expect(colourCardFlag({ enabled: false })).toBeNull();
		expect(colourCardFlag(undefined)).toBeNull();
		expect(colourCardFlag(null)).toBeNull();
	});
});

// A stand-in for api.ts's ApiError, as in capture-errors.test.ts.
class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.detail = detail;
		this.status = status;
	}
}

function refused(status: number, detail?: unknown) {
	return new ApiError('English', detail, status);
}

describe('colourCardRefusal', () => {
	it('tells each refusal of the routes apart by its code', () => {
		const code = (status: number, c: string) => colourCardRefusal(refused(status, { code: c }));
		expect(code(409, 'camera_busy')).toBe('camera_busy');
		expect(code(409, 'camera_not_connected')).toBe('not_connected');
		expect(code(502, 'colour_card_capture_failed')).toBe('capture_failed');
		expect(code(409, 'colour_card_set_closed')).toBe('set_gone');
		expect(code(404, 'colour_card_set_not_found')).toBe('set_gone');
		expect(code(422, 'colour_card_camera_not_in_set')).toBe('set_gone');
		expect(code(409, 'colour_card_shots_missing')).toBe('shots_missing');
		expect(code(409, 'colour_card_not_enabled')).toBe('not_enabled');
		expect(code(409, 'stem_required')).toBe('stem');
		expect(code(507, 'storage_reserve')).toBe('storage');
		expect(code(503, 'backend_restarting')).toBe('restarting');
	});

	it('a 404 without a code is the volume deleted meanwhile', () => {
		expect(colourCardRefusal(refused(404))).toBe('volume_gone');
	});

	it('a time limit reached, or a gateway timeout, is a timeout', () => {
		expect(colourCardRefusal(new DOMException('x', 'TimeoutError'))).toBe('timeout');
		expect(colourCardRefusal(refused(504))).toBe('timeout');
	});

	it('anything else is a plain failure', () => {
		expect(colourCardRefusal(new Error('network'))).toBe('failed');
		expect(colourCardRefusal(refused(500))).toBe('failed');
	});
});

describe('deliveryText', () => {
	it('says where a taken set is, and why it waits or cannot go', () => {
		const s = (delivery: string | null, delivery_reason: string | null = null) =>
			deliveryText(readColourCardSet(set({ outcome: 'taken', delivery, delivery_reason }))!, en);
		expect(s('sent')).toBe(en.cc_delivery_sent);
		expect(s('waiting')).toBe(en.cc_delivery_waiting);
		expect(s('waiting', 'file_unstable')).toBe(
			en.cc_delivery_waiting_because(en.cc_reason_file_unstable)
		);
		expect(s('undeliverable', 'file_missing')).toBe(
			en.cc_delivery_undeliverable(en.cc_reason_file_missing)
		);
		expect(s('undeliverable', 'upload_refused')).toBe(
			en.cc_delivery_undeliverable(en.cc_reason_upload_refused)
		);
		expect(s('waiting', 'a_new_reason')).toBe(en.cc_delivery_waiting);
	});

	it('says nothing for a set that is open or skipped', () => {
		expect(deliveryText(readColourCardSet(set())!, en)).toBeNull();
	});
});

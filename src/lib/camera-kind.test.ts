// NEH-252/348: reading GET /system/camera-kind, the names of the kinds, the
// sentence for each source, and the notice for cameras of another kind, of
// a kind the unit lacks the driver for, or of more than one kind. A count
// that could not be measured (null) never makes a notice.
import { describe, expect, it } from 'vitest';
import { en } from './i18n/en';
import { es } from './i18n/es';
import {
	choiceRestarts,
	kindName,
	kindNotice,
	kindNotices,
	kindRefusal,
	kindRefusalText,
	noticeText,
	readCameraKind,
	sourceText
} from './camera-kind';

function wire(over: Record<string, unknown> = {}) {
	return {
		configured: 'picamera2',
		source: 'detected',
		stored: null,
		pending_restart: false,
		detected: 'picamera2',
		connected: { picamera2: 2, gphoto2: 0, chdk: 0 },
		available: { picamera2: true, gphoto2: true, chdk: true },
		mixed: false,
		mismatch: false,
		...over
	};
}

const report = (over: Record<string, unknown> = {}) => readCameraKind(wire(over))!;

describe('readCameraKind', () => {
	it('reads the route answer', () => {
		expect(report({ stored: 'chdk', pending_restart: true })).toEqual({
			configured: 'picamera2',
			source: 'detected',
			stored: 'chdk',
			pendingRestart: true,
			connected: { picamera2: 2, gphoto2: 0, chdk: 0 },
			available: { picamera2: true, gphoto2: true, chdk: true },
			mixed: false,
			mismatch: false,
			ignoredEnvironment: null
		});
	});

	it('reads the CAMERA_BACKEND value the backend set aside (NEH-405)', () => {
		expect(report({ ignored_environment: 'gphoto' }).ignoredEnvironment).toBe('gphoto');
		for (const value of [undefined, null, '', 3])
			expect(report({ ignored_environment: value }).ignoredEnvironment).toBeNull();
	});

	it('keeps a count that could not be measured as null', () => {
		expect(report({ connected: { picamera2: null, gphoto2: 2, chdk: 0 } }).connected).toEqual({
			picamera2: null,
			gphoto2: 2,
			chdk: 0
		});
	});

	it('refuses an answer of another shape', () => {
		expect(readCameraKind(null)).toBeNull();
		expect(readCameraKind({ detail: 'Not Found' })).toBeNull();
		expect(readCameraKind([])).toBeNull();
	});
});

describe('names', () => {
	it('names each kind, and counts rpicam-still as Pi cameras', () => {
		expect(kindName('picamera2', en)).toBe('Pi cameras');
		expect(kindName('gphoto2', en)).toBe('Canon DSLR cameras');
		expect(kindName('chdk', en)).toBe('Canon A2500 cameras (CHDK)');
		expect(kindName('subprocess', en)).toBe('Pi cameras');
		expect(kindName('mock', en)).toBe('mock');
	});

	it('gives one sentence per source', () => {
		const sources = ['stored', 'environment', 'detected', 'last_used', 'default'];
		const texts = sources.map((s) => sourceText(s, en));
		expect(texts.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
		expect(new Set(texts).size).toBe(sources.length);
		expect(sourceText('something_new', en)).toBeNull();
	});
});

describe('kindNotice', () => {
	it('shows nothing when the cameras are of the kind in effect', () => {
		expect(kindNotice(report())).toBeNull();
		expect(kindNotice(null)).toBeNull();
	});

	it('names both kinds on a mismatch', () => {
		const r = report({
			connected: { picamera2: 0, gphoto2: 2, chdk: 0 },
			mismatch: true
		});
		const notice = kindNotice(r);
		expect(notice).toEqual({ kind: 'mismatch', connected: 'gphoto2', count: 2 });
		expect(noticeText(notice!, r, en)).toBe(
			'This unit is set for Pi cameras, and 2 Canon DSLR cameras are connected.'
		);
	});

	it('says the unit lacks the driver when the connected kind has none', () => {
		const r = report({
			configured: 'gphoto2',
			connected: { picamera2: 0, gphoto2: 0, chdk: 1 },
			available: { picamera2: true, gphoto2: true, chdk: false },
			mismatch: true
		});
		const notice = kindNotice(r);
		expect(notice).toEqual({ kind: 'no_driver', connected: 'chdk', count: 1 });
		expect(noticeText(notice!, r, en)).toBe(
			'1 Canon A2500 camera (CHDK) is connected, and this unit lacks the driver for it.'
		);
	});

	it('gives cameras of two kinds their own sentence', () => {
		const r = report({
			connected: { picamera2: 1, gphoto2: 2, chdk: 0 },
			mixed: true
		});
		const notice = kindNotice(r);
		expect(notice?.kind).toBe('mixed');
		expect(noticeText(notice!, r, en)).toBe(
			'Cameras of two kinds are connected: 1 Pi camera and 2 Canon DSLR cameras. Captua uses one kind at a time.'
		);
	});

	it('never makes a notice from a count that could not be measured', () => {
		expect(
			kindNotice(
				report({
					connected: { picamera2: 0, gphoto2: null, chdk: null },
					mismatch: true
				})
			)
		).toBeNull();
	});
});

describe('refusals', () => {
	it('reads the code of a 409 and gives each its own sentence', () => {
		const codes = [
			'busy_capturing',
			'offsite_job_running',
			'backend_restarting',
			'driver_unavailable'
		];
		for (const code of codes) {
			expect(kindRefusal({ status: 409, detail: { code, message: 'English' } })).toBe(code);
		}
		const texts = codes.map((c) => kindRefusalText(c, en));
		expect(new Set(texts).size).toBe(codes.length);
		expect(texts).not.toContain(en.camera_kind_refused_other);
		expect(kindRefusalText(null, en)).toBe(en.camera_kind_refused_other);
		expect(kindRefusal({ status: 500, detail: { code: 'x' } })).toBeNull();
	});
});

describe('choiceRestarts', () => {
	// The table above put_camera_kind in app/api/system.py. "applied" is the
	// choice the process started with: the kind in effect when its source is
	// `stored`, none otherwise. A is the kind in effect, B another kind.
	const A = 'gphoto2' as const;
	const B = 'picamera2' as const;
	const rows: [
		string,
		'stored' | 'detected',
		typeof A | typeof B | null,
		typeof A | typeof B | 'follow',
		boolean
	][] = [
		['applied none, stored none, PUT A', 'detected', null, A, false],
		['applied none, stored none, PUT B', 'detected', null, B, true],
		['applied none, stored B, PUT B', 'detected', B, B, true],
		['applied none, stored B, PUT A', 'detected', B, A, false],
		['applied none, stored B, DELETE', 'detected', B, 'follow', false],
		['applied none, stored none, DELETE', 'detected', null, 'follow', false],
		['applied A, stored A, DELETE', 'stored', A, 'follow', true],
		['applied A, stored none, DELETE', 'stored', null, 'follow', true],
		['applied A, stored none, PUT A', 'stored', null, A, false],
		['applied A, stored A, PUT B', 'stored', A, B, true],
		['applied A, stored A, PUT A', 'stored', A, A, false]
	];
	it.each(rows)('%s', (_name, source, stored, choice, expected) => {
		const r = report({
			configured: A,
			source,
			stored,
			pending_restart: (source === 'stored' ? A : null) !== stored
		});
		expect(choiceRestarts(r, choice)).toBe(expected);
	});

	it('compares with the driver name in effect, as the backend does (rpicam-still)', () => {
		expect(choiceRestarts(report({ configured: 'subprocess' }), 'picamera2')).toBe(true);
	});
});

describe('kindNotices (NEH-405)', () => {
	it('puts a value set aside after the notice about the cameras', () => {
		const r = report({
			connected: { picamera2: 0, gphoto2: 2, chdk: 0 },
			mismatch: true,
			ignored_environment: ' GPhoto '
		});
		expect(kindNotices(r).map((n) => n.kind)).toEqual(['mismatch', 'ignored_environment']);
		expect(noticeText(kindNotices(r)[1], r, en)).toBe(
			en.camera_kind_ignored_environment(' GPhoto ')
		);
	});

	it('is empty with no report and nothing to say', () => {
		expect(kindNotices(null)).toEqual([]);
		expect(kindNotices(report())).toEqual([]);
	});
});

describe('the notice for a value set aside, exactly as approved (NEH-405)', () => {
	it('says it in English and Spanish', () => {
		expect(en.camera_kind_ignored_environment('gphoto')).toBe(
			'The unit\'s installation settings name a kind of camera Captua does not recognize ("gphoto"). Captua did not use that value and chose the kind of camera the same way as when none is set.'
		);
		expect(es.camera_kind_ignored_environment('gphoto')).toBe(
			'La configuración de instalación del equipo indica un tipo de cámara que Captua no reconoce ("gphoto"). Captua no usó ese valor y eligió el tipo de cámara de la misma manera que cuando no se indica ninguno.'
		);
	});
});

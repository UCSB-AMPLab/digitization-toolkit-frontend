// The Overview as the approved mock-up draws it (NEH-350), state by state
// and role by role: the header line; "Needs attention" with the camera
// notices, the storage notice and its "You can free" sentence, and the
// retake notice; the camera block's two rows and its buttons; the figures,
// with the dash and a line for one that failed; and the volumes in progress
// with the colour card flag in the table. The camera rows and the camera
// notices read the same state, written only by the device list and a
// reconnect. Nothing of the present page's preview test panel is left.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import { cameraKindApi, collectionsApi, recordsApi, systemApi } from '$lib/api';
import { cameraKind, readCameraKind, resetCameraKind } from '$lib/camera-kind';
import '../../../app.css';
import Overview from './+page.svelte';
import {
	BOTH,
	KIND_MISMATCH,
	device,
	freeable,
	hideProjects,
	serveOverview,
	signIn,
	type OverviewRole
} from './overview-fixtures';

const shown = (el: Element | null | undefined): el is HTMLElement =>
	!!el && (el as HTMLElement).offsetParent !== null;
const attention = () => document.querySelector<HTMLElement>('[data-attention]');
const notices = () =>
	[...document.querySelectorAll<HTMLElement>('[data-attention-notice]')].filter(shown);
const camBlock = () => document.querySelector<HTMLElement>('[data-camera-block]');
const rows = () =>
	[...document.querySelectorAll('[data-camera-row]')].map((r) => ({
		name: r.querySelector('.cam-name')?.textContent?.trim(),
		badge: r.querySelector('.cam-badge')?.textContent?.replace(/\s+/g, ' ').trim()
	}));
// A control whose label is `name`; an icon's ligature text may come before it.
const buttonsNamed = (name: string) =>
	[...document.querySelectorAll('button, a')].filter((b) => {
		const label = b.textContent?.replace(/\s+/g, ' ').trim() ?? '';
		return label === name || label.endsWith(` ${name}`);
	});
const span = (s: string) => Object.assign(document.createElement('span'), { textContent: s });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

// The storage notice has had its answer, and its freeable read if any.
async function storageSettled() {
	await expect.poll(() => vi.mocked(systemApi.getStorage).mock.settledResults.length).toBe(1);
}

beforeEach(async () => {
	localStorage.clear();
	locale.set('es');
	await hideProjects();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	resetCameraKind();
	locale.set('es');
});

describe('Overview header line', () => {
	for (const [role, lang, want] of [
		['admin', 'es', es.dash_subtitle_cameras],
		['operator', 'en', en.dash_subtitle_cameras],
		['reviewer', 'es', es.dash_subtitle_no_cameras],
		['reviewer', 'en', en.dash_subtitle_no_cameras]
	] as const) {
		it(`${role} in ${lang}: "${want}"`, async () => {
			locale.set(lang);
			signIn(role);
			serveOverview('ok');
			render(Overview);
			await expect.poll(() => text(document.querySelector('.subtitle'))).toBe(want);
		});
	}

	it('says the new lines, exactly as approved', () => {
		expect(es.dash_subtitle_cameras).toBe('Estado del equipo, volúmenes en curso y actividad.');
		expect(en.dash_subtitle_cameras).toBe(
			'The state of the unit, the volumes in progress, and activity.'
		);
		expect(es.dash_subtitle_no_cameras).toBe('Volúmenes en curso y actividad.');
		expect(en.dash_subtitle_no_cameras).toBe('Volumes in progress and activity.');
	});
});

describe('Overview, all in order', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`${role}: no attention block; both cameras OK by side; only "Revisar cámaras"`, async () => {
			signIn(role);
			serveOverview('ok');
			render(Overview);
			await expect.poll(rows).toEqual([
				{ name: es.dash_camera_right, badge: 'OK' },
				{ name: es.dash_camera_left, badge: 'OK' }
			]);
			await storageSettled();
			expect(shown(attention())).toBe(false);
			expect(notices()).toHaveLength(0);
			const block = camBlock()!;
			expect(text(block.querySelector('h2'))).toBe(es.camcheck_details_title);
			const actions = [...block.querySelectorAll('a, button')].map((a) => text(a));
			expect(actions).toEqual([es.camcheck_open]);
			expect(buttonsNamed(es.dash_camera_reconnect)).toHaveLength(0);
		});
	}

	it('reviewer: no camera block, no camera call, no Capture button in the table', async () => {
		signIn('reviewer');
		const served = serveOverview('ok');
		render(Overview);
		await expect.element(page.getByText('Tomo 1', { exact: true })).toBeVisible();
		await storageSettled();
		expect(camBlock()).toBeNull();
		expect(served.listDevices).not.toHaveBeenCalled();
		expect(buttonsNamed(es.col_live_preview)).toHaveLength(0);
		expect(buttonsNamed(es.tb_go_to_review).length).toBeGreaterThan(0);
	});

	it('the figures read in the language of the interface', async () => {
		locale.set('en');
		signIn('admin');
		serveOverview('ok');
		render(Overview);
		await expect
			.poll(() => [...document.querySelectorAll('.kpi-number')].map((n) => text(n)))
			.toEqual(['38', '12,480']);
	});
});

describe('Overview, with notices', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`${role}: "Para atender" with the storage notice, its "Puedes liberar", then the retakes`, async () => {
			signIn(role);
			const served = serveOverview('notices');
			render(Overview);
			await expect.poll(() => notices().length).toBe(2);
			expect(shown(attention())).toBe(true);
			expect(text(attention()!.querySelector('h2'))).toBe(es.dash_attention_title);
			const [storageNotice, retakeNotice] = notices();
			expect(storageNotice.matches('.storage-alert-banner')).toBe(true);
			await expect
				.poll(() => text(storageNotice))
				.toContain(text(span(es.dash_storage_can_free(38 * 10 ** 9))));
			expect(text(storageNotice)).toContain('Puedes liberar 38 GB.');
			// 466 of 507 GiB, in the decimal units of the sentence after it.
			expect(text(storageNotice)).toContain('(500 GB / 544 GB)');
			expect(served.getFreeable).toHaveBeenCalledTimes(1);
			expect(text(retakeNotice)).toContain(es.retake_band_title(23, 2));
			expect(retakeNotice.querySelector('a')).not.toBeNull();
		});
	}

	it('reviewer: the notices without the sentence, no freeable read, no retake links', async () => {
		signIn('reviewer');
		const served = serveOverview('notices');
		render(Overview);
		await expect.poll(() => notices().length).toBe(2);
		await storageSettled();
		const [storageNotice, retakeNotice] = notices();
		expect(text(storageNotice)).toContain(
			text(span(es.dash_storage_alert_ask_admin('500\u00a0GB', '544\u00a0GB')))
		);
		expect(text(storageNotice)).not.toContain('Puedes liberar');
		expect(served.getFreeable).not.toHaveBeenCalled();
		expect(retakeNotice.querySelectorAll('a')).toHaveLength(0);
	});

	it('the new strings are as approved', () => {
		expect(es.dash_attention_title).toBe('Para atender');
		expect(en.dash_attention_title).toBe('Needs attention');
		expect(es.dash_storage_can_free(38 * 10 ** 9)).toBe('Puedes liberar 38 GB.');
		expect(en.dash_storage_can_free(38 * 10 ** 9)).toBe('You can free 38 GB.');
	});
});

describe('Overview, with notices and nothing to free', () => {
	for (const [label, answer] of [
		['nothing can be freed', () => freeable(0)],
		['freeing is off in this mode', () => freeable(38 * 10 ** 9, false)]
	] as const) {
		for (const role of ['admin', 'operator'] as const) {
			it(`${role}, ${label}: the storage notice without "Puedes liberar"`, async () => {
				signIn(role);
				const served = serveOverview('storage0', { freeable: answer() });
				render(Overview);
				await expect.poll(() => notices().length).toBe(2);
				await expect.poll(() => served.getFreeable.mock.settledResults.length).toBe(1);
				expect(text(notices()[0])).toContain(es.dash_storage_alert_p1);
				expect(text(notices()[0])).not.toContain('Puedes liberar');
			});
		}
	}

	it('admin, the freeable read failing: the notice without the sentence', async () => {
		signIn('admin');
		const served = serveOverview('notices');
		served.getFreeable.mockRejectedValue(new Error('down'));
		render(Overview);
		await expect.poll(() => notices().length).toBe(2);
		await expect.poll(() => served.getFreeable.mock.settledResults.length).toBe(1);
		expect(text(notices()[0])).toContain(es.dash_storage_alert_p1);
		expect(text(notices()[0])).not.toContain('Puedes liberar');
	});
});

describe('Overview, one camera not answering', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`${role}: the camera notice with its Reconnect, and the rows by number`, async () => {
			signIn(role);
			serveOverview('camera');
			render(Overview);
			await expect.poll(() => notices().length).toBe(1);
			const notice = notices()[0];
			expect(text(notice.querySelector('.notice-title'))).toBe(es.dash_camera_missing_title);
			expect(es.dash_camera_missing_title).toBe('Captua no detecta una de las cámaras.');
			expect(en.dash_camera_missing_title).toBe('Captua cannot detect one of the cameras.');
			expect(text(notice)).toContain(es.dash_camera_missing_hint(es.dash_camera_n(2)));
			expect(text(notice.querySelector('button'))).toBe(es.dash_camera_reconnect);
			expect(rows()).toEqual([
				{ name: es.dash_camera_n(1), badge: 'OK' },
				{ name: es.dash_camera_n(2), badge: es.camera_not_detected }
			]);
			expect([...camBlock()!.querySelectorAll('a, button')].map((a) => text(a))).toEqual([
				es.camcheck_open,
				es.dash_camera_reconnect
			]);
		});
	}

	it('reviewer: no camera notice and no attention block', async () => {
		signIn('reviewer');
		serveOverview('camera');
		render(Overview);
		await expect.element(page.getByText('Tomo 1', { exact: true })).toBeVisible();
		await storageSettled();
		expect(notices()).toHaveLength(0);
		expect(shown(attention())).toBe(false);
	});
});

describe('Overview, no camera', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`${role}: the notice for no camera, both rows not detected`, async () => {
			signIn(role);
			serveOverview('nocams');
			render(Overview);
			await expect.poll(() => notices().length).toBe(1);
			const notice = notices()[0];
			expect(text(notice.querySelector('.notice-title'))).toBe(es.dash_cameras_none_title);
			expect(text(notice)).toContain(es.dash_cameras_none_hint);
			expect(text(notice.querySelector('button'))).toBe(es.dash_camera_reconnect);
			expect(rows()).toEqual([
				{ name: es.dash_camera_n(1), badge: es.camera_not_detected },
				{ name: es.dash_camera_n(2), badge: es.camera_not_detected }
			]);
		});
	}

	it('says the new strings, exactly as approved', () => {
		expect(es.dash_cameras_none_title).toBe('Captua no detecta ninguna cámara.');
		expect(en.dash_cameras_none_title).toBe('Captua cannot detect either camera.');
		expect(es.dash_cameras_none_hint).toBe(
			'Revisa que las dos cámaras estén encendidas y conectadas, y luego presiona "Reconectar cámaras".'
		);
		expect(en.dash_cameras_none_hint).toBe(
			'Check that both cameras are switched on and connected, then press "Reconnect cameras".'
		);
	});
});

describe('Overview, cameras of another kind', () => {
	const sentence =
		'Este equipo está configurado para cámaras Pi, pero hay 2 cámaras DSLR de Canon conectadas.';

	for (const [role, extra] of [
		['admin', es.camera_kind_notice_link],
		['operator', es.camera_kind_notice_tell_admin]
	] as const) {
		it(`${role}: the kind notice in place of the one for no camera, and no Reconnect`, async () => {
			signIn(role);
			serveOverview('kind');
			render(Overview);
			await expect.poll(() => notices().length).toBe(1);
			const notice = notices()[0];
			expect(text(notice)).toContain(sentence);
			expect(text(notice)).toContain(extra);
			const link = notice.querySelector('a');
			if (role === 'admin')
				expect(link?.getAttribute('href')).toBe('/dashboard/config?section=cameras');
			else expect(link).toBeNull();
			expect(text(notice)).not.toContain(es.dash_cameras_none_title);
			expect(buttonsNamed(es.dash_camera_reconnect)).toHaveLength(0);
			expect(rows()).toEqual([
				{ name: es.dash_camera_n(1), badge: es.camera_not_detected },
				{ name: es.dash_camera_n(2), badge: es.camera_not_detected }
			]);
		});
	}

	it('reviewer: no kind notice', async () => {
		signIn('reviewer');
		serveOverview('kind');
		render(Overview);
		await expect.element(page.getByText('Tomo 1', { exact: true })).toBeVisible();
		await storageSettled();
		expect(notices()).toHaveLength(0);
	});
});

describe('Overview, figures not loaded', () => {
	const numbers = () => [...document.querySelectorAll('.kpi-number')].map((n) => text(n));
	const lines = () =>
		[...document.querySelectorAll('.kpi-card')].map((c) => text(c.querySelector('.kpi-failed')));

	for (const role of ['admin', 'operator', 'reviewer'] as OverviewRole[]) {
		it(`${role}: the volume count fails; it shows the dash and its line, the record count still renders`, async () => {
			signIn(role);
			serveOverview('ok');
			vi.mocked(collectionsApi.count).mockRejectedValue(new Error('down'));
			render(Overview);
			await expect.poll(numbers).toEqual(['—', '12.480']);
			expect(lines()).toEqual([es.dash_kpi_failed, '']);
			await expect.element(page.getByText('Tomo 1', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('heading', { name: es.dash_cal_title })).toBeVisible();
		});

		it(`${role}: the record count fails; it shows the dash and its line, the volume count still renders`, async () => {
			signIn(role);
			serveOverview('ok');
			vi.mocked(recordsApi.count).mockRejectedValue(new Error('down'));
			render(Overview);
			await expect.poll(numbers).toEqual(['38', '—']);
			expect(lines()).toEqual(['', es.dash_kpi_failed]);
			await expect.element(page.getByText('Tomo 1', { exact: true })).toBeVisible();
		});
	}

	it('says the line exactly as approved', () => {
		expect(es.dash_kpi_failed).toBe('No se pudo cargar esta cifra.');
		expect(en.dash_kpi_failed).toBe('Could not load this figure.');
	});
});

// The camera part of the page comes from one refresh: the device list and
// the kind read with it. A kind answer that failed, or that belongs to an
// older refresh, makes no kind notice; the shared store's remembered report
// is never shown (NEH-350 review).
describe('Overview: the kind notice comes from the same refresh as the rows', () => {
	it('a mismatch remembered from another screen, no camera listed and the kind read failing: the no-camera notice and both Reconnect buttons', async () => {
		signIn('admin');
		cameraKind.set({ status: 'ready', report: readCameraKind(KIND_MISMATCH)! });
		serveOverview('nocams');
		const kindGet = vi.mocked(cameraKindApi.get).mockRejectedValue(new Error('down'));
		render(Overview);
		await expect.poll(() => kindGet.mock.settledResults.length).toBe(1);
		await expect
			.poll(() => text(notices()[0]?.querySelector('.notice-title')))
			.toBe(es.dash_cameras_none_title);
		expect(notices()).toHaveLength(1);
		expect(document.body.textContent).not.toContain('cámaras DSLR');
		expect(buttonsNamed(es.dash_camera_reconnect)).toHaveLength(2);
	});

	it('a kind answer from before a reconnect that comes in late changes nothing', async () => {
		signIn('operator');
		serveOverview('nocams', { rescan: BOTH });
		let lateAnswer!: (v: unknown) => void;
		const kindGet = vi
			.mocked(cameraKindApi.get)
			.mockImplementationOnce(() => new Promise((r) => (lateAnswer = r as never)))
			.mockRejectedValueOnce(new Error('down'));
		render(Overview);
		await expect
			.poll(() => rows().map((r) => r.badge))
			.toEqual([es.camera_not_detected, es.camera_not_detected]);
		const blockReconnect = [...camBlock()!.querySelectorAll('button')].find(
			(b) => text(b) === es.dash_camera_reconnect
		)!;
		blockReconnect.click();
		await expect.poll(rows).toEqual([
			{ name: es.dash_camera_right, badge: 'OK' },
			{ name: es.dash_camera_left, badge: 'OK' }
		]);
		lateAnswer(KIND_MISMATCH);
		await expect.poll(() => kindGet.mock.settledResults.length).toBe(2);
		expect(notices()).toHaveLength(0);
		expect(document.body.textContent).not.toContain('cámaras DSLR');
	});
});

// A listed camera the unit cannot capture with (the device list's `error`:
// two bodies on one parity, a body with no identity) is not OK (NEH-350 review).
describe('Overview: a camera that cannot capture', () => {
	const WORDS = (msgs: typeof es) => ({
		badge: msgs.dash_camera_unusable_badge,
		one: { title: msgs.dash_camera_unusable_title, body: msgs.dash_camera_unusable_body },
		both: {
			title: msgs.dash_camera_unusable_title_both,
			body: msgs.dash_camera_unusable_body_both
		}
	});

	it('says the strings exactly as approved', () => {
		expect(en.dash_camera_unusable_badge).toBe('Cannot capture');
		expect(es.dash_camera_unusable_badge).toBe('No se puede capturar');
		expect(en.dash_camera_unusable_title).toBe('Captua cannot capture with one of the cameras.');
		expect(es.dash_camera_unusable_title).toBe('Captua no puede capturar con una de las cámaras.');
		expect(en.dash_camera_unusable_title_both).toBe('Captua cannot capture with either camera.');
		expect(es.dash_camera_unusable_title_both).toBe(
			'Captua no puede capturar con ninguna de las dos cámaras.'
		);
		expect(en.dash_camera_unusable_body).toBe(
			'The camera is connected, but Captua cannot capture with it. To see why, press "Check cameras".'
		);
		expect(es.dash_camera_unusable_body).toBe(
			'La cámara está conectada, pero Captua no puede capturar con ella. Para ver el motivo, presiona "Revisar cámaras".'
		);
		expect(en.dash_camera_unusable_body_both).toBe(
			'Both cameras are connected, but Captua cannot capture with them. To see why, press "Check cameras".'
		);
		expect(es.dash_camera_unusable_body_both).toBe(
			'Las dos cámaras están conectadas, pero Captua no puede capturar con ellas. Para ver el motivo, presiona "Revisar cámaras".'
		);
	});

	for (const [lang, msgs] of [
		['es', es],
		['en', en]
	] as const) {
		it(`${lang}: the bodies name the button under them as the catalogue does`, () => {
			expect(msgs.dash_camera_unusable_body).toContain(`"${msgs.camcheck_open}"`);
			expect(msgs.dash_camera_unusable_body_both).toContain(`"${msgs.camcheck_open}"`);
		});

		it(`${lang}, both cameras with an error: neither row can capture, the notice for both points to the camera check`, async () => {
			locale.set(lang);
			signIn('admin');
			serveOverview('unusable2');
			render(Overview);
			const w = WORDS(msgs as typeof es);
			await expect.poll(() => rows().map((r) => r.badge)).toEqual([w.badge, w.badge]);
			await expect.poll(() => notices().length).toBe(1);
			const notice = notices()[0];
			expect(text(notice.querySelector('.notice-title'))).toBe(w.both.title);
			expect(text(notice.querySelector('.notice-body'))).toBe(w.both.body);
			expect(notice.querySelector('a')?.getAttribute('href')).toBe('/live-preview?check=1');
			expect(text(notice.querySelector('a'))).toBe(msgs.camcheck_open);
		});

		it(`${lang}, one camera with an error: that row cannot capture, the other is OK, the notice for one`, async () => {
			locale.set(lang);
			signIn('operator');
			serveOverview('unusable1');
			render(Overview);
			const w = WORDS(msgs as typeof es);
			await expect.poll(() => rows().map((r) => r.badge)).toEqual(['OK', w.badge]);
			await expect.poll(() => notices().length).toBe(1);
			const notice = notices()[0];
			expect(text(notice.querySelector('.notice-title'))).toBe(w.one.title);
			expect(text(notice.querySelector('.notice-body'))).toBe(w.one.body);
			expect(text(notice.querySelector('a'))).toBe(msgs.camcheck_open);
		});
	}
});

describe('Overview: the preview test panel is gone', () => {
	it('no Test, Focus, test capture, preview box or fixed "2 cameras" badge, and no preview request', async () => {
		signIn('admin');
		const served = serveOverview('ok');
		render(Overview);
		await expect.poll(() => rows().length).toBe(2);
		await storageSettled();
		// The removed panel's labels, as the catalogue held them.
		for (const label of ['Probar', 'Enfocar', es.common_capture, '2 cámaras'])
			expect(camBlock()!.textContent).not.toContain(label);
		expect(document.body.textContent).not.toContain('2 cámaras');
		expect(document.querySelector('.preview-area, .camera-toggle-btn, .cameras-badge')).toBeNull();
		const fixed = [...document.querySelectorAll('.page *')].filter(
			(el) => getComputedStyle(el).position === 'fixed'
		);
		expect(fixed).toHaveLength(0);
		const urls = served.fetch.mock.calls.map((c) => String(c[0]));
		expect(urls.filter((u) => u.includes('/cameras/preview'))).toEqual([]);
	});

	it('the old header lines are gone from the page', async () => {
		signIn('operator');
		serveOverview('ok');
		render(Overview);
		await expect.poll(() => text(document.querySelector('.subtitle'))).not.toBe('');
		expect(document.body.textContent).not.toContain('Tus proyectos asignados');
		expect(document.body.textContent).not.toContain('pendientes de revisión');
	});
});

describe('Overview: the camera rows and the camera notice read one state', () => {
	it('a reconnect that finds both cameras clears the notice and both rows together', async () => {
		signIn('operator');
		const served = serveOverview('camera', { rescan: BOTH });
		render(Overview);
		await expect.poll(() => notices().length).toBe(1);
		(notices()[0].querySelector('button') as HTMLButtonElement).click();
		await expect.poll(() => notices().length).toBe(0);
		expect(rows()).toEqual([
			{ name: es.dash_camera_right, badge: 'OK' },
			{ name: es.dash_camera_left, badge: 'OK' }
		]);
		expect(served.rescan).toHaveBeenCalledTimes(1);
		// One camera is not a complete list: the first read and its four
		// retries (NEH-422); the complete answer of the reconnect reads nothing more.
		expect(served.listDevices).toHaveBeenCalledTimes(5);
	});

	it('a reconnect that finds none turns the one-camera notice into the no-camera notice', async () => {
		signIn('admin');
		const served = serveOverview('camera', { rescan: [] });
		render(Overview);
		await expect.poll(() => notices().length).toBe(1);
		// An empty list is read again (NEH-422); the unit still lists none.
		served.listDevices.mockResolvedValue([]);
		const blockReconnect = [...camBlock()!.querySelectorAll('button')].find(
			(b) => text(b) === es.dash_camera_reconnect
		)!;
		blockReconnect.click();
		await expect
			.poll(() => text(notices()[0]?.querySelector('.notice-title')))
			.toBe(es.dash_cameras_none_title);
		expect(rows().map((r) => r.badge)).toEqual([es.camera_not_detected, es.camera_not_detected]);
	});

	it('both Reconnect buttons are off while a reconnect runs', async () => {
		signIn('admin');
		const served = serveOverview('camera');
		let finish!: (v: ReturnType<typeof device>[]) => void;
		served.rescan.mockImplementation(() => new Promise((r) => (finish = r)));
		render(Overview);
		await expect.poll(() => notices().length).toBe(1);
		(notices()[0].querySelector('button') as HTMLButtonElement).click();
		await expect
			.poll(() =>
				buttonsNamed(es.dash_camera_reconnect).map((b) => (b as HTMLButtonElement).disabled)
			)
			.toEqual([true, true]);
		finish(BOTH);
		await expect.poll(() => notices().length).toBe(0);
	});
});

describe('Overview: "Revisar cámaras" opens the camera check without a volume', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`${role}: the camera block's button goes to /live-preview?check=1`, async () => {
			signIn(role);
			serveOverview('ok');
			render(Overview);
			await expect.poll(() => camBlock()).not.toBeNull();
			const link = camBlock()!.querySelector('a');
			expect(text(link)).toBe(es.camcheck_open);
			expect(link?.getAttribute('href')).toBe('/live-preview?check=1');
		});
	}
});

describe('Overview: volumes in progress', () => {
	it('the table flags the volumes without colour card shots, on a line of their own', async () => {
		signIn('admin');
		serveOverview('ok');
		render(Overview);
		await expect.element(page.getByText('Tomo 2', { exact: true })).toBeVisible();
		const flags = [...document.querySelectorAll('.ip-volume [data-colour-card-flag]')];
		expect(flags.map((f) => text(f))).toEqual([es.cc_flag_skipped, es.cc_flag_none]);
		for (const f of flags) {
			const name = f.parentElement!.querySelector('.ip-volume-name')!;
			expect(f.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				name.getBoundingClientRect().bottom - 0.5
			);
		}
	});

	it('the board view carries no flag', async () => {
		signIn('admin');
		serveOverview('ok');
		render(Overview);
		await page.getByRole('button', { name: es.dash_view_board }).click();
		await expect.element(page.getByRole('heading', { name: es.dash_stage_capture })).toBeVisible();
		expect(document.querySelectorAll('[data-colour-card-flag]')).toHaveLength(0);
		await page.getByRole('button', { name: es.dash_view_table }).click();
	});

	it('a reviewer has no Capture button in the board either', async () => {
		signIn('reviewer');
		serveOverview('ok');
		render(Overview);
		await page.getByRole('button', { name: es.dash_view_board }).click();
		await expect.element(page.getByRole('heading', { name: es.dash_stage_capture })).toBeVisible();
		expect(buttonsNamed(es.col_live_preview)).toHaveLength(0);
		await page.getByRole('button', { name: es.dash_view_table }).click();
	});
});

describe('Overview: one device list for the rows', () => {
	it('a device list that names only the second camera puts it in the second row', async () => {
		signIn('admin');
		serveOverview('camera', { devices: [device(1)] });
		render(Overview);
		await expect.poll(rows).toEqual([
			{ name: es.dash_camera_n(1), badge: es.camera_not_detected },
			{ name: es.dash_camera_n(2), badge: 'OK' }
		]);
		expect(text(notices()[0])).toContain(es.dash_camera_missing_hint(es.dash_camera_n(1)));
	});
});

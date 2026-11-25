<script lang="ts">
	// The overview page at /dashboard, one page for every role (NEH-350), in
	// the blocks of the approved design: the header; "Needs attention", with
	// the camera notices, the storage notice and the retake notice; the
	// volumes in progress; the cameras; the figures; the activity calendar.
	// Compact (the unit's screen) puts them in one column in that order; Wide
	// (a monitor) puts the first two in a left column and the rest in a right
	// one, 646 px, the width of the activity map in its card. The page picks
	// Wide when its content is wide enough for both columns with the
	// in-progress table at its full 54rem (1542 px: 864 + 32 + 646).
	//
	// "Needs attention" shows its title only while one of its notices draws
	// something (`data-attention-notice`), so each notice reads its own
	// figures and the block needs to know none of them.
	//
	// The camera block (admin and operator, `canSeeCameras`) has one row per
	// camera and "Check cameras", which opens the capture screen with no
	// volume and its camera check open (/live-preview?check=1, NEH-351).
	// Everything the camera part shows comes from one refresh (`view`): GET
	// /cameras/devices at mount, or POST /cameras/rescan, then GET
	// /system/camera-kind read after it. The rows, the camera notices and both
	// "Reconnect cameras" buttons read `view` and nothing else, so they cannot
	// disagree. A newer refresh drops every answer of an older one; a kind
	// read that fails makes no kind notice. The shared `cameraKind` store,
	// which keeps an earlier screen's report, is never read here. Until the
	// refresh's kind answer is in, no camera notice shows.
	//
	// A camera counts as OK only when the unit can capture with it: a listed
	// device that carries an `error` (two bodies on one parity, a body with no
	// identity) is shown as unavailable, with a notice that sends to the
	// camera check. Cameras of another kind than the unit is set for put
	// their notice in place of the other camera notices, and then the camera
	// block offers no Reconnect: the cameras are there, of the wrong kind.
	//
	// Among the notices of "Needs attention", right above the storage notice,
	// an administrator sees a move of captures the unit could not settle
	// (NEH-420, AdoptionNotice).
	//
	// Each figure reads on its own; one that fails shows a dash and a line
	// saying it could not be loaded, and the rest of the page is unaffected.
	// While the unit hides projects (NEH-313) the "Proyectos activos" figure
	// is left out.
	//
	// The testing account (NEH-391) gets its own Overview: what the testing
	// space is, how many projects and volumes it holds (GET /projects and GET
	// /collections/count) and the way to Projects. None of the rest is
	// requested or shown for it.
	//
	// Version: 0.3.0

	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import {
		camerasApi,
		cameraKindApi,
		projectsApi,
		collectionsApi,
		recordsApi,
		AuthError,
		type CameraDevice,
		type Collection,
		type Project,
		type RetakeSummary
	} from '$lib/api';
	import { readRetakeSummary } from '$lib/recapture-turn';
	import {
		canSeeCameraPanels,
		inTestingSpace,
		opensUnitSettings,
		projectsShownIn,
		unitState
	} from '$lib/unit-mode';
	import { m, locale } from '$lib/i18n';
	import { formatCount } from '$lib/format-count';
	import { sidesFromDevices } from '$lib/camera-sides';
	import { kindNotice, noticeText, readCameraKind, type CameraKindReport } from '$lib/camera-kind';
	import InProgress from './InProgress.svelte';
	import ActivityCalendar from './ActivityCalendar.svelte';
	import StorageAlert from './StorageAlert.svelte';
	import AdoptionNotice from '$lib/components/AdoptionNotice.svelte';
	import RetakeBand from './RetakeBand.svelte';
	import AttentionNotice from './AttentionNotice.svelte';

	let currentUser = $state<any>(null);
	let userRole = $state('');

	onMount(() => {
		const unsub = authStore.subscribe((s) => {
			currentUser = s.user;
			userRole = s.user?.role ?? '';
		});
		return unsub;
	});

	let canSeeCameras = $derived(canSeeCameraPanels(userRole));
	let isAdmin = $derived(opensUnitSettings(userRole));
	// From the store, so nothing of the other roles' Overview mounts for the
	// testing account before the subscription runs.
	let testing = $derived(inTestingSpace($authStore.user?.role));

	let userName = $derived(
		currentUser?.username
			? currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1)
			: $m.dash_greeting_fallback
	);

	// A figure: null while it loads, 'failed' when its read failed.
	type Figure = number | null | 'failed';
	let projectCount = $state<Figure>(null);
	let collectionCount = $state<Figure>(null);
	let recordCount = $state<Figure>(null);
	let isLoadingStats = $state(true);

	// Volumes and projects already loaded for the figures; `InProgress.svelte`
	// builds its table and board from them (NEH-233).
	let allCollections = $state<Collection[]>([]);
	let allProjects = $state<Project[]>([]);

	type CameraStatus = 'ok' | 'not-found' | 'unusable' | 'unknown';
	type CameraState = { status: CameraStatus; model: string | null; role: 'left' | 'right' | null };
	type Sides = { left: CameraState; right: CameraState };
	// The one refresh every camera statement on the page reads. `kind` is the
	// kind report read in the same refresh, null when it failed or found no
	// mismatch to report; `settled` is false until that read has answered.
	let view = $state<{ sides: Sides; kind: CameraKindReport | null; settled: boolean }>({
		sides: {
			left: { status: 'unknown', model: null, role: null },
			right: { status: 'unknown', model: null, role: null }
		},
		kind: null,
		settled: false
	});
	let cameras = $derived(view.sides);
	// Raised by each refresh; an answer of an older one is dropped.
	let refreshGen = 0;

	function sidesOf(devices: CameraDevice[]): Sides {
		const sides = sidesFromDevices(devices);
		const state = (side: 'left' | 'right', index: number): CameraState => {
			const info = sides[side];
			const unusable = devices.find((d) => d.index === index)?.error;
			return {
				status: info.status === 'ok' && unusable ? 'unusable' : info.status,
				model: info.model,
				role: info.role ?? null
			};
		};
		return { left: state('left', 0), right: state('right', 1) };
	}

	const NONE_LISTED: Sides = {
		left: { status: 'not-found', model: null, role: null },
		right: { status: 'not-found', model: null, role: null }
	};

	async function readKind(): Promise<CameraKindReport | null> {
		try {
			return readCameraKind(await cameraKindApi.get());
		} catch {
			return null;
		}
	}

	// One refresh: the devices from `list`, then the kind. A failed list that
	// is not a dead session reads as no camera listed; `list` rejecting with
	// `keepOnFailure` (a failed reconnect) leaves the view as it was.
	async function refreshCameras(list: () => Promise<CameraDevice[]>, keepOnFailure = false) {
		const gen = ++refreshGen;
		let sides: Sides;
		try {
			sides = sidesOf(await list());
		} catch (err) {
			if (gen !== refreshGen) return;
			if (keepOnFailure) {
				// The view stays; an older refresh's kind answer, now dropped, is
				// taken as failed.
				if (!view.settled) view = { ...view, kind: null, settled: true };
				throw err;
			}
			// A dead login is not a hardware failure; apiRequest redirects (NEH-64).
			if (err instanceof AuthError && err.status === 401) return;
			sides = NONE_LISTED;
		}
		if (gen !== refreshGen) return;
		view = { sides, kind: null, settled: false };
		const kind = await readKind();
		if (gen !== refreshGen) return;
		view = { sides, kind, settled: true };
	}

	// A row names its camera from the confirmed set-up: role `right` (the
	// odd/recto page) is the left camera, role `left` the right camera.
	// Without one, by number: the first row is camera index 0.
	function cameraName(side: 'left' | 'right'): string {
		const role = cameras[side].role;
		if (role === 'right') return $m.dash_camera_right;
		if (role === 'left') return $m.dash_camera_left;
		return $m.dash_camera_n(side === 'left' ? 1 : 2);
	}

	let missingSides = $derived(
		(['left', 'right'] as const).filter((side) => cameras[side].status === 'not-found')
	);
	let unusableSides = $derived(
		(['left', 'right'] as const).filter((side) => cameras[side].status === 'unusable')
	);
	let kindReport = $derived(view.settled ? view.kind : null);
	let kind = $derived(canSeeCameras ? kindNotice(kindReport) : null);
	// Which camera notice "Needs attention" holds, if any, once the refresh
	// on screen has its kind answer.
	let cameraNotice = $derived<'kind' | 'one' | 'none' | 'unusable' | null>(
		!canSeeCameras || !view.settled
			? null
			: kind
				? 'kind'
				: missingSides.length === 2
					? 'none'
					: missingSides.length === 1
						? 'one'
						: unusableSides.length > 0
							? 'unusable'
							: null
	);

	// Null until it arrives, and when it cannot be loaded: then no notice.
	let retakeSummary = $state<RetakeSummary | null>(null);

	async function loadRetakeSummary() {
		try {
			retakeSummary = readRetakeSummary(await recordsApi.toRetakeSummary());
		} catch (err) {
			if (err instanceof AuthError && err.status === 401) return;
			console.error('[Dashboard] Error loading the recapture summary:', err);
		}
	}

	onMount(async () => {
		if (testing) {
			await loadTestingCounts();
			return;
		}
		await Promise.all([
			loadStats(),
			loadRetakeSummary(),
			canSeeCameras ? checkCamerasStatus() : Promise.resolve()
		]);
	});

	// The testing space's own counts; nothing else is read for it.
	async function loadTestingCounts() {
		try {
			const [projects, volumes] = await Promise.all([projectsApi.list(), collectionsApi.count()]);
			projectCount = projects.length;
			collectionCount = volumes;
		} catch (err) {
			console.error('[Dashboard] Testing counts error:', err);
		} finally {
			isLoadingStats = false;
		}
	}

	// Each figure is read on its own, so one failure leaves the others.
	async function loadStats() {
		isLoadingStats = true;
		const failed = (what: string) => (err: unknown) => {
			console.error(`[Dashboard] ${what} error:`, err);
			return 'failed' as const;
		};
		const [projects, volumes, records] = await Promise.all([
			projectsApi.list().catch(failed('Projects')),
			collectionsApi.count().catch(failed('Volume count')),
			recordsApi.count().catch(failed('Record count'))
		]);
		if (projects === 'failed') projectCount = 'failed';
		else {
			projectCount = projects.length;
			allProjects = projects;
		}
		collectionCount = volumes;
		recordCount = records;
		try {
			allCollections = await collectionsApi.listAll();
		} catch (err) {
			console.error('[Dashboard] Volumes error:', err);
		} finally {
			isLoadingStats = false;
		}
	}

	async function checkCamerasStatus() {
		await refreshCameras(() => camerasApi.listDevices());
	}

	// true while a "reconnect cameras" request is in flight; it prevents two
	// overlapping reconnects and disables both buttons meanwhile.
	let rescanInFlight = $state(false);
	// Error message of the last failed reconnect, or null if none is pending.
	let rescanError = $state<string | null>(null);

	async function rescanCameras() {
		if (rescanInFlight) return;
		rescanInFlight = true;
		try {
			await refreshCameras(() => camerasApi.rescan(), true);
			rescanError = null;
		} catch (err) {
			// A 401 means a dead session, not a failed reconnect — `apiRequest`
			// has already cleared the session and redirects to /login (as in
			// `checkCamerasStatus`, NEH-64).
			if (err instanceof AuthError && err.status === 401) return;
			rescanError = err instanceof Error ? err.message : String(err);
		} finally {
			rescanInFlight = false;
		}
	}

	function figureText(value: Figure): string {
		return typeof value === 'number' ? formatCount(value, $locale) : '—';
	}
</script>

{#snippet figure(value: Figure, label: string, colour: string)}
	<div class="kpi-card">
		<div class="kpi-line" style="background: var({colour})"></div>
		<div class="kpi-number">{isLoadingStats ? '—' : figureText(value)}</div>
		<div class="kpi-label">{label}</div>
		{#if value === 'failed'}<div class="kpi-failed">{$m.dash_kpi_failed}</div>{/if}
	</div>
{/snippet}

{#snippet reconnectButton(primary: boolean)}
	<button
		type="button"
		class={primary ? 'btn btn-primary' : 'btn-quiet'}
		disabled={rescanInFlight}
		onclick={rescanCameras}>{$m.dash_camera_reconnect}</button
	>
{/snippet}

{#if testing}
	<div class="page">
		<section class="testing-overview" aria-labelledby="testing-overview-title">
			<h1 id="testing-overview-title" class="greeting">{$m.testing_overview_title}</h1>
			<p class="subtitle">{$m.testing_overview_body}</p>
			{#if !isLoadingStats}
				<p class="testing-counts">
					{$m.testing_counts(
						typeof projectCount === 'number' ? projectCount : 0,
						typeof collectionCount === 'number' ? collectionCount : 0
					)}
				</p>
			{/if}
			<a class="testing-go" href="/dashboard/projects">{$m.testing_overview_go}</a>
		</section>
	</div>
{:else}
	<div class="page overview">
		<div class="page-header">
			<h1 class="greeting">{$m.dash_greeting(userName)}</h1>
			<p class="subtitle">
				{canSeeCameras ? $m.dash_subtitle_cameras : $m.dash_subtitle_no_cameras}
			</p>
		</div>

		<div class="cols">
			<div class="col">
				<section class="attention" aria-labelledby="attention-title" data-attention>
					<h2 id="attention-title" class="section-title">{$m.dash_attention_title}</h2>
					<!-- The notices, in order. Another notice goes in this list in its
					     place: the interrupted move of captures goes right above
					     StorageAlert. -->
					<div class="notices">
						{#if cameraNotice === 'one'}
							<AttentionNotice icon="camera-off">
								<p class="notice-title">{$m.dash_camera_missing_title}</p>
								<p class="notice-body">
									{$m.dash_camera_missing_hint(
										missingSides.map((side) => cameraName(side)).join(' / ')
									)}
								</p>
								<div class="notice-actions">{@render reconnectButton(true)}</div>
							</AttentionNotice>
						{:else if cameraNotice === 'none'}
							<AttentionNotice icon="camera-off">
								<p class="notice-title">{$m.dash_cameras_none_title}</p>
								<p class="notice-body">{$m.dash_cameras_none_hint}</p>
								<div class="notice-actions">{@render reconnectButton(true)}</div>
							</AttentionNotice>
						{:else if cameraNotice === 'kind' && kind && kindReport}
							<AttentionNotice icon="camera-off">
								<p class="notice-title plain" data-camera-kind-notice={kind.kind}>
									{noticeText(kind, kindReport, $m)}
								</p>
								<p class="notice-body">
									{#if isAdmin}
										<a class="alert-link on-own-line" href="/dashboard/config?section=cameras"
											>{$m.camera_kind_notice_link}</a
										>
									{:else}
										{$m.camera_kind_notice_tell_admin}
									{/if}
								</p>
							</AttentionNotice>
						{:else if cameraNotice === 'unusable'}
							<AttentionNotice icon="camera-off">
								<p class="notice-title">
									{unusableSides.length === 2
										? $m.dash_camera_unusable_title_both
										: $m.dash_camera_unusable_title}
								</p>
								<p class="notice-body">
									{unusableSides.length === 2
										? $m.dash_camera_unusable_body_both
										: $m.dash_camera_unusable_body}
								</p>
								<div class="notice-actions">
									<a class="btn btn-primary" href="/live-preview?check=1">{$m.camcheck_open}</a>
								</div>
							</AttentionNotice>
						{/if}
						<!-- A move of captures the unit could not settle (NEH-420): administrators only. -->
						<AdoptionNotice />
						<StorageAlert />
						<RetakeBand summary={retakeSummary} canRetake={canSeeCameras} />
					</div>
				</section>

				<!-- Volumes in progress (NEH-233): direct access to capture or review a
				     given volume. `InProgress` draws nothing when no volume has records. -->
				<InProgress
					collections={allCollections}
					projects={allProjects}
					canCapture={canSeeCameras}
				/>
			</div>

			<div class="col">
				{#if canSeeCameras}
					<section class="cameras" aria-labelledby="cameras-title" data-camera-block>
						<h2 id="cameras-title" class="section-title">{$m.camcheck_details_title}</h2>
						<div class="cam-card">
							{#each ['left', 'right'] as const as side (side)}
								{@const status = cameras[side].status}
								<div class="cam-row" data-camera-row>
									<div class="cam-icon" aria-hidden="true">
										<svg
											width="15"
											height="15"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
											/>
											<circle cx="12" cy="13" r="4" />
										</svg>
									</div>
									<div class="cam-info">
										<span class="cam-name">{cameraName(side)}</span>
										<span class="cam-model">{cameras[side].model ?? '—'}</span>
									</div>
									<div
										class="cam-badge"
										class:ok={status === 'ok'}
										class:notfound={status === 'not-found' || status === 'unusable'}
									>
										{#if status === 'ok'}
											<svg
												width="9"
												height="9"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
											>
											OK
										{:else if status === 'not-found'}
											<svg
												width="9"
												height="9"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												aria-hidden="true"
												><line x1="18" y1="6" x2="6" y2="18" /><line
													x1="6"
													y1="6"
													x2="18"
													y2="18"
												/></svg
											>
											{$m.camera_not_detected}
										{:else if status === 'unusable'}
											<svg
												width="9"
												height="9"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="3"
												aria-hidden="true"
												><line x1="18" y1="6" x2="6" y2="18" /><line
													x1="6"
													y1="6"
													x2="18"
													y2="18"
												/></svg
											>
											{$m.dash_camera_unusable_badge}
										{:else}—{/if}
									</div>
								</div>
							{/each}
							<div class="cam-actions">
								<!-- NEH-351: the capture screen with no volume, the camera check open. -->
								<a class="btn-quiet" href="/live-preview?check=1">{$m.camcheck_open}</a>
								{#if missingSides.length > 0 && !(view.settled && kind)}
									{@render reconnectButton(false)}
								{/if}
							</div>
							{#if rescanError}
								<p class="cam-error" role="status">
									{$m.dash_camera_reconnect_error}: {rescanError}
								</p>
							{/if}
						</div>
					</section>
				{/if}

				<section class="kpi-grid" class:three={projectsShownIn($unitState)}>
					{#if projectsShownIn($unitState)}
						{@render figure(projectCount, $m.dash_kpi_active_projects, '--color-primary')}
					{/if}
					{@render figure(collectionCount, $m.dash_kpi_collections, '--color-secondary')}
					{@render figure(recordCount, $m.dash_kpi_total_records, '--color-warning')}
				</section>

				<ActivityCalendar />
			</div>
		</div>
	</div>
{/if}

<style>
	.page {
		padding: 32px;
	}
	.page.overview {
		container-type: inline-size;
	}

	.page-header {
		margin-bottom: 28px;
	}
	.greeting {
		font-size: var(--text-h2);
		font-weight: var(--fw-black);
		color: var(--color-light);
		line-height: 1.2;
		margin: 0 0 4px;
	}
	.subtitle {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
	}

	/* Compact: one column, the blocks in order. */
	.cols,
	.col {
		display: flex;
		flex-direction: column;
		gap: 36px;
		min-width: 0;
	}
	/* Wide: two columns, the right one as wide as the activity map's card. */
	@container (min-width: 1542px) {
		.cols {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 646px;
			gap: 32px;
			align-items: start;
		}
	}

	.section-title {
		font-size: var(--text-h3);
		font-weight: var(--fw-bold);
		color: var(--color-light);
		line-height: 1.2;
		margin: 0 0 16px;
	}

	/* "Needs attention" is drawn only while one of its notices is. */
	.attention:not(:has(:global([data-attention-notice]))) {
		display: none;
	}
	.notices {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* Cameras: one row per camera, then the buttons. */
	.cam-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}
	.cam-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		min-height: 60px;
	}
	.cam-row + .cam-row {
		border-top: 1px solid var(--border-color);
	}
	.cam-icon {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-alt-2);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-light-grey);
		flex-shrink: 0;
	}
	.cam-info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		line-height: 1.35;
	}
	.cam-name {
		font-size: 13px;
		font-weight: var(--fw-bold);
		color: var(--color-light);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cam-model {
		font-size: 11px;
		color: var(--color-light-grey);
	}
	.cam-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: var(--fw-bold);
		padding: 3px 8px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
		background-color: rgba(171, 183, 183, 0.1);
		color: var(--color-light-grey);
		border: 1px solid var(--border-color);
	}
	.cam-badge.ok {
		background-color: rgba(90, 140, 98, 0.15);
		color: var(--color-primary);
		border-color: var(--color-primary);
	}
	.cam-badge.notfound {
		background-color: rgba(214, 103, 74, 0.12);
		color: var(--color-error);
		border-color: var(--color-error);
	}
	.cam-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 16px 16px;
		border-top: 1px solid var(--border-color);
	}
	.cam-error {
		margin: 0;
		padding: 0 16px 16px;
		font-size: var(--text-sm);
		color: var(--color-error);
	}

	/* The page's quiet secondary button, at the 44 px minimum. */
	.btn-quiet {
		min-height: var(--touch-target-min);
		padding: 0 18px;
		background: none;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		color: var(--color-light);
		cursor: pointer;
		white-space: nowrap;
		text-decoration: none;
		transition: border-color var(--transition-fast);
	}
	.btn-quiet:hover {
		border-color: var(--color-primary);
	}
	.btn-quiet:disabled {
		opacity: 0.5;
		cursor: default;
		pointer-events: none;
	}

	/* Figures */
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.kpi-grid.three {
		grid-template-columns: repeat(3, 1fr);
	}
	.kpi-card {
		background-color: var(--color-surface);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-xl);
		padding: 20px 20px 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		transition: transform var(--transition-base);
	}
	.kpi-card:hover {
		transform: translateY(-3px);
	}
	.kpi-line {
		width: 32px;
		height: 3px;
		border-radius: var(--radius-full);
		margin-bottom: 4px;
	}
	.kpi-number {
		font-size: var(--text-h1);
		font-weight: var(--fw-extrabold);
		color: var(--color-light);
		line-height: 1;
		margin: 0;
	}
	.kpi-label {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
	}
	.kpi-failed {
		font-size: var(--text-sm);
		color: var(--color-error);
	}

	.testing-overview {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 760px;
	}
	.testing-counts {
		margin: 0;
		font-size: var(--text-base);
		color: var(--color-light);
	}
	.testing-go {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		padding: 0 22px;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		color: white;
		font-weight: var(--fw-bold);
		text-decoration: none;
	}
</style>

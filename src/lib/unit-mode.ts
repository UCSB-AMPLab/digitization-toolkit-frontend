// The unit's mode (NEH-311) and projects setting (NEH-313), as the interface
// reads them from GET /system/unit (app/api/system.py, app/core/unit_mode.py
// in the backend).
//
// `unitState` holds the last state read: null until it is read, and when it
// cannot be read. It is read once per session (ensureUnit) and again after
// a change (reloadUnit, or keepUnitState with the PUT's answer); any change of
// signed-in user (a logout, a login as someone else) forgets it and drops a
// read still in flight, and the next ensureUnit reads it for the new session.
// The session itself is an httpOnly cookie no script can read (NEH-61), so
// the user's id in the auth store marks the session. A read that
// fails after one succeeded keeps the known state; only the first read of a
// session can leave it null. Every gate below takes null as "as before the modes":
// projects shown, no Fisqua-mode restriction, since the backend enforces
// the mode either way and its refusals are shown translated.
//
// No static import of api.ts or the auth store, so the pure helpers can be
// tested in plain node; the loader imports them when it first runs.
//
// Version: 0.3.4

import { get, writable } from 'svelte/store';
import type { Messages } from './i18n';

export const UNIT_MODES = ['offline', 'backup', 'fisqua'] as const;
export type UnitMode = (typeof UNIT_MODES)[number];

export interface UnitState {
	mode: UnitMode;
	projectsEnabled: boolean;
	// True only in offline mode with projects enabled.
	projectsShown: boolean;
	// The project new volumes go into while projects are hidden; null until first needed.
	defaultProjectId: number | null;
	// The codes of what the configuration lacks for each mode; empty when the switch may be tried.
	prerequisites: { backup: string[]; fisqua: string[] };
	// The volumes Captua keeps on the unit (NEH-320); empty from an older backend.
	keptVolumes: KeptVolume[];
}

export interface KeptVolume {
	id: number;
	name: string;
	// The files Captua would copy offsite.
	files: number;
}

export type KeptVolumesDecision = 'include' | 'keep';

function isMode(value: unknown): value is UnitMode {
	return typeof value === 'string' && (UNIT_MODES as readonly string[]).includes(value);
}

function codes(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string') : [];
}

function keptList(value: unknown): KeptVolume[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((v) => {
		if (!v || typeof v !== 'object') return [];
		const k = v as { id?: unknown; name?: unknown; files?: unknown };
		if (typeof k.id !== 'number' || typeof k.name !== 'string') return [];
		return [{ id: k.id, name: k.name, files: typeof k.files === 'number' ? k.files : 0 }];
	});
}

/** The GET /system/unit body, or null for an answer of any other shape. */
export function readUnitState(data: unknown): UnitState | null {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const d = data as { [k: string]: unknown };
	if (
		!isMode(d.mode) ||
		typeof d.projectsEnabled !== 'boolean' ||
		typeof d.projectsShown !== 'boolean'
	)
		return null;
	const pre = (d.prerequisites ?? {}) as { backup?: unknown; fisqua?: unknown };
	return {
		mode: d.mode,
		projectsEnabled: d.projectsEnabled,
		projectsShown: d.projectsShown,
		defaultProjectId: typeof d.defaultProjectId === 'number' ? d.defaultProjectId : null,
		prerequisites: { backup: codes(pre.backup), fisqua: codes(pre.fisqua) },
		keptVolumes: keptList(d.keptVolumes)
	};
}

/**
 * Whether switching to `target` needs the admin's decision for the kept
 * volumes (NEH-320): leaving Scanner only mode while Captua keeps any.
 */
export function keptDecisionNeeded(state: UnitState | null, target: UnitMode | null): boolean {
	return (
		!!state &&
		state.mode === 'offline' &&
		target !== null &&
		target !== 'offline' &&
		state.keptVolumes.length > 0
	);
}

/**
 * The PUT /system/unit body for the form's change: only what changed, and
 * the kept volumes' decision only when the switch needs it.
 */
export function unitChangeBody(
	state: UnitState,
	selected: UnitMode,
	projectsEnabled: boolean,
	kept: KeptVolumesDecision | null = null
): { mode?: UnitMode; projectsEnabled?: boolean; keptVolumes?: KeptVolumesDecision } {
	const body: { mode?: UnitMode; projectsEnabled?: boolean; keptVolumes?: KeptVolumesDecision } =
		{};
	if (selected !== state.mode) body.mode = selected;
	if (selected === 'offline' && projectsEnabled !== state.projectsEnabled)
		body.projectsEnabled = projectsEnabled;
	if (kept && keptDecisionNeeded(state, selected)) body.keptVolumes = kept;
	return body;
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const unitState = writable<UnitState | null>(null);

// The signed-in user's id last seen (null for no session, undefined before
// the auth store is watched), the id the state belongs to, and the read in
// flight.
type SessionKey = number | null;
const UNKNOWN_SESSION = Symbol('unknown session');
let observed: SessionKey | undefined = undefined;
let readFor: SessionKey | typeof UNKNOWN_SESSION = null;
let pending: Promise<UnitState | null> | null = null;
let watching = false;
// Raised by resetUnit, so a read that started before it is not kept.
let generation = 0;

function sessionKeyOf(user: { id: number } | null): SessionKey {
	return user ? user.id : null;
}

async function currentSession(): Promise<SessionKey> {
	const { authStore } = await import('./stores/auth');
	if (!watching) {
		watching = true;
		// Any change of signed-in user forgets the state, whether or not a
		// read has succeeded yet. Validating the same user again (the
		// dashboard layout does it on every mount) changes nothing.
		authStore.subscribe((s) => {
			const key = sessionKeyOf(s.user);
			if (observed !== undefined && key !== observed) resetUnit();
			observed = key;
		});
	}
	return sessionKeyOf(authStore.getUser());
}

async function read(session: SessionKey): Promise<UnitState | null> {
	const { systemApi } = await import('./api');
	const startedIn = generation;
	let state: UnitState | null = null;
	try {
		state = readUnitState(await systemApi.unit());
	} catch (err) {
		console.error('[Unit] Error reading the unit mode:', err);
	}
	if (startedIn !== generation) return get(unitState);
	if (!state) return get(unitState);
	readFor = session;
	unitState.set(state);
	return state;
}

/** The unit's state, read once per session. */
export async function ensureUnit(): Promise<UnitState | null> {
	const session = await currentSession();
	const known = get(unitState);
	if (known && (readFor === session || readFor === UNKNOWN_SESSION)) return known;
	if (!pending) {
		const p: Promise<UnitState | null> = read(session).finally(() => {
			if (pending === p) pending = null;
		});
		pending = p;
	}
	return pending;
}

/** Read the unit's state again (after a change, or a refusal that says it changed). */
export async function reloadUnit(): Promise<UnitState | null> {
	return read(await currentSession());
}

/** Keep the state a PUT /system/unit answered. */
export function keepUnitState(data: unknown): UnitState | null {
	const state = readUnitState(data);
	if (state) {
		readFor = observed === undefined ? UNKNOWN_SESSION : observed;
		unitState.set(state);
	}
	return state;
}

/** Forget the state, so the next ensureUnit reads it again. */
export function resetUnit(): void {
	generation += 1;
	pending = null;
	readFor = null;
	unitState.set(null);
}

// ---------------------------------------------------------------------------
// Labels and the refusals of PUT /system/unit
// ---------------------------------------------------------------------------

export function modeLabel(mode: UnitMode, msgs: Messages): string {
	if (mode === 'offline') return msgs.unit_mode_offline;
	if (mode === 'backup') return msgs.unit_mode_backup;
	return msgs.unit_mode_fisqua;
}

/** The problem codes of a refused switch (409 {message, problems}), or null for any other error. */
export function modeRefusal(error: unknown): string[] | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return null;
	const problems = (e.detail as { problems?: unknown }).problems;
	if (!Array.isArray(problems)) return null;
	return problems.map((p) =>
		p && typeof p === 'object' && typeof p.code === 'string' ? p.code : ''
	);
}

/** One translated line per problem code; the backend's English is never shown. */
export function unitProblemText(code: string, msgs: Messages): string {
	switch (code) {
		case 'offsite_not_configured':
			return msgs.unit_problem_offsite_not_configured;
		case 'catalogue_dump_not_configured':
			return msgs.unit_problem_catalogue_dump_not_configured;
		case 'fisqua_not_configured':
			return msgs.unit_problem_fisqua_not_configured;
		case 'fisqua_unreachable':
			return msgs.unit_problem_fisqua_unreachable;
		case 'offsite_held':
			return msgs.unit_problem_offsite_held;
		case 'mode_changed':
			return msgs.unit_problem_mode_changed;
		case 'kept_volumes_decision':
			return msgs.unit_problem_kept_volumes_decision;
		default:
			return msgs.unit_problem_other;
	}
}

// ---------------------------------------------------------------------------
// Gates (enforced by the backend; the interface follows them)
// ---------------------------------------------------------------------------

function fisquaOperator(role: string | null | undefined, state: UnitState | null): boolean {
	return role === 'operator' && state?.mode === 'fisqua';
}

/** New volume: admin and operator, but no operator in Fisqua mode; the testing account in every mode. */
export function canCreateVolumes(
	role: string | null | undefined,
	state: UnitState | null
): boolean {
	if (inTestingSpace(role)) return true;
	return (role === 'admin' || role === 'operator') && !fisquaOperator(role, state);
}

// ---------------------------------------------------------------------------
// The testing account (NEH-391)
//
// The one place that decides what the testing role may do on every screen.
// The backend admits the account to its own routes only (app/core/space_routes.py)
// and answers every other one with a 403; these gates keep the screens from
// offering, or sending, anything it would refuse.
// ---------------------------------------------------------------------------

/** The signed-in account is the testing account: its screens carry the testing marker. */
export function inTestingSpace(role: string | null | undefined): boolean {
	return role === 'testing';
}

/** New project: the administrator, and the testing account for its own projects. */
export function canCreateProjects(role: string | null | undefined): boolean {
	return role === 'admin' || inTestingSpace(role);
}

/** Edit a volume from its row (the volume form): admin and operator. */
export function canEditVolumes(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'operator';
}

/** Delete a volume from its row: admin and operator, and the testing account in its own volumes. */
export function canDeleteVolumes(role: string | null | undefined): boolean {
	return canEditVolumes(role) || inTestingSpace(role);
}

/**
 * The volume form's file name stem, reference code, "keep on this unit" and
 * Fisqua lookup: every role but the testing account, whose volumes get their
 * stem from the backend and never have a reference code.
 */
export function setsVolumeCodes(role: string | null | undefined): boolean {
	return !inTestingSpace(role);
}

/** The capture screen and the volume page's Capture button: admin, operator and the testing account. */
export function canCapture(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'operator' || inTestingSpace(role);
}

/**
 * Controls that save the camera set-up on the unit: which camera is which,
 * orientation, focus, zoom, camera settings, white balance, calibration,
 * DSLR settings, rescan. Every role but the testing account; the capture
 * screen admits only admin and operator besides it.
 */
export function canSaveCameraSetup(role: string | null | undefined): boolean {
	return !inTestingSpace(role);
}

/**
 * The role takes part in the workflow of real work: review and record
 * status, the recapture turn and retake summaries, activity totals, Fisqua,
 * the offsite copy, handover and promotion, the bag export and capture
 * manifest, keep and release, project members, digitisation lists and the
 * unit's storage. Every role but the testing account; its screens neither
 * request nor show any of these.
 */
export function takesPartInWorkflow(role: string | null | undefined): boolean {
	return !inTestingSpace(role);
}

/** List import in Cola: admin and operator, but no operator in Fisqua mode. */
export function canImportList(role: string | null | undefined, state: UnitState | null): boolean {
	return (role === 'admin' || role === 'operator') && !fisquaOperator(role, state);
}

// ---------------------------------------------------------------------------
// The other roles' decisions on the screens of the testing slice, as those
// screens made them inline.
// ---------------------------------------------------------------------------

/** Review a record (mark errors, add notes, approve, reject): reviewer and admin. */
export function canReview(role: string | null | undefined): boolean {
	return role === 'reviewer' || role === 'admin';
}

/** Mark an opening missing in the grid: admin and operator. */
export function canMarkMissing(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'operator';
}

/** Add and remove a project's members: admin. */
export function canManageMembers(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** Delete a project: admin, and the testing account for its own testing projects. */
export function canDeleteProjects(role: string | null | undefined): boolean {
	return role === 'admin' || inTestingSpace(role);
}

/** Hand a volume over for review and take it back: admin and operator. */
export function canHandOver(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'operator';
}

/** Keep a volume on the unit or release it, open the offsite copy's settings: admin. */
export function canManageOffsite(role: string | null | undefined): boolean {
	return role === 'admin';
}

/**
 * Free a volume's space on the card, and open Settings > Storage with the
 * list of volumes that can be freed: admin and operator (NEH-380).
 */
export function canFreeVolumes(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'operator';
}

/** Restore a freed volume to the card: admin. */
export function canRestoreVolumes(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** Capture into an empty volume during the recapture turn anyway: admin. */
export function canOverrideRecaptureTurn(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** The Overview's camera test panels: admin and operator. */
export function canSeeCameraPanels(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'operator';
}

/** The new volume's "keep on this unit" box: admin. */
/**
 * Whether the role may copy a volume's pictures to a USB drive: the testing
 * account and the administrator, and only for a testing volume.
 */
export function canCopyToUsb(role: string | null | undefined, testingVolume: boolean): boolean {
	return testingVolume && (role === 'admin' || inTestingSpace(role));
}

export function canKeepOnUnit(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** In Fisqua mode, the volume form's Fisqua note, label and description search: admin. */
export function checksStemWithFisqua(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** Set password on the Users page, for another user: admin. */
export function setsUserPasswords(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** Change password in the account menu: every role but the testing account, whose password an admin sets. */
export function changesOwnPassword(role: string | null | undefined): boolean {
	return role !== null && role !== undefined && !inTestingSpace(role);
}

/** The Unit sections of Settings: admin (the testing account gets Power only, settings-sections.ts). */
export function opensUnitSettings(role: string | null | undefined): boolean {
	return role === 'admin';
}

/** The stem and reference code read-only in the volume form: an operator in Fisqua mode. */
export function volumeCodesReadOnly(
	role: string | null | undefined,
	state: UnitState | null
): boolean {
	return fisquaOperator(role, state);
}

/** Whether the interface shows projects; true when the state is not known. */
export function projectsShownIn(state: UnitState | null): boolean {
	return state?.projectsShown ?? true;
}

/**
 * Where a project page goes while projects are hidden: Volúmenes, carrying
 * `?editVolume=`; null while they are shown or the state is not known.
 */
export function hiddenProjectRedirect(
	state: UnitState | null,
	editVolume: string | null
): string | null {
	if (projectsShownIn(state)) return null;
	const id = Number(editVolume);
	return Number.isInteger(id) && id > 0
		? `/dashboard/volumes?editVolume=${id}`
		: '/dashboard/volumes';
}

/**
 * The capture screen's needs-stem banner: a link to the volume form (the
 * project page, or Volúmenes while projects are hidden), or, for an operator
 * in Fisqua mode, who cannot give a stem, a note instead; nothing without a
 * project and volume.
 */
export function stemFormTarget(
	role: string | null | undefined,
	state: UnitState | null,
	projectId: number,
	collectionId: number
): { href?: string; note?: true } {
	if (!projectId || !collectionId) return {};
	// The testing account gives no stem: the backend assigns it.
	if (!setsVolumeCodes(role)) return {};
	if (volumeCodesReadOnly(role, state)) return { note: true };
	return projectsShownIn(state)
		? { href: `/dashboard/projects/${projectId}?editVolume=${collectionId}` }
		: { href: `/dashboard/volumes?editVolume=${collectionId}` };
}

/** Where a volume page's back button goes. */
export function volumeBackPath(state: UnitState | null, projectId: number): string {
	return projectsShownIn(state) ? `/dashboard/projects/${projectId}` : '/dashboard/volumes';
}

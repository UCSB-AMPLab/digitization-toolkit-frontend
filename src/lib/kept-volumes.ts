// Keeping a volume on the unit, and releasing it (NEH-320): which action the
// volume page offers an administrator, and the message for each refusal of
// POST /collections/{id}/keep-on-unit and /release-from-unit
// (app/core/kept_volumes.py). The backend's English text is never shown.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`), as volume-errors.ts does.
//
// Version: 0.3.3

import type { Messages } from './i18n';
import type { VolumeOffsiteState } from '$lib/api';
import type { UnitMode } from './unit-mode';
import { fisquaRefusalText, fisquaVolumeRefusal } from './volume-errors';

export type KeptAction = 'keep' | 'release';

/**
 * The action an administrator gets beside the volume's offsite line: release
 * a kept volume; keep one that is not kept and has nothing verified or freed
 * offsite (the backend refuses the rest, and says why). Null for anyone
 * else, and for an older backend that sends no `kept_on_unit`.
 *
 * No release in Scanner only mode (`offline`): there Captua copies nothing
 * offsite, so the confirmation's text would not hold, and leaving the mode
 * already asks about every kept volume. The release is offered only once
 * the mode is known (not null) and is not offline. The keep, which the
 * backend allows in every mode, is offered whether the mode is known or not.
 */
export function keptActionOf(
	state: VolumeOffsiteState | null | undefined,
	isAdmin: boolean,
	mode: UnitMode | null = null
): KeptAction | null {
	if (!isAdmin || !state || typeof state.kept_on_unit !== 'boolean') return null;
	if (state.kept_on_unit) return mode !== null && mode !== 'offline' ? 'release' : null;
	if (state.verified > 0 || (state.freed_files ?? 0) > 0) return null;
	return 'keep';
}

/**
 * The message for a refused keep or release. A keep or a release applies to
 * the volume and every volume inside it; a release is refused with
 * `kept_parent` while the volume that holds this one is kept.
 * `kept_volumes_changed` (the volumes inside it changed during the request)
 * gets the generic message, which asks to try again.
 */
export function keptActionErrorText(error: unknown, msgs: Messages): string {
	const fisqua = fisquaVolumeRefusal(error);
	if (fisqua) return fisquaRefusalText(fisqua, msgs);
	if (typeof error === 'object' && error !== null) {
		const e = error as { status?: unknown; detail?: unknown };
		const code =
			typeof e.detail === 'object' && e.detail !== null ? (e.detail as { code?: unknown }).code : undefined;
		if (e.status === 409 && code === 'already_left_unit') return msgs.kept_err_already_left;
		if (e.status === 409 && code === 'already_kept_on_unit') return msgs.kept_err_already_kept;
		if (e.status === 409 && code === 'not_kept_on_unit') return msgs.kept_err_not_kept;
		if (e.status === 409 && code === 'kept_parent') return msgs.kept_err_kept_parent;
	}
	return msgs.kept_err_other;
}

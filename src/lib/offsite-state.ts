// The received indicator (NEH-248): what the volume view and Configuración
// say about the offsite copy of the image files.
//
// A volume's state comes from GET /collections/{id}/offsite
// (volume_upload_state in app/core/image_upload.py); the unit's from `images`
// on GET /system/catalogue-backup (unit_upload_summary in the same file).
// An object is verified, pending or refused; a refused object is one the
// bucket already held another file for at its key, which only an
// administrator can resolve, so it is shown as needing attention.
//
// A volume's verified objects can also be freed from the card (NEH-248,
// app/core/offsite_free.py): `freed_files` and `freed_bytes` count them, and
// a received volume with freed files is shown as stored offsite, with what
// was freed. A freed file is a healthy state, never an attention one.
//
// The module imports only types from the API client, so the wording is tested
// in the server project.

import type { Messages } from './i18n';
import type { UnitImageUploadSummary, VolumeOffsiteState } from '$lib/api';
import { dayRelation, formatBackupDate, formatBackupTime } from './catalogue-backup';
import { parseApiDate } from './pipeline';

export type { UnitImageUploadSummary, VolumeOffsiteState };

/** What the volume view holds: no answer yet, a failed request, or the answer. */
export type VolumeOffsiteSnapshot =
	| { kind: 'loading' }
	| { kind: 'failed' }
	| { kind: 'loaded'; state: VolumeOffsiteState };

export type VolumeOffsiteKind =
	| 'received'
	| 'freed'
	| 'uploading'
	| 'attention'
	| 'empty'
	| 'no_stem'
	| 'off'
	| 'misconfigured'
	| 'unknown';

/**
 * The unit's image copy: on, off, or misconfigured. The backend's
 * is_enabled() is false for an invalid tenant prefix too, so a reason in
 * `misconfigured` comes before `enabled`. Null when the backend sends no
 * image summary or it is not known yet.
 */
export type UnitUploadState = 'on' | 'off' | 'misconfigured';

export function unitUploadState(images: UnitImageUploadSummary | null | undefined): UnitUploadState | null {
	if (!images || typeof images.enabled !== 'boolean') return null;
	if (images.misconfigured) return 'misconfigured';
	return images.enabled ? 'on' : 'off';
}

export interface VolumeOffsiteView {
	kind: VolumeOffsiteKind;
	headline: string;
	/** "last verified today at 09:05"; null when no file has been verified. */
	lastVerified: string | null;
	/** What to do about refused files; null when there are none. */
	help: string | null;
	/** "412 files freed from the SD card (12.3 GB)"; null when none was freed. */
	freed: string | null;
}

function verifiedAt(iso: string | null): Date | null {
	if (typeof iso !== 'string') return null;
	const when = parseApiDate(iso);
	return Number.isNaN(when.getTime()) ? null : when;
}

function lastVerifiedArgs(iso: string | null, now: Date, locale: string) {
	const when = verifiedAt(iso);
	if (!when) return null;
	return [dayRelation(when, now), formatBackupDate(when, now, locale), formatBackupTime(when, locale)] as const;
}

/**
 * The volume's line. `unit` is unitUploadState of the unit's summary, or
 * null when it is not known; off or misconfigured means no file of any
 * volume is being copied, which the counts alone would not say.
 */
export function volumeOffsiteView(
	snapshot: VolumeOffsiteSnapshot,
	unit: UnitUploadState | null,
	now: Date,
	locale: string,
	msgs: Messages
): VolumeOffsiteView | null {
	if (snapshot.kind === 'loading') return null;
	if (snapshot.kind === 'failed') {
		return { kind: 'unknown', headline: msgs.offsite_vol_unknown, lastVerified: null, help: null, freed: null };
	}
	const s = snapshot.state;
	// Absent from a backend that predates freeing.
	const freedFiles = s.freed_files ?? 0;
	const freed = freedFiles > 0 ? msgs.offsite_vol_freed(freedFiles, s.freed_bytes ?? 0) : null;
	const only = (kind: VolumeOffsiteKind, headline: string): VolumeOffsiteView => ({
		kind,
		headline,
		lastVerified: null,
		help: null,
		freed
	});
	if (unit === 'misconfigured') return only('misconfigured', msgs.offsite_vol_misconfigured);
	if (unit === 'off') return only('off', msgs.offsite_vol_off);
	if (!s.uploadable) return only('no_stem', msgs.offsite_vol_no_stem);
	if (s.total === 0) return only('empty', msgs.offsite_vol_empty);

	const args = lastVerifiedArgs(s.last_verified_at, now, locale);
	const lastVerified = args ? msgs.offsite_last_verified(...args) : null;
	if (s.refused > 0) {
		return {
			kind: 'attention',
			headline: msgs.offsite_vol_attention(s.refused, s.verified, s.total, s.pending),
			lastVerified,
			help: msgs.offsite_attention_help,
			freed
		};
	}
	if (s.received && freed) return { kind: 'freed', headline: msgs.offsite_vol_stored, lastVerified, help: null, freed };
	if (s.received) return { kind: 'received', headline: msgs.offsite_vol_received(s.verified, s.total), lastVerified, help: null, freed };
	return { kind: 'uploading', headline: msgs.offsite_vol_uploading(s.verified, s.total, s.pending), lastVerified, help: null, freed };
}

export type UnitOffsiteLevel = 'received' | 'uploading' | 'attention' | 'empty' | 'off';

export interface UnitOffsiteView {
	level: UnitOffsiteLevel;
	lines: string[];
}

/** The unit's lines for Configuración, or null when the backend sends no image summary. */
export function unitOffsiteView(
	images: UnitImageUploadSummary | null | undefined,
	now: Date,
	locale: string,
	msgs: Messages
): UnitOffsiteView | null {
	const state = unitUploadState(images);
	if (!images || state === null) return null;
	if (state === 'misconfigured') return { level: 'attention', lines: [msgs.offsite_unit_misconfigured] };
	if (state === 'off') return { level: 'off', lines: [msgs.offsite_unit_off] };
	if (images.total === 0) return { level: 'empty', lines: [msgs.offsite_unit_empty] };

	const lines = [
		msgs.offsite_unit_volumes(images.volumes_received, images.volumes),
		msgs.offsite_unit_files(images.verified, images.total, images.pending)
	];
	if (images.refused > 0) lines.push(msgs.offsite_unit_refused(images.refused), msgs.offsite_attention_help);
	const args = lastVerifiedArgs(images.last_verified_at, now, locale);
	lines.push(args ? msgs.offsite_cfg_last_verified(...args) : msgs.offsite_cfg_never);

	const level: UnitOffsiteLevel =
		images.refused > 0 ? 'attention' : images.verified === images.total ? 'received' : 'uploading';
	return { level, lines };
}

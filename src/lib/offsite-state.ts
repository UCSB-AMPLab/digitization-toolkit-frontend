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

export type VolumeOffsiteKind = 'received' | 'uploading' | 'attention' | 'empty' | 'no_stem' | 'off' | 'unknown';

export interface VolumeOffsiteView {
	kind: VolumeOffsiteKind;
	headline: string;
	/** "last verified today at 09:05"; null when no file has been verified. */
	lastVerified: string | null;
	/** What to do about refused files; null when there are none. */
	help: string | null;
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
 * The volume's line. `unitEnabled` is the unit's `images.enabled`, or null
 * when it is not known; false means no file of any volume is being copied,
 * which the counts alone would not say.
 */
export function volumeOffsiteView(
	snapshot: VolumeOffsiteSnapshot,
	unitEnabled: boolean | null,
	now: Date,
	locale: string,
	msgs: Messages
): VolumeOffsiteView | null {
	if (snapshot.kind === 'loading') return null;
	const only = (kind: VolumeOffsiteKind, headline: string): VolumeOffsiteView => ({
		kind,
		headline,
		lastVerified: null,
		help: null
	});
	if (snapshot.kind === 'failed') return only('unknown', msgs.offsite_vol_unknown);
	const s = snapshot.state;
	if (unitEnabled === false) return only('off', msgs.offsite_vol_off);
	if (!s.uploadable) return only('no_stem', msgs.offsite_vol_no_stem);
	if (s.total === 0) return only('empty', msgs.offsite_vol_empty);

	const args = lastVerifiedArgs(s.last_verified_at, now, locale);
	const lastVerified = args ? msgs.offsite_last_verified(...args) : null;
	if (s.refused > 0) {
		return {
			kind: 'attention',
			headline: msgs.offsite_vol_attention(s.refused, s.verified, s.total, s.pending),
			lastVerified,
			help: msgs.offsite_attention_help
		};
	}
	if (s.received) return { kind: 'received', headline: msgs.offsite_vol_received(s.verified, s.total), lastVerified, help: null };
	return { kind: 'uploading', headline: msgs.offsite_vol_uploading(s.verified, s.total, s.pending), lastVerified, help: null };
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
	if (!images || typeof images.enabled !== 'boolean') return null;
	if (!images.enabled) return { level: 'off', lines: [msgs.offsite_unit_off] };
	if (images.misconfigured) return { level: 'attention', lines: [msgs.offsite_unit_misconfigured] };
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

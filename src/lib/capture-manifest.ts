// The capture manifest download for Fisqua: GET /collections/{id}/capture-manifest
// (export_capture_manifest in app/api/collections.py, built by
// app/core/capture_manifest.py).
//
// - Admins and operators only (allow_contributor), as with sending for review:
//   the manifest is how a handed-over volume reaches Fisqua.
// - 200 is the JSON file, with Content-Disposition naming it
//   capture-manifest_<stem>_<YYYY-MM-DD>.json (download_name). The header is
//   readable only same-origin (through nginx on the unit): the backend's CORS
//   setup does not expose it, so on a cross-origin dev stack the name is built
//   from the body the same way download_name builds it.
// - 409 is a refusal, with detail {message, problems: [{rule, message,
//   record_ids, image_ids}]}. The backend's texts are English, so each known
//   rule is shown from the catalogue, with its record ids; a rule this build
//   does not know gets a generic line, never the backend's text.
// - 404 is a volume the backend cannot find.
//
// No import of api.ts, so the tests run in plain node.

import type { Messages } from './i18n';

/** The roles allow_contributor admits (app/api/collections.py). */
const ALLOWED_ROLES = ['admin', 'operator'];

/** RULES in app/core/capture_manifest.py, in the order problems are reported. */
export const CAPTURE_MANIFEST_RULES = [
	'tenant_missing',
	'tenant_invalid',
	'no_stem',
	'no_project',
	'records_captured',
	'sequence_missing',
	'sequence_repeated',
	'roles_invalid',
	'capture_id_missing',
	'not_uploaded',
	'preview_not_uploaded',
	'raw_without_preview',
	'upload_refused',
	'key_outside',
	'filename_form',
	'page_key_repeated',
	'sha256_missing',
	'preview_sha256_missing',
	'no_pages'
] as const;

/**
 * Not a capture_manifest rule: the problem app/core/fisqua_outbox.py records,
 * in the same shape, on a handover of a volume with no Fisqua reference code
 * (NO_REFERENCE_CODE_PROBLEM). Shown on the volume's Fisqua line.
 */
export const FISQUA_OUTBOX_RULES = ['no_reference_code'] as const;

type Rule = (typeof CAPTURE_MANIFEST_RULES)[number] | (typeof FISQUA_OUTBOX_RULES)[number];

const KNOWN_RULES: readonly string[] = [...CAPTURE_MANIFEST_RULES, ...FISQUA_OUTBOX_RULES];

const FALLBACK_NAME = 'capture-manifest.json';

export function canDownloadCaptureManifest(role: string | null | undefined): boolean {
	return typeof role === 'string' && ALLOWED_ROLES.includes(role);
}

function baseName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? '';
	return base.trim();
}

/**
 * The file name to save the manifest under: the server's, from
 * Content-Disposition; otherwise the one download_name would give, from the
 * body's stem and generatedAt (the same instant, in UTC); otherwise a plain name.
 */
export function captureManifestFilename(contentDisposition: string | null, bodyText: string): string {
	const match = contentDisposition?.match(/filename="([^"]+)"/i) ?? contentDisposition?.match(/filename=([^;]+)/i);
	if (match) {
		const name = baseName(match[1]);
		if (name) return name;
	}
	try {
		const doc = JSON.parse(bodyText) as { generatedAt?: unknown; volumes?: { stem?: unknown }[] };
		const stem = doc?.volumes?.[0]?.stem;
		const date = typeof doc?.generatedAt === 'string' ? doc.generatedAt.slice(0, 10) : '';
		if (typeof stem === 'string' && stem && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
			const name = baseName(`capture-manifest_${stem}_${date}.json`);
			if (name) return name;
		}
	} catch {
		// Not JSON: the plain name below.
	}
	return FALLBACK_NAME;
}

function ruleText(rule: Rule, msgs: Messages): string {
	switch (rule) {
		case 'tenant_missing':
			return msgs.col_manifest_rule_tenant_missing;
		case 'tenant_invalid':
			return msgs.col_manifest_rule_tenant_invalid;
		case 'no_stem':
			return msgs.col_manifest_rule_no_stem;
		case 'no_project':
			return msgs.col_manifest_rule_no_project;
		case 'records_captured':
			return msgs.col_manifest_rule_records_captured;
		case 'sequence_missing':
			return msgs.col_manifest_rule_sequence_missing;
		case 'sequence_repeated':
			return msgs.col_manifest_rule_sequence_repeated;
		case 'roles_invalid':
			return msgs.col_manifest_rule_roles_invalid;
		case 'capture_id_missing':
			return msgs.col_manifest_rule_capture_id_missing;
		case 'not_uploaded':
			return msgs.col_manifest_rule_not_uploaded;
		case 'preview_not_uploaded':
			return msgs.col_manifest_rule_preview_not_uploaded;
		case 'raw_without_preview':
			return msgs.col_manifest_rule_raw_without_preview;
		case 'upload_refused':
			return msgs.col_manifest_rule_upload_refused;
		case 'key_outside':
			return msgs.col_manifest_rule_key_outside;
		case 'filename_form':
			return msgs.col_manifest_rule_filename_form;
		case 'page_key_repeated':
			return msgs.col_manifest_rule_page_key_repeated;
		case 'sha256_missing':
			return msgs.col_manifest_rule_sha256_missing;
		case 'preview_sha256_missing':
			return msgs.col_manifest_rule_preview_sha256_missing;
		case 'no_pages':
			return msgs.col_manifest_rule_no_pages;
		case 'no_reference_code':
			return msgs.col_manifest_rule_no_reference_code;
	}
}

export interface ManifestProblemView {
	rule: string;
	text: string;
	/** The records concerned, as a line; null when the problem is about the volume or the unit. */
	records: string | null;
}

export interface ManifestRefusalView {
	problems: ManifestProblemView[];
}

function statusOf(error: unknown): unknown {
	return error instanceof Error ? (error as Error & { status?: unknown }).status : undefined;
}

/**
 * Problems in the capture_manifest shape ({rule, message, record_ids,
 * image_ids}), in the catalogue's words: a known rule from the catalogue, with
 * its record ids; a rule this build does not know gets a generic line, never
 * the backend's text. Malformed entries are skipped.
 */
export function manifestProblemViews(problems: unknown[], msgs: Messages): ManifestProblemView[] {
	const views: ManifestProblemView[] = [];
	for (const p of problems) {
		if (typeof p !== 'object' || p === null) continue;
		const { rule, record_ids } = p as { rule?: unknown; record_ids?: unknown };
		if (typeof rule !== 'string') continue;
		const text = KNOWN_RULES.includes(rule) ? ruleText(rule as Rule, msgs) : msgs.col_manifest_rule_other;
		const ids = Array.isArray(record_ids)
			? [...new Set(record_ids.filter((id): id is number => Number.isInteger(id)))].sort((a, b) => a - b)
			: [];
		views.push({ rule, text, records: ids.length > 0 ? msgs.col_manifest_records(ids) : null });
	}
	return views;
}

/** The problems of a 409 refusal, in the catalogue's words, or null for any other error. */
export function captureManifestRefusal(error: unknown, msgs: Messages): ManifestRefusalView | null {
	if (statusOf(error) !== 409) return null;
	const detail = (error as { detail?: unknown }).detail;
	const problems = typeof detail === 'object' && detail !== null ? (detail as { problems?: unknown }).problems : undefined;
	if (!Array.isArray(problems)) return null;
	return { problems: manifestProblemViews(problems, msgs) };
}

/** The message for a failed download that is not a refusal. */
export function captureManifestErrorText(error: unknown, msgs: Messages): string {
	if (statusOf(error) === 404) return msgs.col_manifest_err_not_found;
	return msgs.col_manifest_err;
}

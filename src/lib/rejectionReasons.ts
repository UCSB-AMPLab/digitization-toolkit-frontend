// Single source of truth for the 9 predefined rejection/error reasons,
// shared between the QA annotation feature (LeftSidebar.svelte) and the
// NEH-209 reject form (RejectReasonModal.svelte). Mirrors the backend's
// PREDEFINED_REJECTION_REASONS (app/schemas/record.py).
//
// `rejectionReasonText` gives each reason's label and gloss from the
// catalogue, for every screen that names a reason.
//
// Version: 0.2.0
import type { PredefinedRejectionReason } from './api';
import type { Messages } from './i18n';

export interface RejectionReasonDef {
  id: PredefinedRejectionReason;
  color: string;
}

export const REJECTION_REASONS: RejectionReasonDef[] = [
  { id: 'blur', color: '#bc823c' },
  { id: 'glare', color: '#c05a44' },
  { id: 'shadow', color: '#8b7355' },
  { id: 'focus', color: '#7ba3a3' },
  { id: 'exposure', color: '#c4a052' },
  { id: 'dirt', color: '#a85e78' },
  // framing: a page cut off or badly framed. obstruction: a finger, a
  // weight or another object in the shot. other: anything else, which
  // needs a note.
  { id: 'framing', color: '#6b8fb5' },
  { id: 'obstruction', color: '#9a7bb0' },
  { id: 'other', color: '#8a8a8a' },
];

// The catalogue keys of each reason's label and its one-line gloss.
const REASON_KEYS: { [K in PredefinedRejectionReason]: { label: keyof Messages; gloss: keyof Messages } } = {
  blur: { label: 'col_err_blurry', gloss: 'col_err_blurry_gloss' },
  glare: { label: 'col_err_glare', gloss: 'col_err_glare_gloss' },
  shadow: { label: 'col_err_shadows', gloss: 'col_err_shadows_gloss' },
  focus: { label: 'col_err_focus', gloss: 'col_err_focus_gloss' },
  exposure: { label: 'col_err_exposure', gloss: 'col_err_exposure_gloss' },
  dirt: { label: 'col_err_debris', gloss: 'col_err_debris_gloss' },
  framing: { label: 'col_err_framing', gloss: 'col_err_framing_gloss' },
  obstruction: { label: 'col_err_obstruction', gloss: 'col_err_obstruction_gloss' },
  other: { label: 'col_err_other', gloss: 'col_err_other_gloss' },
};

/**
 * A reason's label and gloss in the catalogue `m`. A code the backend sends
 * that is not one of the nine is shown as it comes, with no gloss.
 */
export function rejectionReasonText(m: Messages, id: string): { label: string; gloss: string | null } {
  const keys = (REASON_KEYS as { [id: string]: { label: keyof Messages; gloss: keyof Messages } | undefined })[id];
  if (!keys) return { label: id, gloss: null };
  return { label: m[keys.label] as string, gloss: m[keys.gloss] as string };
}

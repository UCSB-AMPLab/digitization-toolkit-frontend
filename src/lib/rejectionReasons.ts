// Single source of truth for the 9 predefined rejection/error reasons,
// shared between the QA annotation feature (LeftSidebar.svelte) and the
// NEH-209 reject form (RejectReasonModal.svelte). Mirrors the backend's
// PREDEFINED_REJECTION_REASONS (app/schemas/record.py).
//
// Version: 0.1.0-beta
import type { PredefinedRejectionReason } from './api';

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

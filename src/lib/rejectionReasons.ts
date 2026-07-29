// Single source of truth for the 6 predefined rejection/error reasons,
// shared between the QA annotation feature (LeftSidebar.svelte) and the
// NEH-209 reject form (RejectReasonModal.svelte). Mirrors the backend's
// PREDEFINED_REJECTION_REASONS (app/schemas/record.py).
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
];

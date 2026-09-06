// Classifies the Canon `focusmode` widget value the backend reports for a
// DSLR so the UI can warn when the lens is not actually set to MF, instead
// of only telling the operator to set it there (NEH-76).
//
// Kept free of api.ts (like capture-outcome.ts) so this stays a plain node test.

export type FocusModeKind = 'manual' | 'auto' | 'unknown';

export function describeFocusMode(mode: string | null | undefined): FocusModeKind {
	const trimmed = mode?.trim().toLowerCase();
	if (!trimmed) return 'unknown';
	if (trimmed === 'manual' || trimmed === 'mf') return 'manual';
	return 'auto';
}

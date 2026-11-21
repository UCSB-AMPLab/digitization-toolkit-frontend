// The rule the backend holds every new password to (app/schemas/user.py,
// check_new_password): at least PASSWORD_MIN_LENGTH characters, counted as
// typed, with no trimming. The create-user form and the set-password and
// change-password dialogs check it before they send, and show the backend's
// `password_too_short` refusal with the same message
// (common_password_too_short). Characters are counted as the backend counts
// them, by code point, so an emoji is one character, not two UTF-16 units.

export const PASSWORD_MIN_LENGTH = 8;

/** Whether a new password is shorter than the rule allows. */
export function passwordTooShort(password: string): boolean {
	return [...password].length < PASSWORD_MIN_LENGTH;
}

/** Whether a failed request is the backend's `password_too_short` refusal. */
export function isPasswordTooShortRefusal(error: unknown): boolean {
	const detail = (error as { detail?: unknown } | null)?.detail;
	return typeof detail === 'object' && detail !== null && (detail as { code?: unknown }).code === 'password_too_short';
}

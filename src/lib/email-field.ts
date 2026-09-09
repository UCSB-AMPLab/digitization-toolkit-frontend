// NEH-162: the appliance is offline and nothing verifies an address, so the
// email field is optional across setup and user forms. A value that is
// given still has to look like an email.

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes a raw form value into what the API expects: a trimmed address,
 * or null when nothing was entered.
 */
export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * True only when a non-empty value fails to look like an email address. An
 * empty value is not an error — the field is optional.
 */
export function emailFormatError(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return false;
  return !EMAIL_FORMAT.test(trimmed);
}

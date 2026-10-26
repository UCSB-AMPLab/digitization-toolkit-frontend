// Redacts secrets in text captured for the bug report (NEH-94): masks email
// addresses, JWTs, GitHub tokens and Bearer values.
//
// Version: 0.1.0-beta

const PATTERNS: Array<[RegExp, string]> = [
  // JWT: eyJ... . ... . ...
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[jwt]'],
  // GitHub tokens (classic PATs)
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '[token]'],
  // GitHub fine-grained tokens
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[token]'],
  // Authorization: Bearer <token>
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  // Email addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
];

/** Returns the text with common secrets masked. */
export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
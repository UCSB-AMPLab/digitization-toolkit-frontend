// Redacción de secretos en texto capturado para el reporte de errores (NEH-94).
// Enmascara correos electrónicos, JWT, tokens de GitHub (PAT) y valores Bearer.

const PATTERNS: Array<[RegExp, string]> = [
  // JWT: eyJ... . ... . ...
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[jwt]'],
  // Tokens de GitHub (PAT clásicos)
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '[token]'],
  // Tokens de GitHub de grano fino
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[token]'],
  // Authorization: Bearer <token>
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  // Correos electrónicos
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
];

/** Devuelve el texto con los secretos comunes enmascarados. */
export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
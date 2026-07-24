import { redact } from './redact';

export interface CapturedError {
  time: string; // ISO
  kind: 'error' | 'unhandledrejection' | 'console.error';
  message: string; // ya redactado
}

const MAX_ENTRIES = 25;
const buffer: CapturedError[] = [];
let installed = false;

function push(kind: CapturedError['kind'], raw: string) {
  const message = redact(raw).slice(0, 500);
  buffer.push({ time: new Date().toISOString(), kind, message });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

/** Copia de los errores recientes capturados (ya redactados). */
export function getRecentErrors(): CapturedError[] {
  return [...buffer];
}

/** Instala los hooks de captura. Seguro de llamar varias veces. */
export function initErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    const msg = e.error?.stack || e.message || String(e.error ?? 'error');
    push('error', msg);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    const msg = reason?.stack || reason?.message || String(reason ?? 'unhandledrejection');
    push('unhandledrejection', msg);
  });

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const text = args
        .map((a) => {
          if (a instanceof Error) return a.stack || a.message;
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(' ');
      push('console.error', text);
    } catch { /* nunca romper por el logging */ }
    origError(...args);
  };
}
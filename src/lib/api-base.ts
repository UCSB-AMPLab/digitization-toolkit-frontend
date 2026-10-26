// The one API base for the app: every request and every URL handed to an
// <img>, a link or a download starts with it. The values come from dynamic env
// vars, so one image serves every unit; docker-compose sets them.
//
// On the appliance PUBLIC_API_BASE is relative ('/api'): the browser calls the
// API through nginx on the page's own origin, so the unit works by whatever
// name or address the page was opened with (captua.local, digitool.local, its
// IP, localhost in the kiosk). The dev stack sets an absolute base, since Vite
// on :5173 has no nginx in front of it. Server-side rendering runs in Node,
// where a relative URL has no origin to resolve against, so it uses
// PUBLIC_API_BASE_SSR, or PUBLIC_API_BASE only when that is absolute.
//
// Version: 0.1.0-beta
export const DEFAULT_API_BASE = 'http://localhost:8000';

export interface ApiBaseEnv {
  PUBLIC_API_BASE?: string;
  PUBLIC_API_BASE_SSR?: string;
}

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function resolveApiBase(inBrowser: boolean, vars: ApiBaseEnv): string {
  if (inBrowser) return vars.PUBLIC_API_BASE || DEFAULT_API_BASE;
  if (vars.PUBLIC_API_BASE_SSR) return vars.PUBLIC_API_BASE_SSR;
  if (vars.PUBLIC_API_BASE && isAbsoluteUrl(vars.PUBLIC_API_BASE)) return vars.PUBLIC_API_BASE;
  return DEFAULT_API_BASE;
}

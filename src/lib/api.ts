// Version: 0.3.3

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { env } from '$env/dynamic/public';
import { get } from 'svelte/store';
import { resolveApiBase } from './api-base';
import { readPairingStatus, type PairingStatus } from './fisqua-pairing';
import { m } from './i18n';
import { authStore } from './stores/auth';
import { sessionRenewals } from './session-keepalive';

/**
 * Centralized API client for Digitization Toolkit
 * Handles authentication, documents, images, projects, and cameras
 */

// See api-base.ts for which base applies where.
export function getApiBase(): string {
  return resolveApiBase(browser, env);
}

// The session is an httpOnly cookie the backend sets at login (NEH-61). No
// script reads it, and no URL carries a token. The browser attaches the cookie
// to a fetch made with credentials: 'include' (needed in development, where
// the API is on another origin) and, by itself, to <img src> and download
// links. The backend refuses a cookie-authenticated request whose method is
// not GET, HEAD or OPTIONS unless it carries X-Requested-With (its CSRF
// check); every request from here carries it.
// How long Salir waits for POST /auth/logout before it clears the local
// session anyway, so a backend that accepts the connection and never answers
// cannot leave the operator looking signed in.
export const LOGOUT_TIMEOUT_MS = 5000;

export const CSRF_HEADER = 'X-Requested-With';
const CSRF_HEADER_VALUE = 'XMLHttpRequest';

type HeaderMap = { [key: string]: string };

// Header pairs from any HeadersInit form: a plain object, an array of pairs,
// or a Headers object (whose names come back lower-cased).
function headerPairs(headers: HeadersInit | undefined): [string, string][] {
  if (!headers) return [];
  if (headers instanceof Headers) {
    const pairs: [string, string][] = [];
    headers.forEach((value, name) => pairs.push([name, value]));
    return pairs;
  }
  if (Array.isArray(headers)) return headers.map(([name, value]) => [name, value]);
  return Object.entries(headers);
}

// Merges header sets into one plain object, later sets winning. Names are
// compared without case, as HTTP compares them, so no header goes out twice.
function mergeHeaders(...sets: (HeadersInit | undefined)[]): HeaderMap {
  const out: HeaderMap = {};
  for (const set of sets) {
    for (const [name, value] of headerPairs(set)) {
      for (const existing of Object.keys(out)) {
        if (existing.toLowerCase() === name.toLowerCase()) delete out[existing];
      }
      out[name] = value;
    }
  }
  return out;
}

// RequestInit for a fetch to the API outside apiRequest() (camera preview
// polling, the image ZIP download, the image probes, logout): it sends the
// session cookie and the CSRF header and keeps the caller's other options and
// headers.
export function sessionRequestInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    credentials: 'include',
    headers: mergeHeaders(init.headers, { [CSRF_HEADER]: CSRF_HEADER_VALUE })
  };
}

// Thrown for 401/403 responses so callers that care can distinguish an
// auth failure from any other API error (most existing catch blocks just
// read `.message`, which still works since this extends Error).
// `detail` is the response's structured detail when it had one, as on
// ApiError: the 403 for an operator in Fisqua mode carries
// `{code: "volumes_from_fisqua", message}` (NEH-311). Undefined for a
// string detail, which every 401 has.
export class AuthError extends Error {
  status: number;
  detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.detail = detail;
  }
}

// Thrown for any other non-ok response so callers that need the raw
// `detail` payload (e.g. the export endpoint's structured
// `{ message, blocking_record_ids }` body) can inspect it, while
// `.message` still reads as a normal string for existing catch blocks
// that only care about the text (most of them).
//
// `status` is the HTTP status of the response, so a caller can tell a 429
// (login throttle) or a 5xx (backend still booting behind Nginx) from any
// other failure. `retryAfter` is the raw `Retry-After` header, or null when
// the response had none or the browser did not expose it.
export class ApiError extends Error {
  detail?: unknown;
  status?: number;
  retryAfter: string | null;
  constructor(message: string, detail?: unknown, status?: number, retryAfter: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.detail = detail;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// Endpoints where a 401 means "bad input" (wrong credentials, wrong old
// password), not "your session is dead" — there's either no session yet or
// the session is perfectly valid, so these must NOT trigger the global
// clear-session-and-redirect below.
const SESSION_EXEMPT_ENDPOINTS = ['/auth/login', '/auth/password-reset'];

// Whether a failed response means this tab's session is dead and must be
// cleared. Shared by apiRequest() and apiRequestBlob(); the reasoning is in
// the comment above its use in apiRequest().
function isDeadSession(status: number, endpoint: string): boolean {
  if (status !== 401) return false;
  if (SESSION_EXEMPT_ENDPOINTS.some(p => endpoint.startsWith(p))) return false;
  return authStore.isAuthenticated();
}

// Time limits for requests made through apiRequest() and apiRequestBlob()
// (NEH-356). A request with no complete answer by then is aborted and
// rejects with a TimeoutError whose message is the existing "request failed"
// text, so a caller's handling of a failed fetch applies to it. A call passes
// `timeoutMs` to use another limit; a caller's own `signal` still cancels the
// request, with its own reason.
//
// On the appliance every request goes through nginx, whose
// proxy_read_timeout is 120 s, and 300 s for POST /cameras/capture and
// /cameras/capture/dual: a backend still silent by then has been answered
// with a 504, which the caller sees as an ApiError with status 504.
// A limit above 120 s ends only a request that nothing answers at all (nginx
// down, a dropped link), or one made straight to the backend in development.
// A limit below 120 s (REQUEST_TIMEOUT_MS, HEALTH_REQUEST_TIMEOUT_MS,
// SESSION_REFRESH_TIMEOUT_MS, POWER_REQUEST_TIMEOUT_MS) can end a request the
// backend is still working on: the caller sees the TimeoutError, and the
// backend may still complete the work, so a change can be made although the
// page reported a failure.
//
// REQUEST_TIMEOUT_MS: requests that only read or write the catalogue.
export const REQUEST_TIMEOUT_MS = 60_000;
// Requests that wait on Fisqua (a code check: 10 s to connect, 60 s to read;
// a change of unit mode: up to two such calls), on the offsite bucket, on a
// system command, on files moved on disk, on one transaction over a whole
// volume, or on an upload.
export const SLOW_REQUEST_TIMEOUT_MS = 150_000;
// Every /cameras request. On the backend a capture can take about 225 s per
// camera before any wait for the camera's lock, and any other camera request
// waits for that lock while a capture holds it; behind nginx such a request
// is answered with a 504 at 120 s, a capture at 300 s, the same moment as
// this limit. Either timeout of a capture sends the capture screen into its
// check of the records (src/lib/capture-check.ts). For the other camera
// requests this limit exists only to free the screen when nothing answers
// at all.
export const CAMERA_REQUEST_TIMEOUT_MS = 300_000;
// GET /health answers at once; the login page and the wait after a reboot
// ask it again when it fails.
export const HEALTH_REQUEST_TIMEOUT_MS = 15_000;
// POST /auth/refresh answers at once. Short because a sign-out waits for a
// renewal in flight before it sends its logout (see signOut below): a
// renewal nobody answers holds a sign-out back by at most this.
export const SESSION_REFRESH_TIMEOUT_MS = 10_000;
// POST /system/power answers once the order is logged; the helper that
// carries it out (bounded at 30 s) runs after the answer.
export const POWER_REQUEST_TIMEOUT_MS = 60_000;

// `timeoutMs`: the limit in milliseconds. A value that is not a positive
// finite number (Infinity, NaN, 0, a negative number, null) means
// REQUEST_TIMEOUT_MS.
export type ApiRequestOptions = RequestInit & { timeoutMs?: number };

function timeLimit(timeoutMs: unknown): number {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : REQUEST_TIMEOUT_MS;
}

// Runs `send` with a signal that aborts after the limit or when the caller's
// signal aborts, and settles at either even if `send` is still reading a
// body. The timer is cleared however `send` ends. Exported for the requests
// that call fetch directly and for tests.
export async function withTimeLimit<T>(
  options: ApiRequestOptions,
  send: (init: RequestInit) => Promise<T>
): Promise<T> {
  const { timeoutMs, signal: callerSignal, ...init } = options;
  const controller = new AbortController();
  const timedOut = new DOMException(get(m).api_request_failed, 'TimeoutError');
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => controller.abort(timedOut), timeLimit(timeoutMs));
  const aborted = new Promise<never>((_resolve, reject) => {
    if (controller.signal.aborted) reject(controller.signal.reason);
    controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
  });
  try {
    return await Promise.race([send({ ...init, signal: controller.signal }), aborted]);
  } catch (error) {
    // An older fetch rejects an aborted request with its own AbortError
    // rather than the signal's reason.
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

// Sign-out is the last auth request this tab sends (NEH-355).
//
// Three requests change the session cookie, all sent from authApi: POST
// /auth/login and POST /auth/refresh set it, POST /auth/logout deletes it
// (app/api/auth.py: login, refresh_token, logout; no other endpoint sets or
// deletes it). A refresh processed after the logout would leave a valid
// eight-hour cookie in a tab that shows nobody signed in, so each sign-out
// sends its logout only once no refresh of this tab is in flight or can
// start, and no login of this tab is sent before that logout has ended:
//
// - Refresh is sent only by the keepalive, through sessionRenewals, which
//   starts no renewal once stop() has been called, until resume(); the
//   only caller of authApi.refreshSession() is that keepalive
//   (routes/+layout.svelte). Every sign-out calls stop() before it sends any
//   request and waits for the renewal in flight at that moment to settle. It
//   settles when its answer has been read, or when SESSION_REFRESH_TIMEOUT_MS
//   aborts it. The browser stores a
//   Set-Cookie when the response headers arrive and reads no response of an
//   aborted request, so whatever cookie that refresh brings is stored before
//   the logout is sent.
// - Login (authApi.login) first waits for every sign-out begun before it
//   (pendingSignOut), so its cookie comes after their logouts; only then does
//   it resume renewals.
// - The sign-outs are authApi.logout() (Salir in AccountMenu; the login page
//   closing a session whose role it does not know) and endRejectedSession(),
//   the sign-out for a session the backend has rejected: apiRequest() and
//   apiRequestBlob() call it on a 401 (through endDeadSession(), which also
//   goes to /login), and the dashboard layout calls it when /users/me answers
//   401 or 403 and the record is still set. It clears this tab's record at
//   once and sends a logout only when a renewal was in flight: the backend
//   has just refused the cookie, so without a renewal there is no valid
//   cookie to delete; a renewal sent before the refusal may still bring a
//   new one, and the logout follows it. No other code clears the record of
//   the session.
//
// This orders the requests of one tab only. On sign-out the backend ends
// every session of the user (the testing account excepted, which several
// people share), so another tab, or a request replayed with an earlier
// cookie, is refused afterwards. The cookie is shared by the tabs of one
// browser, so a logout this tab sends late also deletes the cookie of a
// sign-in made meanwhile in another tab, and ends that session too when it
// is the same user's.
let pendingSignOut: Promise<void> = Promise.resolve();

// A sign-out that fails still counts as ended: a rejection kept in
// pendingSignOut would make every later sign-in of this page fail.
function signOut(work: Promise<void>): Promise<void> {
  const ended = work.catch(() => undefined);
  pendingSignOut = Promise.all([pendingSignOut, ended]).then(() => undefined);
  return work;
}

// POST /auth/logout, ended after LOGOUT_TIMEOUT_MS. Never rejects: with the
// backend unreachable or too slow, nothing more can be done from the page.
async function sendLogoutRequest(): Promise<void> {
  try {
    await withTimeLimit({ timeoutMs: LOGOUT_TIMEOUT_MS }, (init) =>
      fetch(`${getApiBase()}/auth/logout`, sessionRequestInit({ ...init, method: 'POST' }))
    );
  } catch {
    // The cookie then stays until it expires.
  }
}

// The sign-out for a session the backend has rejected (see the comment above).
export function endRejectedSession(): void {
  authStore.clearSession();
  signOut(sessionRenewals.stop().then((wasInFlight) => (wasInFlight ? sendLogoutRequest() : undefined)));
}

// The sign-out on a 401 that means this tab's session is dead (isDeadSession),
// and after the user's own password change, which has ended every session of
// the user, this one included.
export function endDeadSession(): void {
  endRejectedSession();
  if (!window.location.pathname.startsWith('/login')) {
    goto('/login');
  }
}

// API request helper with authentication
function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  return withTimeLimit(options, (init) => sendApiRequest<T>(endpoint, init));
}

async function sendApiRequest<T>(
  endpoint: string,
  options: RequestInit
): Promise<T> {
  const base = getApiBase();

  // A FormData body (a file upload) goes without a Content-Type, so the
  // browser writes the multipart one with its boundary.
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const response = await fetch(`${base}${endpoint}`, sessionRequestInit({
    ...options,
    headers: mergeHeaders(isMultipart ? {} : { 'Content-Type': 'application/json' }, options.headers)
  }));

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: get(m).api_request_failed }));
    const detail = errorData.detail || `HTTP ${response.status}`;
    // Some endpoints (e.g. the export blockers check) return a structured
    // `detail` object instead of a string. Stringifying that object
    // directly would throw "[object Object]" at callers, so pull out a
    // readable message while keeping the raw detail available via ApiError.
    const isStructuredDetail = typeof detail === 'object' && detail !== null;
    const message = isStructuredDetail
      ? (detail as { message?: string }).message || JSON.stringify(detail)
      : String(detail);

    // 401 means the session cookie is missing/invalid/expired (or its user
    // was deactivated) — the session is genuinely dead, so clear it globally.
    // Unless this tab had no session at all, which isDeadSession() checks.
    // A 401 cannot mean "your session died" when there was no session, and
    // reading it that way broke first-run setup: POST /auth/register on the
    // first-user path 401s on a wrong bootstrap token (auth.py), the
    // redirect fired, and the operator landed on /login — which on a fresh
    // appliance has no account to log into. The setup page has handled that
    // 401 all along and never got to render it.
    // Logging out in another tab clears the cookie for every tab but leaves
    // this tab's authStore holding the old user, which the route guards read.
    // The next request then gets a 401 while this tab still shows itself as
    // signed in; the user in authStore counts as a session here, so that 401
    // clears it.
    // 403 means the session is fine but the role/permission check for this one
    // action failed (RoleChecker and every per-resource permission check in
    // the backend run strictly after get_current_user, which is what raises
    // 401 — so a 403 nearly always means a valid, active session. The
    // exceptions are POST /auth/login, which returns 403 for an inactive user
    // with no session at all, and POST /auth/register, which returns 403 when
    // the caller's otherwise valid session belongs to an inactive user; and
    // the backend's CSRF check returns 403 for a cookie-authenticated state
    // change without X-Requested-With. All are harmless here, because a 403
    // never clears the session). Treating it the same as a dead session would silently log a
    // user out of a perfectly good session over a single denied action, and
    // would swallow the inline "you can't do that" errors that callers
    // (e.g. project member management, bulk status changes) already show.
    // Only meaningful in the browser: clears the stale/rejected session and
    // routes to /login so the UI never keeps rendering as a broken
    // "logged-in" shell against a session the backend has already rejected.
    if (isDeadSession(response.status, endpoint) && browser) {
      endDeadSession();
    }

    if (response.status === 401 || response.status === 403) {
      // Pass the extracted string, not the raw detail: if an auth error ever
      // carries a structured detail body, Error.message must stay readable.
      throw new AuthError(response.status, message, isStructuredDetail ? detail : undefined);
    }

    throw new ApiError(
      message,
      isStructuredDetail ? detail : undefined,
      response.status,
      response.headers.get('Retry-After')
    );
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json();
}

// Sibling of apiRequest() for endpoints that return a binary body (e.g. a
// captured image) instead of JSON. apiRequest() always calls
// response.json() on success, which would corrupt a binary payload, so a
// caller that needs the raw blob (and its response headers) needs its own
// helper rather than a special case inside apiRequest(). Same credentials,
// same 401/403 handling, same error-body parsing into the thrown Error's
// message and the same time limits as apiRequest().
function apiRequestBlob(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<{ blob: Blob; headers: Headers }> {
  return withTimeLimit(options, (init) => sendApiRequestBlob(endpoint, init));
}

async function sendApiRequestBlob(
  endpoint: string,
  options: RequestInit
): Promise<{ blob: Blob; headers: Headers }> {
  const base = getApiBase();

  const response = await fetch(`${base}${endpoint}`, sessionRequestInit(options));

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: get(m).api_request_failed }));
    const detail = errorData.detail || `HTTP ${response.status}`;
    const isStructuredDetail = typeof detail === 'object' && detail !== null;
    const message = isStructuredDetail
      ? (detail as { message?: string }).message || JSON.stringify(detail)
      : String(detail);

    if (isDeadSession(response.status, endpoint) && browser) {
      endDeadSession();
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status, message, isStructuredDetail ? detail : undefined);
    }

    throw new ApiError(
      message,
      isStructuredDetail ? detail : undefined,
      response.status,
      response.headers.get('Retry-After')
    );
  }

  return { blob: await response.blob(), headers: response.headers };
}

// ============================================================================
// AUTHENTICATION API
// ============================================================================

export interface RegisterData {
  username: string;
  email: string | null;
  password: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'operator' | 'reviewer' | 'testing';
  is_active: boolean;
  created_at?: string;
}

// Alias used by usersApi — same shape as what /auth/users returns
export type UserRead = User;

// What /auth/login and /auth/refresh answer. A request with X-Requested-With
// (every request from this app) gets {access_token: null, token_type:
// 'cookie'}: the session is the cookie set in the same response. A client
// without the header gets a bearer token in the body; this app keeps nothing
// from the body either way.
export interface AuthResponse {
  access_token: string | null;
  token_type: string;
}

export const authApi = {
  /**
   * Check whether initial setup is needed (no users exist yet).
   * Safe to call without authentication.
   */
  async setupStatus(): Promise<{ needs_setup: boolean }> {
    return apiRequest<{ needs_setup: boolean }>('/auth/setup/status');
  },

  /**
   * Register a new user.
   * First-user bootstrap requires the device bootstrap token outside development.
   */
  async register(data: RegisterData, bootstrapToken?: string): Promise<User> {
    return apiRequest<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      ...(bootstrapToken ? { headers: { 'X-Bootstrap-Token': bootstrapToken } } : {})
    });
  },

  /**
   * Login with username and password. The backend answers with the session
   * cookie; nothing from the response body is kept.
   */
  async login(data: LoginData): Promise<void> {
    // After any sign-out of this tab has sent its logout (see signOut).
    await pendingSignOut;
    await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    sessionRenewals.resume();
  },

  /**
   * Renew the session cookie. The backend answers a cookie session with a
   * new cookie and no token in the body.
   */
  async refreshSession(): Promise<void> {
    await apiRequest<AuthResponse>('/auth/refresh', { method: 'POST', timeoutMs: SESSION_REFRESH_TIMEOUT_MS });
  },

  /**
   * Log out. The cookie is httpOnly, so only the backend can remove it:
   * POST /auth/logout clears it (204), sent once the session renewal in
   * flight, if any, has settled (see signOut). The local user is cleared
   * afterwards whatever the answer, and also when the backend cannot be
   * reached or does not answer within LOGOUT_TIMEOUT_MS; the cookie then
   * stays until it expires. At most SESSION_REFRESH_TIMEOUT_MS plus
   * LOGOUT_TIMEOUT_MS in all.
   */
  async logout(): Promise<void> {
    return signOut(
      (async () => {
        await sessionRenewals.stop();
        await sendLogoutRequest();
        authStore.clearSession();
      })()
    );
  },

  /**
   * Change the signed-in user's own password, with the current one. On
   * success the backend has ended every session of the user, this one
   * included; the caller ends this tab's (endDeadSession). A wrong current
   * password is a 401 with the detail "Old password incorrect", which this
   * endpoint never treats as a dead session (SESSION_EXEMPT_ENDPOINTS).
   */
  async resetPassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiRequest('/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword
      })
    });
  }
};

// ============================================================================
// USERS API  (admin only)
// ============================================================================

export interface CreateUserData {
  username: string;
  email: string | null;
  password: string;
  role: 'admin' | 'operator' | 'reviewer';
}

export const usersApi = {
  /**
   * Get the authenticated user's own profile (including role).
   * Used to validate the session cookie — on session start/reload and
   * after login — since /users/me requires a valid, active-user session
   * and 401s otherwise.
   */
  async me(): Promise<User> {
    return apiRequest<User>('/users/me');
  },

  /** List all users. Requires an admin session. */
  async list(): Promise<UserRead[]> {
    return apiRequest<UserRead[]>('/auth/users');
  },

  /** Get a single user by ID. Requires an admin session. */
  async getById(id: number): Promise<UserRead> {
    return apiRequest<UserRead>(`/auth/users/${id}`);
  },

  /**
   * Create a new user.
   * /auth/register always creates as 'reviewer'; we immediately patch the
   * role if the requested role is different.
   */
  async create(data: CreateUserData): Promise<UserRead> {
    const user = await apiRequest<UserRead>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (data.role !== 'reviewer') {
      return usersApi.updateRole(user.id, data.role);
    }
    return user;
  },

  /** Change a user's role. Requires an admin session. */
  async updateRole(id: number, role: 'admin' | 'operator' | 'reviewer'): Promise<UserRead> {
    return apiRequest<UserRead>(`/auth/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  /** Activate or deactivate a user account. Requires an admin session. */
  async setActive(id: number, isActive: boolean): Promise<UserRead> {
    return apiRequest<UserRead>(`/auth/users/${id}/active?is_active=${isActive}`, {
      method: 'PATCH',
    });
  },

  /**
   * Give another user a new password. Requires an admin session. The backend
   * ends every session of that user; it refuses the testing account and the
   * administrator's own account with a {code, message} detail.
   */
  async setPassword(id: number, newPassword: string): Promise<UserRead> {
    return apiRequest<UserRead>(`/auth/users/${id}/password`, {
      method: 'PUT',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  /** Delete a user permanently. Requires an admin session. */
  async delete(id: number): Promise<void> {
    await apiRequest(`/auth/users/${id}`, { method: 'DELETE' });
  },
};

// ============================================================================
// PROJECTS API
// ============================================================================

export interface Project {
  id: number;
  name: string;
  description?: string;
  fondo?: string;
  serie?: string;
  signatura?: string;
  created_at: string;
  created_by?: string;
  // Read-only. True for a project of the testing role's, kept apart from real work.
  testing?: boolean;
  // A testing project's capture format; null for a real project. Absent from an older backend.
  capture_format?: CaptureFormat | null;
}

// What a testing project captures (NEH-391): JPEG only by default, or RAW and JPEG.
export type CaptureFormat = 'JPEG' | 'RAW+JPEG';

export interface CreateProjectData {
  name: string;
  description?: string;
  fondo?: string;
  serie?: string;
  signatura?: string;
  created_by?: string;
  // The testing account's only; omitted means JPEG.
  capture_format?: CaptureFormat;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  fondo?: string;
  serie?: string;
  signatura?: string;
  // The testing account's only.
  capture_format?: CaptureFormat;
}

export const projectsApi = {
  /**
   * Get all projects
   */
  async list(): Promise<Project[]> {
    return apiRequest<Project[]>('/projects/');
  },

  /**
   * Get a single project by ID
   */
  async get(id: number): Promise<Project> {
    return apiRequest<Project>(`/projects/${id}`);
  },

  /**
   * Create a new project
   */
  async create(data: CreateProjectData): Promise<Project> {
    return apiRequest<Project>('/projects/', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Update a project
   */
  async update(id: number, data: UpdateProjectData): Promise<Project> {
    return apiRequest<Project>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  /**
   * Delete a project
   */
  async delete(id: number): Promise<void> {
    await apiRequest(`/projects/${id}`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'DELETE'
    });
  },

  /**
   * Move all top-level collections from this project to another project.
   */
  async moveCollections(fromId: number, toId: number): Promise<{ moved: number; target_project_id: number }> {
    return apiRequest(`/projects/${fromId}/move-collections`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify({ target_project_id: toId })
    });
  },

  /**
   * Get all records for a project (deprecated - use recordsApi.list with project_id filter)
   */
  async getRecords(id: number): Promise<Record[]> {
    return apiRequest<Record[]>(`/projects/${id}/records`);
  }
};

// ============================================================================
// COLLECTIONS API
// ============================================================================

export interface Collection {
  record_count?: number;  // only some backend endpoints return it
  // Date of the most recently modified record in the volume: when it was
  // last worked on. Unlike updated_at, which changes only when the volume's
  // own row is edited. Null when the volume has no records (NEH-247).
  last_activity_at?: string | null;
  id: number;
  name: string;
  description?: string;
  collection_type?: string;
  // Null for a nested collection, which belongs to its parent, not a project.
  project_id?: number | null;
  parent_collection_id?: number;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  archival_metadata?: { [key: string]: any };
  // Volume identity (exchange contract 1.1 §3), from CollectionRead.
  // filename_stem: the lowercase slug every file name in the volume starts
  // with; null on a volume created before stems existed, which cannot
  // capture until an operator gives it one.
  filename_stem?: string | null;
  // The Fisqua reference code; written once.
  external_id?: string | null;
  date?: string | null;
  date_start?: string | null;  // ISO date (YYYY-MM-DD)
  date_end?: string | null;    // ISO date (YYYY-MM-DD)
  sequence?: number | null;
  custom_attributes?: string | null;  // JSON text
  // Read-only. Raised by the backend at every capture and upload; never decreases.
  capture_counter?: number;
  // Read-only. True when the volume has a stem and has captured: the stem
  // can no longer change, and DELETE refuses the volume (409) even once its
  // records are moved out.
  stem_reserved?: boolean;
  // Read-only (contract 1.7). The unit username the Fisqua queue assigned
  // the volume to, or null; and when a withdrawn queue entry took the
  // volume off Cola, null while it is shown.
  assignee_username?: string | null;
  queue_hidden_at?: string | null;
  // Read-only here (NEH-320): whether Captua keeps the volume on the unit,
  // copying none of its images offsite and sending none of its manifests.
  // Absent from an older backend.
  kept_on_unit?: boolean;
  // Read-only. True for a collection or volume of the testing role's; when
  // it is set, the instant after which the backend may remove it.
  testing?: boolean;
  testing_expires_at?: string | null;
}

export interface CollectionWithChildren extends Collection {
  child_collections: Collection[];
  record_count?: number;
}

// The volume identity fields a create or update may carry (CollectionCreate /
// CollectionUpdate on the backend). capture_counter and stem_reserved are
// read-only and absent here.
export interface VolumeIdentityData {
  filename_stem?: string | null;
  external_id?: string | null;
  date?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  sequence?: number | null;
  custom_attributes?: string | null;
}

export interface CreateCollectionData extends VolumeIdentityData {
  name: string;
  description?: string;
  collection_type?: string;
  project_id?: number;
  parent_collection_id?: number;
  created_by?: string;
  archival_metadata?: { [key: string]: any };
  // Keep the new volume on the unit (NEH-320); admin only outside offline
  // mode, where every new volume is kept whatever is sent.
  kept_on_unit?: boolean;
}

export interface UpdateCollectionData extends VolumeIdentityData {
  name?: string;
  description?: string;
  collection_type?: string;
  parent_collection_id?: number;
  archival_metadata?: { [key: string]: any };
}

// ============================================================================
// USB COPY (testing volumes)
// ============================================================================
// The shapes of GET /system/testing/usb and of the copy job's status
// (app/api/system.py, app/api/collections.py in the backend). A field the
// backend names otherwise changes here only.

/** One drive in the list GET /system/testing/usb gives (only drives that are not mounted). */
export interface UsbDrive {
  // The name the copy is started with (the `device` of the POST body).
  name: string;
  label: string | null;
  // In bytes.
  size: number;
  fstype: 'vfat' | 'exfat';
  free_bytes: number | null;
}

/** The GET /system/testing/usb body. */
export interface UsbDriveList {
  drives: UsbDrive[];
  // The copy that is running, if any, whichever volume it is for.
  active?: { collection_id: number; job_id: string } | null;
}

/**
 * The status of a copy to a USB drive. `error` is a failure code (usb_full,
 * usb_unmount, ...); `message` is the backend's English text and is never
 * shown. `folder` is the folder the copy wrote on the drive. `unmounted` is
 * true once the unit has released the drive.
 */
export interface UsbCopyStatus {
  job_id: string;
  collection_id: number;
  state: 'queued' | 'running' | 'done' | 'failed';
  done: number;
  total: number;
  bytes_done: number;
  bytes_total: number;
  error: string | null;
  message: string | null;
  folder: string;
  drive: string;
  // Pictures the copy left out.
  skipped: { not_regular: number; outside: number; missing: number };
  unmounted: boolean;
}

export const collectionsApi = {
  /**
   * Get the count of collections matching the given filters.
   */
  async count(params?: {
    project_id?: number;
    parent_collection_id?: number;
  }): Promise<number> {
    const queryParams = new URLSearchParams();
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    if (params?.parent_collection_id !== undefined) queryParams.set('parent_collection_id', params.parent_collection_id.toString());
    const query = queryParams.toString();
    const result = await apiRequest<{ count: number }>(`/collections/count${query ? '?' + query : ''}`);
    return result.count;
  },

  /**
   * Get all collections (optionally filtered)
   */
  async list(params?: {
    project_id?: number;
    parent_collection_id?: number;
    skip?: number;
    limit?: number;
  }): Promise<Collection[]> {
    const queryParams = new URLSearchParams();
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    if (params?.parent_collection_id !== undefined) queryParams.set('parent_collection_id', params.parent_collection_id.toString());
    if (params?.skip !== undefined) queryParams.set('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    return apiRequest<Collection[]>(`/collections/${query ? '?' + query : ''}`);
  },

  /**
   * Get the complete set of collections matching the given filters.
   *
   * GET /collections/ is paginated (backend default limit=100, max 1000 per
   * page), so a bare list() call silently truncates any project past the
   * page size (NEH-121). Pages through skip/limit until a short page arrives.
   * Stable pagination relies on the backend's ORDER BY id.
   */
  async listAll(params?: {
    project_id?: number;
    parent_collection_id?: number;
  }): Promise<Collection[]> {
    const PAGE = 1000; // backend's maximum page size
    const all: Collection[] = [];
    for (let skip = 0; ; skip += PAGE) {
      const page = await this.list({ ...params, skip, limit: PAGE });
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  },

  /**
   * Get a single collection by ID
   */
  async get(id: number): Promise<Collection> {
    return apiRequest<Collection>(`/collections/${id}`);
  },

  /**
   * Get collection with hierarchy (children, record counts)
   */
  async getHierarchy(id: number): Promise<CollectionWithChildren> {
    return apiRequest<CollectionWithChildren>(`/collections/${id}/hierarchy`);
  },

  /**
   * Create a new collection
   */
  async create(data: CreateCollectionData): Promise<Collection> {
    return apiRequest<Collection>('/collections/', {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Update a collection
   */
  async update(id: number, data: UpdateCollectionData): Promise<Collection> {
    return apiRequest<Collection>(`/collections/${id}`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  /**
   * Move all records from one collection to another.
   * Call before delete() to preserve contents.
   */
  async moveRecords(fromId: number, toId: number): Promise<{ moved: number; target_collection_id: number }> {
    return apiRequest(`/collections/${fromId}/move-records?target_collection_id=${toId}`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'POST'
    });
  },

  /**
   * Delete a collection
   */
  async delete(id: number): Promise<void> {
    await apiRequest(`/collections/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * Set the order of a volume's records.
   * ordered_ids: every record ID of the volume, each once, in the desired
   * order; the backend sets their sequence to 1..N. A list that leaves a
   * record out, repeats one or names one from another volume is refused (422).
   */
  async reorderRecords(collectionId: number, ordered_ids: number[]): Promise<{ reordered: number }> {
    return apiRequest(`/collections/${collectionId}/records/reorder`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'PATCH',
      body: JSON.stringify({ ordered_ids })
    });
  },

  /**
   * Mark openings never captured (NEH-316): the backend inserts that many
   * placeholders (missing_side 'both') right after `afterRecordId`, moving
   * every later record's sequence up; no file is renamed. Returns the
   * placeholders, in order. 409 when the volume keeps changing meanwhile,
   * 422 for a record of another volume.
   */
  async markMissingOpenings(collectionId: number, data: MissingOpeningsCreate): Promise<Record[]> {
    return apiRequest<Record[]>(`/collections/${collectionId}/records/missing-opening`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Renumber the volume's records: the backend sets their `sequence` to
   * 1..N in the current display order, in one transaction. No file is
   * renamed. `renumbered` is the number of records. If the commit fails
   * (500), every sequence stays as it was.
   */
  async renumberImages(collectionId: number): Promise<{ renumbered: number }> {
    return apiRequest(`/collections/${collectionId}/images/renumber`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** The volume's offsite state (NEH-227). `signal` lets the caller abort it. */
  async getOffsiteState(collectionId: number, signal?: AbortSignal): Promise<VolumeOffsiteState> {
    return apiRequest<VolumeOffsiteState>(`/collections/${collectionId}/offsite`, { signal });
  },

  /**
   * Dry run of freeing the volume from the card (NEH-248): what would be
   * removed and what would stay, and why. Admin and operator. Changes nothing.
   * GET /collections/{id}/offsite/free (plan_free in app/core/offsite_free.py).
   */
  async planFree(collectionId: number): Promise<FreePlan> {
    return apiRequest<FreePlan>(`/collections/${collectionId}/offsite/free`, { timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** Start freeing the volume from the card; 202 with a job to poll. Admin and operator. */
  async startFree(collectionId: number): Promise<OffsiteJobStart> {
    return apiRequest<OffsiteJobStart>(`/collections/${collectionId}/offsite/free`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** Start copying the volume's freed files back to the card; 202 with a job to poll. Admin only. */
  async startRestore(collectionId: number): Promise<OffsiteJobStart> {
    return apiRequest<OffsiteJobStart>(`/collections/${collectionId}/offsite/restore`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /**
   * Release a volume Captua keeps on the unit (NEH-320), and every kept
   * volume inside it; admin only. Answers the volume's offsite state. 409
   * `not_kept_on_unit`; 409 `kept_parent` while the volume that holds it is
   * kept (that one is released first, and this one with it); 409
   * `kept_volumes_changed` when the volumes inside it changed during the
   * request (try again). In Fisqua mode each volume's codes are checked with
   * Fisqua first, and a refusal of any of them refuses the whole release, as
   * on create (`unknown_reference_code`, `fisqua_unreachable`, `fisqua_no_lookup`).
   */
  async releaseFromUnit(collectionId: number): Promise<VolumeOffsiteState> {
    return apiRequest<VolumeOffsiteState>(`/collections/${collectionId}/release-from-unit`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /**
   * Keep a volume on the unit (NEH-320), and every volume inside it; admin
   * only. Answers the volume's offsite state. 409 `already_kept_on_unit`;
   * `already_left_unit` once a file of it, or of any volume inside it, was
   * copied offsite or a manifest sent (nothing is kept then);
   * `kept_volumes_changed` when the volumes inside it changed during the
   * request (try again).
   */
  async keepOnUnit(collectionId: number): Promise<VolumeOffsiteState> {
    return apiRequest<VolumeOffsiteState>(`/collections/${collectionId}/keep-on-unit`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** The state of a free or restore job, with its result once done: a free job for admin and operator, a restore job for admin. */
  async getOffsiteJob(collectionId: number, jobId: string, signal?: AbortSignal): Promise<OffsiteJobStatus> {
    return apiRequest<OffsiteJobStatus>(`/collections/${collectionId}/offsite/jobs/${jobId}`, { signal });
  },

  /**
   * The volume's capture manifest for Fisqua, as the file to save: the body
   * unchanged and its Content-Disposition (null when the browser may not read
   * it, cross-origin). Admins and operators only. Throws ApiError 409 with
   * detail {message, problems} when Fisqua would refuse the file
   * (export_capture_manifest in app/api/collections.py).
   */
  async downloadCaptureManifest(collectionId: number): Promise<{ blob: Blob; contentDisposition: string | null }> {
    const { blob, headers } = await apiRequestBlob(`/collections/${collectionId}/capture-manifest`, {
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS
    });
    return { blob, contentDisposition: headers.get('Content-Disposition') };
  },

  /**
   * Hand the collection over for review: every captured record becomes
   * in_review (NEH-260). Refuses with 422 if any of them still carries a
   * rejected image or has no image at all, naming all of them at once rather
   * than stopping at the first — nothing is changed when it refuses.
   */
  async promote(collectionId: number): Promise<{ collection_id: number; promoted: number }> {
    return apiRequest<{ collection_id: number; promoted: number }>(
      `/collections/${collectionId}/promote`,
      { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS }
    );
  },

  /**
   * The status history of the collection's records, newest first (GET
   * /collections/{id}/status-changes). A deleted record's rows stay, with
   * record_id null.
   */
  async statusChanges(collectionId: number): Promise<RecordStatusChange[]> {
    return apiRequest<RecordStatusChange[]>(`/collections/${collectionId}/status-changes`);
  },

  /**
   * Take the handover back: the collection's in_review records return to
   * captured, for an operator who handed a tomo over too early (NEH-260).
   * Records a reviewer has already approved or rejected are left alone.
   */
  async takeBack(collectionId: number): Promise<{ collection_id: number; taken_back: number }> {
    return apiRequest<{ collection_id: number; taken_back: number }>(
      `/collections/${collectionId}/take-back`,
      { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS }
    );
  },

  /**
   * Trigger a BagIt export for the collection (all records must be approved).
   * Returns metadata about the generated zip including a download_url.
   */
  async exportBagit(collectionId: number): Promise<{
    job_id: string;
    state: string;
    status_url: string;
  }> {
    return apiRequest(`/collections/${collectionId}/export`, { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /**
   * Poll the state or progress of a background export job.
   */
  async getExportStatus(collectionId: number, jobId: string): Promise<{
    job_id: string;
    state: 'queued' | 'running' | 'done' | 'failed';
    done: number;
    total: number;
    zip_filename: string | null;
    error: string | null;
    detail: unknown;
    download_url?: string;
  }> {
    return apiRequest(`/collections/${collectionId}/export/status/${jobId}`);
  },

  /**
   * Returns the URL to download the most recent BagIt export zip.
   */
  getExportDownloadUrl(collectionId: number): string {
    return `${getApiBase()}/collections/${collectionId}/export/download`;
  },

  /**
   * Start copying a testing volume's pictures to a USB drive, named as the
   * drive list gives it. 202 with the job's id; a refusal carries
   * `detail.code` (usb_not_eligible 422, usb_copy_busy 409).
   */
  async startUsbCopy(collectionId: number, device: string): Promise<{ job_id: string }> {
    return apiRequest(`/collections/${collectionId}/usb-copy`, {
      method: 'POST',
      body: JSON.stringify({ device }),
      timeoutMs: SLOW_REQUEST_TIMEOUT_MS
    });
  },

  /** Poll the state and progress of a copy to a USB drive. */
  async getUsbCopyStatus(collectionId: number, jobId: string): Promise<UsbCopyStatus> {
    return apiRequest(`/collections/${collectionId}/usb-copy/status/${jobId}`);
  }
};

// ============================================================================
// RECORDS API
// ============================================================================

export interface RecordImage {
  id: number;
  record_id: number;
  filename: string;
  file_path: string;
  thumbnail_path?: string;
  file_size?: number;
  format: string;
  resolution_width?: number;
  resolution_height?: number;
  capture_id?: string;
  pair_id?: string;
  sequence?: number;
  role?: string; // "left", "right", "single", "overview"
  uploaded_by?: string;
  created_at?: string;
  // NEH-208: false once a recapture has superseded this image — it stays
  // queryable via recordsApi.listRejections but drops out of the default
  // images list/gallery/export.
  is_current: boolean;
  superseded_at?: string;
  // NEH-248: set when the master, or a RAW master's preview, was freed from
  // the card with its verified object offsite (RecordImageRead in
  // app/schemas/record.py). Stored offsite, not missing. Absent from a
  // backend that predates freeing.
  master_freed_at?: string | null;
  preview_freed_at?: string | null;
}

// Every status a record can be in; see Record.status.
export type RecordStatus = 'captured' | 'in_review' | 'rejected' | 'approved' | 'excluded';

export interface Record {
  id: number;
  title: string;
  description?: string;
  author?: string;
  date?: string;
  custom_attributes?: string;
  project_id?: number;
  collection_id?: number;
  created_by?: string;
  created_at?: string;
  modified_at?: string;
  images: RecordImage[];
  // QA workflow. NEH-208 removed the "captured" resting state and sent a
  // record straight into the queue; NEH-260 brought it back, because the
  // handover is a deliberate act an operator performs on a whole collection
  // rather than something that happens to each record as it is shot. A
  // captured record is still the operator's: it is not in anyone's queue, and
  // it is the only status a record can be MOVED from (`is_movable`,
  // records.py). Deletion follows a different rule, which an earlier version
  // of this comment ran together with the move rule: `delete_record` refuses
  // only `in_review` and `approved`, and only for non-admins — so a rejected
  // record is deletable by any contributor, and an admin can delete one in
  // any status.
  // 'excluded' is Fisqua's third QC decision (contract 1.6): the record is not
  // a page of the volume, and no retake is asked for. Only a Fisqua decision
  // sets it, no route moves it, and it is never pending. Only an admin may
  // delete it or one of its images, and no one may add an image to it (409).
  status: RecordStatus;
  sequence?: number;
  // Which camera setup produced this document — set once at capture time.
  // It does not decide what a rejection flags: the backend flags every
  // current image of the record, whatever its capture_mode (reject_record,
  // records.py).
  capture_mode: 'single' | 'dual';
  // The page of a dual opening only one camera photographed (0.3.2): set
  // only on a dual record with one current image, which is the other page,
  // and cleared by a dual retake. Such a record is pending until then and is
  // never sent for review (promote leaves it captured; PATCH to in_review
  // answers 422). Absent from a backend before 0.3.2.
  // Since contract 1.9 (NEH-316) it may also be 'both': a placeholder for a
  // whole opening never captured, a dual record with no image, inserted by
  // POST /collections/{id}/records/missing-opening. A dual capture into the
  // record clears it.
  missing_side?: MissingSide | null;
  // What a placeholder should hold, the note on it and the Fisqua request
  // it came from (kept after it is captured into), and why the operator
  // closed a missing record without capturing it, with the note on that
  // (POST /records/{id}/close-missing). A closed record is not pending and
  // goes to review with its volume. Absent from a backend before 0.3.3.
  missing_expected?: string | null;
  missing_note?: string | null;
  missing_request_id?: string | null;
  closed_reason?: ClosedReason | null;
  closed_note?: string | null;
}

// The page or pages of a dual opening never photographed: one page, or
// 'both' for a placeholder (NEH-316).
export type MissingSide = 'left' | 'right' | 'both';

// Why a missing record was closed without capturing it, as
// POST /records/{id}/close-missing takes it. 'other' needs a note: the
// backend answers 422 without one.
export const CLOSED_REASONS = ['foliation_skip', 'leaf_missing_from_volume', 'captured_elsewhere', 'other'] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

// POST /collections/{id}/records/missing-opening. `count` is 1 to 50, or
// null when the number is not known, which the backend takes as one.
export interface MissingOpeningsCreate {
  afterRecordId: number;
  count: number | null;
  expected: string | null;
  note: string | null;
}

// POST /records/{id}/close-missing. A refusal is a 409 whose detail.code is
// `not_missing` or `already_closed`.
export interface CloseMissingRequest {
  reason: ClosedReason;
  note: string | null;
}

// The predefined rejection reasons, mirroring the backend's
// PREDEFINED_REJECTION_REASONS and the annotation feature's error types.
// `other` needs a comment saying what is wrong: the backend answers 422
// without one.
export const PREDEFINED_REJECTION_REASONS = [
  'blur', 'glare', 'shadow', 'focus', 'exposure', 'dirt', 'framing', 'obstruction', 'other'
] as const;
export type PredefinedRejectionReason = (typeof PREDEFINED_REJECTION_REASONS)[number];

export interface RejectRecordData {
  predefined_reason: PredefinedRejectionReason;
  comment?: string;
}

// One row of GET /collections/{id}/status-changes. `changed_at` is naive UTC
// (read it with parseApiDate). `note` is null except on a change into
// 'excluded', where it holds Fisqua's optional reason (contract 1.6).
export interface RecordStatusChange {
  id:            number;
  record_id:     number | null;
  collection_id: number | null;
  from_status:   RecordStatus;
  to_status:     RecordStatus;
  changed_by:    string | null;
  changed_at:    string;
  note:          string | null;
}

export interface RecordRejection {
  id: number;
  record_id: number;
  predefined_reason: string;
  comment?: string | null;
  rejected_by?: string | null;
  rejected_at?: string;
  images: RecordImage[];
}

export interface RecordAnnotation {
  id: number;
  record_id: number;
  error_types: string[];
  note?: string | null;
  created_at?: string;
  created_by?: string;
}

export interface CreateRecordAnnotationData {
  error_types?: string[];
  note?: string;
}

export interface CreateRecordData {
  title: string;
  description?: string;
  author?: string;
  date?: string;
  custom_attributes?: string;
  project_id?: number;
  collection_id?: number;
  created_by?: string;
}

export interface UpdateRecordData {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  custom_attributes?: string;
  project_id?: number | null;
  collection_id?: number | null;
}

export const recordsApi = {
  /**
   * Get the count of records matching the given filters.
   */
  async count(params?: {
    project_id?: number;
    collection_id?: number;
  }): Promise<number> {
    const queryParams = new URLSearchParams();
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    if (params?.collection_id !== undefined) queryParams.set('collection_id', params.collection_id.toString());
    const query = queryParams.toString();
    const result = await apiRequest<{ count: number }>(`/records/count${query ? '?' + query : ''}`);
    return result.count;
  },

  /**
   * Get all records (optionally filtered)
   */
  async list(params?: {
    collection_id?: number;
    project_id?: number;
    orphaned?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<Record[]> {
    const queryParams = new URLSearchParams();
    if (params?.collection_id !== undefined) queryParams.set('collection_id', params.collection_id.toString());
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    if (params?.orphaned !== undefined) queryParams.set('orphaned', params.orphaned.toString());
    if (params?.skip !== undefined) queryParams.set('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());
    
    const query = queryParams.toString();
    return apiRequest<Record[]>(`/records/${query ? '?' + query : ''}`);
  },

  /**
   * Get the complete set of records matching the given filters.
   *
   * GET /records/ is paginated (backend default limit=100, max 1000 per page),
   * so a bare list() call silently truncates any collection past the page
   * size (NEH-163). Pages through skip/limit until a short page arrives.
   * Stable pagination relies on the backend's ORDER BY id.
   */
  async listAll(params?: {
    collection_id?: number;
    project_id?: number;
    orphaned?: boolean;
  }): Promise<Record[]> {
    const PAGE = 1000; // backend's maximum page size
    const all: Record[] = [];
    for (let skip = 0; ; skip += PAGE) {
      const page = await this.list({ ...params, skip, limit: PAGE });
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  },

  /**
   * Get a single record by ID (with all images)
   */
  async get(id: number): Promise<Record> {
    return apiRequest<Record>(`/records/${id}`);
  },

  /**
   * Create a new record
   */
  async create(data: CreateRecordData): Promise<Record> {
    return apiRequest<Record>('/records/', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Update a record
   */
  async update(id: number, data: UpdateRecordData): Promise<Record> {
    return apiRequest<Record>(`/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  /**
   * Delete a record (cascades to all images)
   */
  async delete(id: number): Promise<void> {
    await apiRequest(`/records/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * Get all images for a specific record
   */
  async getImages(recordId: number): Promise<RecordImage[]> {
    return apiRequest<RecordImage[]>(`/records/${recordId}/images`);
  },

  /**
   * Get thumbnail URL for a record image
   */
  getImageThumbnailUrl(imageId: number): string {
    return `${getApiBase()}/records/images/${imageId}/thumbnail`;
  },

  /**
   * Get file download URL for a record image: the stored master, unchanged
   * (a RAW master comes back as RAW bytes). For an <img>, use
   * getImagePreviewUrl.
   */
  getImageFileUrl(imageId: number): string {
    return `${getApiBase()}/records/images/${imageId}/file`;
  },

  /**
   * Get a browser-displayable URL for a record image: a JPEG/PNG/WebP master
   * itself, or a RAW master's JPEG preview. The backend answers 404 when
   * there is none (RAW without a preview, TIFF) and never sends RAW bytes.
   */
  getImagePreviewUrl(imageId: number): string {
    return `${getApiBase()}/records/images/${imageId}/preview`;
  },

  /**
   * Delete a specific image (file + thumbnail + DB row)
   */
  async deleteImage(imageId: number): Promise<void> {
    await apiRequest(`/records/images/${imageId}`, { method: 'DELETE' });
  },

  /**
   * Change the QA status of a single record.
   * Rejection is not reachable here — it requires the mandatory-reason
   * reject() below (NEH-208). The backend's transitions are
   * captured -> in_review (the operator hands one record over),
   * in_review -> approved, approved/rejected -> in_review to undo a
   * mistake, and rejected -> captured (an operator or admin prepares a
   * retake, which is why this accepts 'captured'). in_review -> captured is deliberately absent: taking a handover
   * back is a whole-collection act, so it goes through
   * collectionsApi.takeBack() and not through here (NEH-260).
   */
  async updateStatus(
    id: number,
    status: 'captured' | 'in_review' | 'approved'
  ): Promise<Record> {
    return apiRequest<Record>(`/records/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  /**
   * Reject a record's current capture with a mandatory predefined reason.
   * Flags every current image (both sides of a dual-camera pair, or the
   * single image) as pending recapture. The backend flags every current
   * image and does not consult capture_mode; the frontend just reflects
   * `response.images` (only current images are returned).
   */
  async reject(id: number, data: RejectRecordData): Promise<Record> {
    return apiRequest<Record>(`/records/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * List a record's rejection history (newest first), each with the
   * image(s) it flagged at the time.
   */
  async listRejections(id: number): Promise<RecordRejection[]> {
    return apiRequest<RecordRejection[]>(`/records/${id}/rejections`);
  },

  /**
   * Close a missing record (a page or a whole opening never captured)
   * without capturing it (NEH-316). Returns the record, closed.
   */
  async closeMissing(id: number, data: CloseMissingRequest): Promise<Record> {
    return apiRequest<Record>(`/records/${id}/close-missing`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Every rejected record on the unit, across all volumes, the one whose
   * latest rejection is oldest first, each with that rejection.
   */
  async toRetake(): Promise<RecordToRetake[]> {
    return apiRequest<RecordToRetake[]>('/records/to-retake');
  },

  /**
   * How many records are waiting to be retaken, for the sidebar badge.
   */
  async toRetakeCount(): Promise<number> {
    const result = await apiRequest<{ count: number }>('/records/to-retake/count');
    return result.count;
  },

  /**
   * The recaptures pending on the unit, per volume, and whose turn it is
   * (0.2.0): `recaptures` while a new volume must wait for the retakes of
   * one volume, `new` once they are finished, `free` with nothing pending.
   * Read through readRetakeSummary in $lib/recapture-turn, which turns an
   * answer of another shape into null.
   */
  async toRetakeSummary(): Promise<RetakeSummary> {
    return apiRequest<RetakeSummary>('/records/to-retake/summary');
  },

  /**
   * List a record's QA annotations (flagged errors + notes), newest first.
   */
  async getAnnotations(recordId: number): Promise<RecordAnnotation[]> {
    return apiRequest<RecordAnnotation[]>(`/records/${recordId}/annotations`);
  },

  /**
   * Add an annotation (flagged error and/or note) to a record.
   */
  async addAnnotation(recordId: number, data: CreateRecordAnnotationData): Promise<RecordAnnotation> {
    return apiRequest<RecordAnnotation>(`/records/${recordId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Delete a single annotation.
   */
  async deleteAnnotation(annotationId: number): Promise<void> {
    await apiRequest(`/records/annotations/${annotationId}`, { method: 'DELETE' });
  }
};

// ============================================================================
// DOCUMENTS API
// ============================================================================

export interface Document {
  id: number;
  project_id: number;
  title?: string;
  notes?: string;
  created_at: string;
  image_count?: number;
}

export interface CreateDocumentData {
  project_id: number;
  title?: string;
  notes?: string;
}

export const documentsApi = {
  /**
   * Get all documents for a project
   */
  async listByProject(projectId: number): Promise<Document[]> {
    return apiRequest<Document[]>(`/projects/${projectId}/documents`);
  },

  /**
   * Get a single document
   */
  async get(id: number): Promise<Document> {
    return apiRequest<Document>(`/documents/${id}`);
  },

  /**
   * Create a new document
   */
  async create(data: CreateDocumentData): Promise<Document> {
    return apiRequest<Document>('/documents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Delete a document
   */
  async delete(id: number): Promise<void> {
    await apiRequest(`/documents/${id}`, {
      method: 'DELETE'
    });
  }
};

// ============================================================================
// CAMERAS API
// ============================================================================

export interface CameraDevice {
  hardware_id: string;
  model: string;
  index: number;
  location?: string;
  machine_id?: string;
  label?: string;
  calibrated: boolean;
  // Calibration data
  lens_position?: number;
  awb_gains?: [number, number];
  // Capture rotation (clockwise degrees) the appliance remembers for this
  // body: 0 | 90 | 180 | 270, or null/absent if it has never been set.
  orientation?: number | null;
  // Whether `orientation` is a value saved for this body (true) or the
  // default the backend reports for a body with none saved, which follows
  // its role (false). Absent from a backend that predates it, whose
  // `orientation` is null for a body with nothing saved.
  orientation_saved?: boolean;
  // Capabilities
  has_aperture_control?: boolean;
  supports_zoom?: boolean;
  // NEH-339: the stepped zoom of a CHDK camera. zoom_steps is the count of
  // steps (64 on the PowerShot A2500, so the steps run 0..zoom_steps - 1);
  // zoom_step is the step the camera last confirmed. Both are null until the
  // camera has entered shooting mode, which a preview or a test capture
  // causes, and absent from a backend that predates them.
  zoom_steps?: number | null;
  zoom_step?: number | null;
  // NEH-342: the page this body photographs, stored per body. `role` is
  // the one on record (null when none), `role_confirmed` whether an operator
  // confirmed it; `role_guess` is the backend's guess for a body without a
  // confirmed role, and `role_guess_source` what it is based on. A guess is
  // never a role: nothing is chosen or saved from it. Absent from a backend
  // that predates them.
  role?: CameraRole | null;
  role_confirmed?: boolean;
  role_guess?: CameraRole | null;
  role_guess_source?: string | null;
}

// NEH-342: the page a camera photographs.
export type CameraRole = 'left' | 'right';

// Why GET /cameras/setup says an answer is needed. `message` is the
// backend's English, for the console only; the screen maps `code`.
export type CameraSetupCode =
  | 'identity_missing'
  | 'identity_ambiguous'
  | 'role_unconfirmed'
  | 'role_conflict'
  | 'pair_changed'
  | 'port_changed';

export interface CameraSetupReason {
  code: CameraSetupCode;
  message: string;
  hardware_ids: (string | null)[];
}

export interface CameraSetup {
  needs_setup: boolean;
  reasons: CameraSetupReason[];
  // The bodies last confirmed as the left and the right page; null when
  // no pair has been confirmed on this unit.
  confirmed_pair: { left: string; right: string } | null;
}

// The answer to camerasApi.setRoles(): the device rows with their new
// roles, and the set-up as it stands after the save.
export interface CameraRolesResponse {
  devices: CameraDevice[];
  setup: CameraSetup;
}

export interface CaptureRequest {
  project_name: string;
  camera_index?: number;
  resolution?: string;
  include_resolution_in_filename?: boolean;
  rotate_deg?: number;
  record_id?: number;
  record_title?: string;
  collection_id?: number;
}

export interface DualCaptureRequest {
  project_name: string;
  resolution?: string;
  include_resolution_in_filename?: boolean;
  stagger_ms?: number;
  rotate_deg_cam0?: number;
  rotate_deg_cam1?: number;
  record_id?: number;
  record_title?: string;
  sequence?: number;
  collection_id?: number;
  left_camera_index?: number;
  // Inserts the new record right after this record of the volume, moving
  // every later record's sequence up one (NEH-316). Not with record_id.
  afterRecordId?: number;
}

export interface CaptureResponse {
  success: boolean;
  file_path?: string;
  file_paths?: string[];
  record_id?: number;
  image_ids?: number[];
  timing?: any;
  error?: string;
}

// Result of camerasApi.testCapture(): the raw image plus the two timing/size
// headers the backend attaches (NEH-166). A missing header comes back as
// null, never as an error — apiRequestBlob() only throws for a non-ok
// response.
export interface TestCaptureResult {
  blob: Blob;
  seconds: number | null;
  bytes: number | null;
  // NEH-339: the lens's focal length in millimetres (X-Focal-Length), when
  // the backend sends it.
  focalLength: number | null;
}

export interface CalibrationRequest {
  camera_index?: number;
  resolution?: string;
}

export interface CalibrationResponse {
  success: boolean;
  lens_position?: number;
  distance_meters?: number;
  af_time?: number;
  error?: string;
}

export interface WhiteBalanceCalibrationRequest {
  camera_index?: number;
  resolution?: string;
  stabilization_frames?: number;
}

export interface WhiteBalanceCalibrationResponse {
  success: boolean;
  awb_gains?: number[];
  colour_temperature?: number;
  converged?: boolean;
  error?: string;
}

// Keep legacy Camera alias
export type Camera = CameraDevice;

export interface CameraCapabilities {
  backend: string;
  live_preview: boolean;
  focus_control: boolean;
  live_controls: boolean;
  zoom: boolean;
  autofocus_calibration: boolean;
  dslr_settings: boolean;
  // NEH-334: false on units whose cameras should not be polled for a
  // preview (DSLR and compact bodies); the capture screen then shows the
  // last capture and fetches a live frame only on request. Absent from a
  // backend that predates it, which polls as before.
  continuous_preview?: boolean;
  // NEH-339: true only for CHDK cameras, whose zoom is set in steps
  // (camerasApi.setZoomStep). Unrelated to `zoom`, the digital crop.
  zoom_steps?: boolean;
  // The capture formats the settings route accepts ("JPEG", "RAW+JPEG"), on
  // a DSLR and on a CHDK camera alike. Empty or absent when the backend
  // offers no choice, and then the panel shows no format selector.
  image_formats?: string[];
}

// The answer to camerasApi.setZoomStep(): the step the camera confirmed.
export interface ZoomStepResponse {
  detail: string;
  zoom_step: number;
}

// Whether the capture screen polls the preview continuously. Only an
// explicit false turns it off; a missing field or no capabilities at all
// keep the continuous preview.
export function hasContinuousPreview(caps: CameraCapabilities | null | undefined): boolean {
  return caps?.continuous_preview !== false;
}

export interface DSLRSettings {
  iso?: string;
  shutter_speed?: string;
  aperture?: string;
  image_format?: string;
  focus_mode?: string;
  flash_mode?: string;
}

export interface DSLRSettingsUpdate {
  iso?: string;
  shutter_speed?: string;
  aperture?: string;
  image_format?: string;
}

export const camerasApi = {
  /**
   * List available camera devices
   */
  async listDevices(): Promise<CameraDevice[]> {
    return apiRequest<CameraDevice[]>('/cameras/devices', { timeoutMs: CAMERA_REQUEST_TIMEOUT_MS });
  },

  /**
   * Legacy alias
   */
  async list(): Promise<CameraDevice[]> {
    return this.listDevices();
  },

  /**
   * Rescan USB camera ports and close stale sessions.
   * Operators only. Returns the refreshed device list, same shape as listDevices().
   */
  async rescan(): Promise<CameraDevice[]> {
    return apiRequest<CameraDevice[]>('/cameras/rescan', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST'
    });
  },

  /**
   * Single camera capture
   */
  async capture(data: CaptureRequest): Promise<CaptureResponse> {
    return apiRequest<CaptureResponse>('/cameras/capture', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Take a single test capture from the dashboard's camera panel and return
   * the image itself rather than saving a record (NEH-166) — the operator
   * uses this to see what the camera actually took, not to build a project.
   *
   * The path is settled: POST /cameras/test-capture/{camera_index}, chosen
   * literal-first so it cannot collide with /cameras/{id} (cameras.py). The
   * route also takes ?resolution= and defaults to medium; this client has no
   * way to pass it.
   */
  async testCapture(cameraIndex: number, options: { focusCheck?: boolean } = {}): Promise<TestCaptureResult> {
    // The focus check (NEH-339) asks for the bounded mode: the backend
    // answers within about 20 s, with a 504 when no picture arrived (a lens
    // on AF that cannot find focus does not fire). The dashboard does not.
    const query = options.focusCheck ? '?focus_check=true' : '';
    const { blob, headers } = await apiRequestBlob(`/cameras/test-capture/${cameraIndex}${query}`, {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST'
    });
    const parseNumericHeader = (value: string | null): number | null => {
      if (value === null) return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    };
    const focal = parseNumericHeader(headers.get('X-Focal-Length'));
    return {
      blob,
      seconds: parseNumericHeader(headers.get('X-Capture-Seconds')),
      bytes: parseNumericHeader(headers.get('X-Capture-Bytes')),
      focalLength: focal !== null && focal > 0 ? focal : null
    };
  },

  /**
   * Dual camera capture (left + right)
   */
  async captureDual(data: DualCaptureRequest): Promise<CaptureResponse> {
    return apiRequest<CaptureResponse>('/cameras/capture/dual', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Autofocus calibration
   */
  async calibrate(data: CalibrationRequest = {}): Promise<CalibrationResponse> {
    return apiRequest<CalibrationResponse>('/cameras/calibrate', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * White balance calibration
   */
  async calibrateWhiteBalance(data: WhiteBalanceCalibrationRequest = {}): Promise<WhiteBalanceCalibrationResponse> {
    return apiRequest<WhiteBalanceCalibrationResponse>('/cameras/calibrate/white-balance', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Commit manually-sampled AWB gains to the registry.
   * Called after the user clicks a neutral area in the live preview.
   */
  async commitWhiteBalance(cameraIndex: number, awbGains: [number, number]): Promise<WhiteBalanceCalibrationResponse> {
    return apiRequest<WhiteBalanceCalibrationResponse>('/cameras/calibrate/white-balance/manual', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify({ camera_index: cameraIndex, awb_gains: awbGains })
    });
  },

  /**
   * Get current focus (lens position in dioptres)
   */
  async getFocus(cameraIndex: number): Promise<{ camera_index: number; lens_position: number }> {
    return apiRequest<{ camera_index: number; lens_position: number }>(`/cameras/focus/${cameraIndex}`, { timeoutMs: CAMERA_REQUEST_TIMEOUT_MS });
  },

  /**
   * Set manual focus (lens position in dioptres; 0 = infinity, 10 ≈ 10 cm)
   */
  async setFocus(cameraIndex: number, lensPosition: number): Promise<{ camera_index: number; lens_position: number }> {
    return apiRequest<{ camera_index: number; lens_position: number }>(`/cameras/focus/${cameraIndex}`, {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify({ lens_position: lensPosition })
    });
  },

  /**
   * Apply live camera controls (exposure, white balance, gain, etc.)
   */
  async setCameraControls(cameraIndex: number, controls: CameraControlsRequest): Promise<void> {
    await apiRequest(`/cameras/settings/${cameraIndex}`, {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify(controls)
    });
  },

  /**
   * Set the zoom of a CHDK camera to a step, 0..zoom_steps - 1 (NEH-339).
   * Resolves with the step the camera confirmed; a move takes about a
   * second. Refusals keep the backend's status and detail: 422 for a step
   * out of range or not an integer (a string detail, or pydantic's list,
   * kept in ApiError.detail), 501 for a backend without stepped zoom, 404
   * for no camera at that index, 502 when the camera did not move the lens
   * or did not answer.
   */
  async setZoomStep(cameraIndex: number, step: number): Promise<ZoomStepResponse> {
    return apiRequest<ZoomStepResponse>(`/cameras/settings/${cameraIndex}`, {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'POST',
      body: JSON.stringify({ zoom_step: step })
    });
  },

  /**
   * Delete stale preview temp files from /tmp (dtk_preview_c*.jpg).
   * Safe to call at any time — active previews recreate the file on the next poll.
   */
  async flushPreviewTmp(): Promise<{ deleted: number; detail: string }> {
    return apiRequest<{ deleted: number; detail: string }>('/cameras/preview/tmp', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'DELETE'
    });
  },

  /**
   * Get current backend capabilities (live_preview, focus_control, etc.)
   */
  async getCapabilities(): Promise<CameraCapabilities> {
    return apiRequest<CameraCapabilities>('/cameras/capabilities', { timeoutMs: CAMERA_REQUEST_TIMEOUT_MS });
  },

  /**
   * Read current DSLR settings from the active PTP session.
   * Available when the backend reports dslr_settings or image_formats; a CHDK
   * camera answers with its stored image_format and the other fields null.
   */
  async getDSLRSettings(cameraIndex: number): Promise<DSLRSettings> {
    return apiRequest<DSLRSettings>(`/cameras/dslr/${cameraIndex}/settings`, { timeoutMs: CAMERA_REQUEST_TIMEOUT_MS });
  },

  /**
   * Apply DSLR settings (ISO, shutter speed, aperture, image format).
   * Only fields provided are applied; others are left at their current camera value.
   * Available when the backend reports dslr_settings or image_formats. A CHDK
   * camera takes image_format alone and answers 422 to any other field.
   */
  async applyDSLRSettings(cameraIndex: number, settings: DSLRSettingsUpdate): Promise<DSLRSettings> {
    return apiRequest<DSLRSettings>(`/cameras/dslr/${cameraIndex}/settings`, {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  /**
   * Persist the capture rotation the appliance should remember for the body
   * currently at `cameraIndex`. `hardwareId` pins the write to that specific
   * body — the backend returns 409 if a different body now sits at
   * that index, which callers should treat like any other save error (the
   * next device refresh re-seeds the index from whatever is really there).
   * Resolves once the write is acknowledged; the device row the backend
   * returns is not needed by any caller, and apiRequest yields undefined on
   * an empty response, so the promise is typed as void rather than as a row.
   */
  async setOrientation(cameraIndex: number, hardwareId: string, orientation: number): Promise<void> {
    await apiRequest<CameraDevice>(`/cameras/${cameraIndex}/orientation`, {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'PUT',
      body: JSON.stringify({ orientation, hardware_id: hardwareId }),
    });
  },

  /**
   * Whether the unit needs to be told which camera photographs which page
   * (NEH-342), and why. A backend that predates the route answers 404,
   * which reads as "no set-up needed", so the capture screen behaves as it
   * did before; any other failure throws.
   */
  async getSetup(): Promise<CameraSetup> {
    try {
      return await apiRequest<CameraSetup>('/cameras/setup', { timeoutMs: CAMERA_REQUEST_TIMEOUT_MS });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { needs_setup: false, reasons: [], confirmed_pair: null };
      }
      throw err;
    }
  },

  /**
   * Save both roles in one request (PUT /cameras/roles, NEH-342): the body
   * that photographs the left page and the one that photographs the right.
   * Refusals keep the backend's status and detail: 422 for equal or empty
   * ids; 409 with `{code: "camera_not_connected" | "camera_identity_unusable",
   * message}`; 503 when the storage or the camera listing is unavailable.
   */
  async setRoles(leftHardwareId: string, rightHardwareId: string): Promise<CameraRolesResponse> {
    return apiRequest<CameraRolesResponse>('/cameras/roles', {
      timeoutMs: CAMERA_REQUEST_TIMEOUT_MS,
      method: 'PUT',
      body: JSON.stringify({ left: { hardware_id: leftHardwareId }, right: { hardware_id: rightHardwareId } }),
    });
  },

  /**
   * One preview frame from a camera: GET /cameras/preview/{n}, the request
   * the capture screen polls (LiveViewport), asked for once. Throws on any
   * non-ok answer; a 404 means the camera is not connected or gave no frame,
   * and the 503 that isPreviewFrameFailed recognises means it is connected
   * but sent no frame this time.
   */
  async previewFrame(cameraIndex: number): Promise<Blob> {
    const { blob } = await apiRequestBlob(`/cameras/preview/${cameraIndex}`, { timeoutMs: CAMERA_REQUEST_TIMEOUT_MS });
    return blob;
  },
};

// GET /cameras/preview/{n} answers 503 with detail
// {code: "preview_frame_failed", message} when the camera is connected but
// sent no frame (NEH-349); the next request may get one. It is per camera.
// A backend without it never sends this code, and its other 503 (the
// capture system not loaded) has a string detail.
export const PREVIEW_FRAME_FAILED_CODE = 'preview_frame_failed';

function isPreviewFrameFailedDetail(status: number | undefined, detail: unknown): boolean {
  return (
    status === 503 &&
    typeof detail === 'object' &&
    detail !== null &&
    (detail as { code?: unknown }).code === PREVIEW_FRAME_FAILED_CODE
  );
}

/** Whether an error thrown by camerasApi.previewFrame is that 503. */
export function isPreviewFrameFailed(error: unknown): boolean {
  return error instanceof ApiError && isPreviewFrameFailedDetail(error.status, error.detail);
}

/**
 * The same test on a raw response, for the pollers that fetch the frame
 * themselves. It reads a clone, so the response's body is left unread.
 */
export async function isPreviewFrameFailedResponse(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const body = await response.clone().json();
    return isPreviewFrameFailedDetail(response.status, body?.detail);
  } catch {
    return false;
  }
}

// Camera controls request interface (all fields optional)
export interface CameraControlsRequest {
  ae_enable?: boolean;          // Auto-exposure on/off
  awb_enable?: boolean;         // Auto white-balance on/off
  exposure_value?: number;      // EV compensation (ae_enable must be true)
  exposure_time_us?: number;    // Manual shutter in microseconds
  analogue_gain?: number;       // Manual gain (ISO 100 ≈ 1.0)
  colour_gains?: [number, number]; // Manual WB as [red_gain, blue_gain]
  zoom_factor?: number;         // ScalerCrop digital zoom (1.0 = full sensor, no zoom)
}

// ============================================================================
// ACTIVITY API
// ============================================================================

// Records per status in one collection. All five keys are always present.
// `excluded` counts the records Fisqua excluded (contract 1.6).
export interface StatusCounts {
  captured:  number;
  in_review: number;
  rejected:  number;
  approved:  number;
  excluded:  number;
}

export interface CollectionActivity {
  collection_id: number;
  status_counts: StatusCounts;
  // Sum of the five status counts, excluded records included.
  record_count: number;
  // Newest status change among the collection's records (deleted records
  // included), naive UTC ISO string; null when there has been none.
  last_status_change_at: string | null;
}

/** One local calendar day of activity, from GET /activity/daily. */
export interface DailyActivity {
  date: string;              // YYYY-MM-DD, a local calendar day
  captured_images: number;
  // Records approved, rejected or excluded that day.
  reviewed_records: number;
}

export const activityApi = {
  /**
   * Per-collection status counts for every collection, or only the
   * project's when project_id is given. Collections with no records are
   * included with zero counts.
   */
  async collections(params?: { project_id?: number }): Promise<CollectionActivity[]> {
    const queryParams = new URLSearchParams();
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    const query = queryParams.toString();
    return apiRequest<CollectionActivity[]>(`/activity/collections${query ? '?' + query : ''}`);
  },

  /**
   * Per-day totals, oldest first, `days` entries ending today. The day
   * boundaries follow the browser's time zone. `timeZone` is its IANA name,
   * with which the backend dates each event by that zone's offset at the
   * time, so days on either side of a daylight-saving change are counted
   * correctly; null sends no zone. `tzOffsetMinutes` (`new Date().getTimezoneOffset()`) is sent
   * as well; the backend uses it, one offset for the whole window, only when
   * no zone name arrives.
   */
  async daily(
    days = 182,
    timeZone: string | null = browserTimeZone(),
    tzOffsetMinutes = new Date().getTimezoneOffset()
  ): Promise<DailyActivity[]> {
    const queryParams = new URLSearchParams({ days: String(days) });
    if (timeZone) queryParams.set('tz', timeZone);
    queryParams.set('tz_offset_minutes', String(tzOffsetMinutes));
    return apiRequest<DailyActivity[]>(`/activity/daily?${queryParams.toString()}`);
  },
};

/**
 * The browser's IANA time zone (e.g. America/Bogota), or null where Intl
 * does not report one.
 */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// ============================================================================
// DIGITISATION LISTS AND RETAKES
// ============================================================================

// A pending record from GET /records/to-retake, with its latest rejection.
// `reason` is one of PREDEFINED_REJECTION_REASONS; the four rejection
// fields are null when the backend has no rejection row for the record, as
// for a record that misses a side (0.3.2). `rejectedAt` is naive UTC (read
// it with parseApiDate). `pendingReason` says why the record is pending:
// rejected, prepared for retake (its rejected image still current), or
// missing a side, which `missingSide` names (null otherwise).
export interface RecordToRetake {
  recordId:     number;
  title:        string;
  sequence:     number | null;
  // The volume and its project; null when the record has none.
  collectionId: number | null;
  projectId:    number | null;
  // The volume's name and stem.
  name:         string | null;
  filenameStem: string | null;
  reason:       string | null;
  comment:      string | null;
  rejectedBy:   string | null;
  rejectedAt:   string | null;
  pendingReason: PendingReason;
  missingSide:  MissingSide | null;
  // For a missing record: what it should hold, the note on it, and the
  // Fisqua request it came from (NEH-316); null otherwise, and absent from
  // a backend before 0.3.3. The list is ordered by volume, then by sequence.
  missingExpected?: string | null;
  missingNote?:     string | null;
  requestId?:       string | null;
}

export type PendingReason = 'rejected' | 'prepared' | 'missing_side';

// GET /records/to-retake/summary (0.2.0). `pending` counts the volume's
// pending records, `total` its records with at least one rejection, leaving
// out those now excluded, and `excluded` (0.2.1) its records Fisqua excluded,
// which are never pending.
// A record is pending when it is rejected, or captured with a current image
// that still carries its rejection (prepared for retake); the records alone
// do not show the second. `pendingRecordIds` lists every pending record of
// the volume by sequence, then id, and `firstPendingRecordId` is its first.
// Only volumes with something pending are listed, most pending first.
// A record that misses a side (0.3.2) is pending too: `missingSideRecordIds`
// lists those of `pendingRecordIds`, in the same order. It counts in
// `pending` and not in `total`, which counts rejections, so `pending` may
// exceed `total` (read both through retakeProgress in $lib/recapture-turn).
// The field is absent from a backend before 0.3.2.
export interface RetakeSummaryVolume {
  collectionId:         number;
  projectId:            number;
  name:                 string;
  filenameStem:         string | null;
  pending:              number;
  total:                number;
  excluded:             number;
  firstPendingRecordId: number;
  pendingRecordIds:     number[];
  missingSideRecordIds?: number[];
}

export type RecaptureTurnState = 'free' | 'new' | 'recaptures';

export interface RetakeSummary {
  pendingRecords: number;
  volumes:        RetakeSummaryVolume[];
  // `unlockedBy` names the volume whose finished retakes opened a `new`
  // turn; null otherwise.
  turn: { state: RecaptureTurnState; unlockedBy: { collectionId: number; name: string } | null };
}

// The 409 codes of the recapture turn (0.2.0), in `detail.code`: a capture
// that would start an empty volume during the retake turn, and the
// promotion of a volume with rejected records (`detail.pending` is how
// many). They are defined in $lib/recapture-turn, which reads them and
// loads no API client, so that its tests run in plain node.
export { RECAPTURE_TURN_CODE, RECAPTURES_PENDING_CODE } from './recapture-turn';

// One item of an imported digitisation list, in list order. `action` is
// the item's optional action field, unvalidated; `collectionId` the volume
// on this unit whose stem is the item's, null when there is none, and
// `status` that volume's record counts, null without a volume. `notes` is
// the item's notes, or null when it has none.
// `projectId` is the volume's own project. `doneMark` is set when an admin
// or reviewer marked the item done by hand, with who and when.
export interface QueueDoneMark {
  by: string | null;
  at: string | null;
}

export interface QueueItem {
  position:      number;
  sequence:      number | null;
  referenceCode: string | null;
  filenameStem:  string | null;
  title:         string | null;
  notes:         string | null;
  action:        string | null;
  collectionId:  number | null;
  projectId:     number | null;
  status:        StatusCounts | null;
  doneMark:      QueueDoneMark | null;
  // The digitisation queue synced with Fisqua (contract 1.7). `itemId` is
  // the queue entry's id, null for a file's item; `assignee` the unit
  // username the entry is assigned to, or null; `withdrawn` true for an
  // entry Fisqua withdrew; `queueHidden` true when the item's volume was
  // taken off Cola by a withdrawn entry, on a file's item too; `retakes` a
  // spot recapture's records to capture again, [] otherwise. Optional, so
  // that an answer from a backend before 0.3.0 still reads.
  itemId?:       string | null;
  assignee?:     string | null;
  withdrawn?:    boolean;
  queueHidden?:  boolean;
  retakes?:      QueueRetake[];
}

// One record a spot-recapture entry of the queue asks to capture again.
// `pairId` is Fisqua's id of the page pair, null for a single-image opening.
export interface QueueRetake {
  captuaRecordId: number;
  pairId:         string | null;
  side:           'left' | 'right' | 'both';
}

// An imported list from GET /imports/digitisation-lists. `listFileMissing`
// is true when the unit has no readable copy of the file, and `items` is
// then empty.
export interface QueueList {
  listId:           string;
  // `queue` for the digitisation queue synced with Fisqua (contract 1.7),
  // `file` for an imported file; absent from a backend before 0.3.0.
  source?:          'queue' | 'file';
  listName:         string;
  projectId:        number | null;
  importedAt:       string | null;
  items:            QueueItem[];
  listFileMissing:  boolean;
}

// An item the import did not create, with the reason code from
// app/core/list_import.py's REASONS.
export interface ImportReject {
  position:               number;
  referenceCode:          string | null;
  referenceCodeTruncated: boolean;
  reason:                 string;
}

// The report POST /imports/digitisation-list returns.
export interface ImportReport {
  listId:         string;
  listName:       string;
  projectId:      number;
  projectName:    string;
  projectCreated: boolean;
  importedAt:     string;
  created:        number;
  skipped:        number;
  volumes:        { position: number; referenceCode: string; filenameStem: string; captuaCollectionId: number }[];
  rejects:        ImportReject[];
  reportStored:   boolean;
  // False when the import worked but the unit could not keep the file.
  listStored:     boolean;
}

export const importsApi = {
  /**
   * Import a digitisation list file, sent unchanged as a multipart upload.
   */
  async importList(file: File): Promise<ImportReport> {
    const body = new FormData();
    body.append('file', file);
    return apiRequest<ImportReport>('/imports/digitisation-list', { method: 'POST', body, timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /**
   * Every imported list, newest import first, with its items in list order.
   */
  async lists(): Promise<QueueList[]> {
    return apiRequest<QueueList[]>('/imports/digitisation-lists');
  },

  /**
   * Mark a list item done by hand, or take the mark off (admin or reviewer;
   * an operator gets a 403). Returns the item's mark as the backend now
   * holds it: null once taken off.
   */
  async setDone(listId: string, position: number, done: boolean, itemId?: string): Promise<QueueDoneMark | null> {
    // A queue item's itemId goes with the mark (contract 1.7): the backend
    // answers 409 when the item at the position is another entry now.
    const body = itemId ? { done, itemId } : { done };
    const result = await apiRequest<{ doneMark: QueueDoneMark | null }>(
      `/imports/digitisation-lists/${encodeURIComponent(listId)}/items/${position}/done`,
      { method: 'PUT', body: JSON.stringify(body) }
    );
    return result?.doneMark ?? null;
  },
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

export const healthApi = {
  async check(): Promise<{ status: string }> {
    return apiRequest<{ status: string }>('/health', { timeoutMs: HEALTH_REQUEST_TIMEOUT_MS });
  }
};

// =============================================================================
// System API
// =============================================================================

export interface SystemLogEntry {
  id:         number;
  created_at: string;   // ISO 8601 datetime
  level:      string;   // INFO | WARN | ERR
  category:   string;   // access | activity | capture | system
  actor:      string | null;
  action:     string;
  subject:    string | null;
  detail:     string | null;
}

export interface StorageInfo {
  projects_path: string;
  is_override:   boolean;
  override_invalid?: boolean;
  total_bytes:   number;
  used_bytes:    number;
  free_bytes:    number;
  available:     boolean;
  /** The space Captua keeps for its own work (CAPTUA_STORAGE_RESERVE_GB); absent from an older backend. */
  reserve_bytes?: number;
  /** free_bytes less the reserve, never below 0; absent from an older backend. */
  usable_free_bytes?: number;
}

/** One volume of GET /system/storage/freeable (app/core/offsite_free.py, freeable_volumes). */
export interface FreeableVolume {
  collection_id: number;
  project_id: number | null;
  name: string;
  filename_stem: string;
  /** The files freeing would remove: masters and RAW previews still on the card. */
  files: number;
  /** Their bytes as the database holds them; a preview's size is not held, so it adds nothing. */
  bytes: number;
  unmeasured_files: number;
}

export interface FreeableVolumes {
  volumes: FreeableVolume[];
  total: { volumes: number; files: number; bytes: number; unmeasured_files: number };
  /** False in offline mode, where freeing is refused (`off_in_this_mode`). */
  mode_allows: boolean;
  /** The free jobs queued or running on the unit; absent from an older backend. */
  jobs?: { collection_id: number; job_id: string; state: 'queued' | 'running' }[];
  /**
   * Whether freed files can be brought back to this unit: false when it has
   * no read access to the bucket (CAPTUA_OFFSITE_READ_REMOTE). Absent from an
   * older backend, which says nothing either way.
   */
  restorable?: boolean;
}

export interface StorageDevice {
  name:       string;
  path:       string;   // e.g. /dev/sda2
  size:       string;   // human-readable e.g. "29G"
  fstype:     string | null;
  mountpoint: string | null;
  label:      string | null;
  removable:  boolean;
  type:       string;
}

/**
 * GET /system/catalogue-backup (NEH-249): when the catalogue (the database,
 * not the image files) was last verified at the offsite destination.
 * `enabled` is false when no destination was configured at install;
 * `last_verified_at` is null on a unit that has never completed a verified
 * dump. `object` and `detail` describe that last verified dump.
 */
export interface CatalogueBackupStatus {
  enabled:          boolean;
  /** Whether the unit's mode takes the catalogue dump (backup and fisqua; NEH-319). Absent from an older backend: allowed. */
  mode_allows?:     boolean;
  last_verified_at: string | null;   // ISO 8601 datetime
  object:           string | null;
  detail:           string | null;
  /** The image upload's unit-level summary (NEH-227); absent from an older backend. */
  images?:          UnitImageUploadSummary;
  /** Delivery to Fisqua at the unit level; absent from an older backend. */
  fisqua?:          UnitFisquaSummary;
}

/**
 * `images` of GET /system/catalogue-backup: unit_upload_summary in
 * app/core/image_upload.py, totals over every volume with a stem.
 * `misconfigured` is the backend's English reason, never shown.
 */
export interface UnitImageUploadSummary {
  enabled:          boolean;
  /** Whether the unit's mode copies images offsite (backup and fisqua; NEH-319). Absent from an older backend: allowed. */
  mode_allows?:     boolean;
  tenant:           string | null;
  misconfigured:    string | null;
  volumes:          number;
  volumes_received: number;
  total:            number;
  verified:         number;
  pending:          number;
  refused:          number;
  last_verified_at: string | null;   // ISO 8601 datetime
  /** The volumes Captua keeps on the unit (NEH-320), left out of every count above, and their files. Absent from an older backend. */
  kept_volumes?:    number;
  kept_files?:      number;
  last_run:         unknown;
}

/** One object of a volume refused because the bucket already held another file at its key. */
export interface OffsiteRefusal {
  image_id:    number;
  kind:        'capture' | 'preview';
  reason:      string | null;
  key:         string;
  local_sha1:  string | null;
  remote_sha1: string | null;
  refused_at:  string;
}

/**
 * GET /collections/{id}/offsite: volume_upload_state in
 * app/core/image_upload.py, the volume's received indicator. `received` is
 * true when the volume has objects to upload and every one is verified.
 */
export interface VolumeOffsiteState {
  /** Whether this unit can restore freed files (NEH-380); absent from an older backend. */
  restorable?:      boolean;
  collection_id:    number;
  filename_stem:    string | null;
  uploadable:       boolean;
  total:            number;
  verified:         number;
  pending:          number;
  refused:          number;
  last_verified_at: string | null;   // ISO 8601 datetime
  received:         boolean;
  refusals:         OffsiteRefusal[];
  // The objects whose local file was freed from the card, and their bytes
  // (_object_counts in app/core/image_upload.py); counted among `verified`
  // too. Absent from a backend that predates freeing.
  freed_files?:     number;
  freed_bytes?:     number;
  /** Delivery to Fisqua (volume_fisqua_state in app/core/fisqua_outbox.py); null when the unit has no Fisqua configured, absent from an older backend. */
  fisqua?:          VolumeFisquaState | null;
  /** Whether Captua keeps the volume on the unit (NEH-320); `pending` is then 0. Absent from an older backend. */
  kept_on_unit?:    boolean;
}

/**
 * A problem on a Fisqua outbox row or status. A refusal by Captua
 * (`not_exportable`) holds capture_manifest problems, plus
 * `reference_code_differs`: {rule, message, record_ids, image_ids}. A refusal by
 * Fisqua, and Fisqua's status, hold Fisqua's own problems: {rule, message, …},
 * with Fisqua's rule names (`id-reused`, `reference-code`, …) and its text.
 */
export interface FisquaProblem {
  rule?:       string;
  message?:    string;
  record_ids?: number[];
  image_ids?:  number[];
  [key: string]: unknown;
}

/** One manifest of a volume in the Fisqua outbox (_OUTBOX_FIELDS in app/core/fisqua_outbox.py). States: app/models/fisqua.py. */
export interface FisquaOutboxEntry {
  manifest_id:     string;
  stem:            string | null;
  state:           'waiting_for_upload' | 'ready' | 'sending' | 'delivered' | 'refused' | 'failed' | 'superseded' | 'withdrawn' | string;
  created_at:      string;          // naive UTC ISO 8601
  attempts:        number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  /** The backend's English, never shown. */
  last_error:      string | null;
  refusal:         'not_exportable' | 'fisqua' | string | null;
  problems:        FisquaProblem[] | null;
  response:        unknown;
  external_id:     string | null;
  delivered_at:    string | null;
}

/** Fisqua's latest word on the volume (fisqua_status). `status` is one of STATES in app/core/fisqua_contract.py, or null. */
export interface FisquaVolumeStatus {
  status:            string | null;
  status_at:         string | null;
  status_checked_at: string | null;
  problems:          FisquaProblem[] | null;
  manifest_id:       string | null;
}

/** The unit-level stop while Fisqua refuses this unit's configuration (config_error in app/core/fisqua_outbox.py). */
export interface FisquaConfigError {
  at:                 string | null;
  status_code:        number | null;
  /** `version`: Fisqua does not read the manifests this version of Captua writes. */
  reason:             'token' | 'not_found' | 'redirect' | 'version' | string | null;
  config_fingerprint: string;
}

export interface VolumeFisquaState {
  environment:  'production' | 'staging' | string | null;
  config_error: FisquaConfigError | null;
  /** Newest first, at most 20. */
  outbox:       FisquaOutboxEntry[];
  status:       FisquaVolumeStatus | null;
}

/** `fisqua` of GET /system/catalogue-backup: unit_fisqua_summary in app/core/fisqua_outbox.py. */
export interface UnitFisquaSummary {
  configured:   boolean;
  /** Whether the unit's mode calls Fisqua (fisqua mode only; NEH-319). Absent from an older backend: allowed. */
  mode_allows?: boolean;
  environment:  'production' | 'staging' | string | null;
  config_error: FisquaConfigError | null;
  /** run_fisqua_outbox's result since the backend started; null before the first run. */
  last_send:    FisquaRunResult | null;
  /** poll_fisqua_status's result since the backend started; null before the first poll. */
  last_poll:    FisquaRunResult | null;
}

/**
 * A send run: {status, promoted, not_exportable, delivered, refused, failed, waiting};
 * a poll: {status, asked, calls, answered, recovered}. `status` is "done",
 * "config_error", "error", "stopped", "no_transport" or "disabled"; the counts
 * are absent from the early returns.
 */
export interface FisquaRunResult {
  status:          string;
  promoted?:       number;
  not_exportable?: number;
  delivered?:      number;
  refused?:        number;
  failed?:         number;
  waiting?:        number;
  asked?:          number;
  calls?:          number;
  answered?:       number;
  recovered?:      number;
}

/** One file of a free or restore: the dry run's and the job result's `files` and `refused` entries (_Object.entry in app/core/offsite_free.py). */
export interface OffsiteFileEntry {
  image_id: number;
  kind:     'capture' | 'preview';
  path:     string;
  key:      string;
  bytes?:   number;
  /** Why the file was not freed or restored; only in `refused`. */
  reason?:  string;
}

/** GET /collections/{id}/offsite/free: plan_free in app/core/offsite_free.py. */
export interface FreePlan {
  collection_id:      number;
  filename_stem:      string;
  would_free:         { files: number; bytes: number };
  files:              OffsiteFileEntry[];
  refused:            OffsiteFileEntry[];
  local_sha1_checked: boolean;
  /**
   * Whether freed files can be brought back to this unit: false when it has
   * no read access to the bucket (CAPTUA_OFFSITE_READ_REMOTE). Absent from an
   * older backend, which says nothing either way.
   */
  restorable?: boolean;
}

/** The 202 of POST /offsite/free and /offsite/restore (_job_body in app/api/collections.py). */
export interface OffsiteJobStart {
  job_id:     string;
  state:      OffsiteJobState;
  action:     'free' | 'restore';
  status_url: string;
}

export type OffsiteJobState = 'queued' | 'running' | 'done' | 'failed';

/** The result of a finished job: _free_work's or _restore_work's in app/core/offsite_free.py. */
export interface OffsiteJobResult {
  collection_id: number;
  filename_stem: string;
  freed?:        { files: number; bytes: number };
  restored?:     { files: number; bytes: number };
  files:         OffsiteFileEntry[];
  refused:       OffsiteFileEntry[];
  manifest:      string | null;
  /**
   * Whether freed files can be brought back to this unit: false when it has
   * no read access to the bucket (CAPTUA_OFFSITE_READ_REMOTE). Absent from an
   * older backend, which says nothing either way.
   */
  restorable?: boolean;
}

/** GET /collections/{id}/offsite/jobs/{job_id}: OffsiteJob.to_dict in app/core/offsite_free.py. */
export interface OffsiteJobStatus {
  job_id:        string;
  collection_id: number;
  action:        'free' | 'restore';
  state:         OffsiteJobState;
  result:        OffsiteJobResult | null;
  error:         string | null;
}

export type PowerAction = 'poweroff' | 'reboot';

/**
 * Error from the power call that keeps the HTTP status, needed to tell 501
 * (power control unavailable — a development machine) from a real error.
 * powerControl() calls fetch directly, not through apiRequest().
 */
export class PowerControlError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PowerControlError';
    this.status = status;
  }
}

// GET /system/unit (NEH-311, NEH-313); read through $lib/unit-mode.
export interface UnitSettings {
  mode: 'offline' | 'backup' | 'fisqua';
  projectsEnabled: boolean;
  projectsShown: boolean;
  defaultProjectId: number | null;
  prerequisites: { backup: string[]; fisqua: string[] };
  /** The volumes Captua keeps on the unit (NEH-320); absent from an older backend. */
  keptVolumes?: KeptVolume[];
}

/** A volume Captua keeps on the unit: `files` is the count it would copy offsite. */
export interface KeptVolume {
  id: number;
  name: string;
  files: number;
}

/** What an admin leaving Scanner only mode decides for the kept volumes (NEH-320). */
export type KeptVolumesDecision = 'include' | 'keep';

/** One of Fisqua's descriptions, in the shape of its 1.8 and 1.10 answers. */
export interface DescriptionMatch {
  referenceCode: string;
  title: string;
  // The ISAD(G) level (src/lib/description-search.ts, levelLabel).
  level: string | null;
  dates: { display: string | null; start: string | null; end: string | null };
}

/** The search's answer: `search` is false from a Fisqua without contract 1.10. */
export interface DescriptionSearchAnswer {
  results: DescriptionMatch[];
  search?: boolean;
}

export const fisquaApi = {
  /**
   * Fisqua's descriptions matching `q` (NEH-321, contract 1.10), for the
   * new-volume form. `signal` lets the form abort an older query.
   */
  async searchDescriptions(q: string, signal?: AbortSignal): Promise<DescriptionSearchAnswer> {
    return apiRequest<DescriptionSearchAnswer>(`/fisqua/descriptions?q=${encodeURIComponent(q)}`, { signal });
  },
};

// GET and PUT /system/testing, PATCH /system/testing/account (NEH-391), admin only.
export interface TestingSpace {
  enabled: boolean;
  /** Null until a testing account exists. */
  username: string | null;
  account_active: boolean;
  /** Days without a capture after which a testing volume is removed. */
  expiry_days: number;
  projects: number;
  volumes: number;
  /** GB of free space kept for real work: below it the testing account's captures are refused. */
  reserve_gb?: number;
  /** Free space now, in GB; null when it cannot be read. */
  free_gb?: number | null;
}

/** What POST /system/testing/clear removed, and the volumes it left because they were being captured into. */
export interface TestingCleared {
  projects: number;
  volumes: number;
  skipped: number;
}

export const systemApi = {
  /** The USB drives the unit can copy a testing volume to (testing account and admin). */
  async getTestingUsb(): Promise<UsbDriveList> {
    return apiRequest<UsbDriveList>('/system/testing/usb');
  },

  /** The testing space: its state, account and counts (admin). */
  async getTesting(): Promise<TestingSpace> {
    return apiRequest<TestingSpace>('/system/testing');
  },

  /**
   * Switch the testing space on or off, and set its term (admin). Switching
   * on with no account needs `username` and `password`; switching off takes
   * neither. A refusal carries `detail.code`.
   */
  async setTesting(body: { enabled: boolean; username?: string; password?: string; expiry_days?: number; reserve_gb?: number }): Promise<TestingSpace> {
    return apiRequest<TestingSpace>('/system/testing', { method: 'PUT', body: JSON.stringify(body), timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** Remove every testing project and volume now, with their pictures (admin); the account and the settings stay. */
  async clearTesting(): Promise<TestingCleared> {
    return apiRequest<TestingCleared>('/system/testing/clear', { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** Rename the testing account or give it a new password (admin); a new password ends its open sessions. */
  async updateTestingAccount(body: { username?: string; password?: string }): Promise<TestingSpace> {
    return apiRequest<TestingSpace>('/system/testing/account', { method: 'PATCH', body: JSON.stringify(body), timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /** The unit's mode and projects setting, for every role. */
  async unit(): Promise<UnitSettings> {
    return apiRequest<UnitSettings>('/system/unit');
  },

  /**
   * Change the mode, the projects setting, or both (admin). Only the fields
   * given are sent; the backend refuses any other key (422). A refused
   * switch is a 409 whose detail is {message, problems: [{code, message}]};
   * leaving offline mode with kept volumes and no `keptVolumes` is such a 409
   * with the problem `kept_volumes_decision`.
   */
  async setUnit(body: {
    mode?: UnitSettings['mode'];
    projectsEnabled?: boolean;
    keptVolumes?: KeptVolumesDecision;
  }): Promise<UnitSettings> {
    return apiRequest<UnitSettings>('/system/unit', { method: 'PUT', body: JSON.stringify(body), timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  /**
   * Linking the unit to a Fisqua workspace by a code (NEH-345), admin only.
   * GET is also the card's heartbeat: the backend ends a session nobody has
   * read for 30 s. Every answer goes through readPairingStatus, which keeps
   * only the fields of the contract. A refusal is a 422 (`unit_name`) or a
   * 409 whose detail carries the code; pairingErrorCode reads it.
   */
  async getPairing(signal?: AbortSignal): Promise<PairingStatus> {
    const status = readPairingStatus(await apiRequest<unknown>('/system/pairing', { signal }));
    if (!status) throw new ApiError(get(m).api_request_failed);
    return status;
  },

  /** Ask for a code; with a session already running, the backend answers with its state. */
  async startPairing(unitName: string): Promise<PairingStatus | null> {
    return readPairingStatus(
      await apiRequest<unknown>('/system/pairing', { method: 'POST', body: JSON.stringify({ unitName }), timeoutMs: SLOW_REQUEST_TIMEOUT_MS })
    );
  },

  /** A new code after `lapsed`, within the renewal window. */
  async renewPairing(): Promise<PairingStatus | null> {
    return readPairingStatus(await apiRequest<unknown>('/system/pairing/renew', { method: 'POST', timeoutMs: SLOW_REQUEST_TIMEOUT_MS }));
  },

  async cancelPairing(): Promise<PairingStatus | null> {
    return readPairingStatus(await apiRequest<unknown>('/system/pairing', { method: 'DELETE', timeoutMs: SLOW_REQUEST_TIMEOUT_MS }));
  },

  async getLogs(params?: { limit?: number; category?: string; level?: string }): Promise<SystemLogEntry[]> {
    const q = new URLSearchParams();
    if (params?.limit    !== undefined) q.set('limit',    params.limit.toString());
    if (params?.category)               q.set('category', params.category);
    if (params?.level)                  q.set('level',    params.level);
    const qs = q.toString();
    return apiRequest<SystemLogEntry[]>(`/system/logs${qs ? '?' + qs : ''}`);
  },

  async getStorage(): Promise<StorageInfo> {
    return apiRequest<StorageInfo>('/system/storage');
  },

  /** The real volumes that can be freed, largest first (NEH-380). Admin and operator. */
  async getFreeableVolumes(): Promise<FreeableVolumes> {
    return apiRequest<FreeableVolumes>('/system/storage/freeable');
  },

  /** `signal` lets the caller abort it (the poll's 20 s timeout). */
  async getCatalogueBackup(signal?: AbortSignal): Promise<CatalogueBackupStatus> {
    return apiRequest<CatalogueBackupStatus>('/system/catalogue-backup', { signal });
  },

  async getStorageDevices(): Promise<StorageDevice[]> {
    return apiRequest<StorageDevice[]>('/system/storage/devices');
  },

  async mountDevice(device: string): Promise<{ mountpoint: string | null; message: string }> {
    return apiRequest('/system/storage/mount', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ device }),
    });
  },

  async activateStorage(path: string): Promise<{ projects_path: string; message: string }> {
    return apiRequest('/system/storage/activate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path }),
    });
  },

  async resetStorage(): Promise<{ projects_path: string; message: string }> {
    return apiRequest('/system/storage/activate', { method: 'DELETE', timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  },

  async unmountDevice(mountpoint: string): Promise<{ message: string; override_cleared: boolean }> {
    return apiRequest('/system/storage/mount', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mountpoint }),
    });
  },

  /**
   * Powers off or reboots the unit.
   *   200 → { message } (the backend shuts down or restarts seconds later)
   *   501 → power control unavailable (e.g. a development environment)
   *   401 → session expired
   * Throws PowerControlError with the status so the UI can show the right
   * message. Calls fetch directly, not through apiRequest(), with
   * POWER_REQUEST_TIMEOUT_MS: no answer by then rejects with the
   * TimeoutError of withTimeLimit.
   */
  async powerControl(action: PowerAction): Promise<{ message: string }> {
    const { response, data } = await withTimeLimit({ timeoutMs: POWER_REQUEST_TIMEOUT_MS }, async (init) => {
      const response = await fetch(`${getApiBase()}/system/power`, sessionRequestInit({
        ...init,
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      }));
      // The body may be empty or not JSON (e.g. from a proxy); that must not
      // break the declared return type.
      const data: { message?: string; detail?: string } =
        await response.json().catch(() => ({}));
      return { response, data };
    });
    if (!response.ok) {
      throw new PowerControlError(response.status, data.detail || data.message || `HTTP ${response.status}`);
    }
    return {
      message: typeof data.message === 'string' && data.message
        ? data.message
        : get(m).api_power_ack
    };
  },
};

// ============================================================================
// PROJECT MEMBERS
// ============================================================================

export interface ProjectMember {
  project_id:   number;
  user_id:      number;
  role:         'operator' | 'reviewer' | 'admin' | 'testing';
  added_at:     string;
  added_by?:    string;
  username:     string;
  email:        string | null;
  is_implicit:  boolean;
}

export interface AddProjectMemberData {
  user_id: number;
  role:    'operator' | 'reviewer';
}

export const projectMembersApi = {
  async list(projectId: number): Promise<ProjectMember[]> {
    return apiRequest<ProjectMember[]>(`/projects/${projectId}/members`);
  },

  async add(projectId: number, data: AddProjectMemberData): Promise<ProjectMember> {
    return apiRequest<ProjectMember>(`/projects/${projectId}/members`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
  },

  async remove(projectId: number, userId: number): Promise<void> {
    await apiRequest(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
  },
};

// ============================================================================
// NETWORK (NEH-253)
// ============================================================================
//
// The routes of app/api/network.py. Every route answers 501 on a machine
// without NetworkManager (a development machine) and 503 with the problem
// `network_manager_unavailable` when NetworkManager does not answer. A
// refused join or forget is a 409 whose detail is {message, problems:
// [{code, message}]}; the interface translates the codes and never shows the
// backend's English. No password or user name is ever put in a URL: they
// travel only in the body of POST /network/wifi/join.

export type NetworkInterfaceState = 'connected' | 'connecting' | 'disconnected' | 'unavailable' | 'unmanaged';

export interface NetworkInterface {
  device:     string;
  type:       'ethernet' | 'wifi';
  state:      NetworkInterfaceState;
  connection: string | null;
  mac:        string | null;
  /** Addresses with their prefix, as "192.168.10.42/24". */
  ipv4:       string[];
  ipv6:       string[];
  /** The IPv4 gateway. */
  gateway:    string | null;
  /** IPv4 servers first, then IPv6. */
  dns:        string[];
  /** Only for a connected Wi-Fi interface. */
  ssid:       string | null;
  signal:     number | null;
}

/** no_connection has no device; the others name the interface they concern. */
export interface NetworkStatusProblem {
  code:   string;
  device: string | null;
}

export interface NetworkPermissions {
  scan:    boolean;
  control: boolean;
  modify:  boolean;
}

export interface NetworkStatus {
  hostname:    string;
  wifiDevice:  string | null;
  permissions: NetworkPermissions;
  interfaces:  NetworkInterface[];
  problems:    NetworkStatusProblem[];
}

export type WifiSecurity = 'open' | 'password' | 'enterprise';

export interface WifiNetwork {
  ssid:     string;
  signal:   number;
  security: WifiSecurity;
  inUse:    boolean;
  saved:    boolean;
}

export interface SavedWifiNetwork {
  uuid:     string;
  name:     string;
  ssid:     string;
  security: WifiSecurity;
  active:   boolean;
}

export interface WifiScan {
  networks:  WifiNetwork[];
  saved:     SavedWifiNetwork[];
  /** Whether a fresh scan was made for this answer. */
  rescanned: boolean;
}

/** The server certificate a sign-in server presented, when one was read. */
export interface WifiJoinServer {
  subject: string;
  names:   string[];
  hash:    string;
}

export interface WifiJoinProblem {
  code:   string;
  detail: string | null;
  server: WifiJoinServer | null;
}

export interface WifiJoinState {
  state:      'idle' | 'joining' | 'joined' | 'failed';
  ssid:       string | null;
  startedAt:  string | null;
  finishedAt: string | null;
  problem:    WifiJoinProblem | null;
  /** Whether the Wi-Fi connection active before the join came back; null when there was none. */
  restored:   boolean | null;
}

export type WifiJoinRequest =
  | { ssid: string; security: 'open' }
  | { ssid: string; security: 'password'; password: string }
  | {
      ssid:               string;
      security:           'enterprise';
      identity:           string;
      password:           string;
      serverName:         string;
      method:             'peap' | 'ttls';
      innerMethod:        'mschapv2' | 'pap';
      anonymousIdentity?: string;
    };

/**
 * The longest each network request waits for an answer, in ms. A request
 * past its limit is aborted and rejects without a `status`, as a request
 * that never reached the unit does. The backend bounds each nmcli call
 * (app/core/network.py): a read by _READ_TIMEOUT (15 s), a fresh scan by
 * _SCAN_TIMEOUT (20 s), a delete by _WRITE_TIMEOUT (15 s).
 *
 * - status: 5 s. It is polled; a slow read is better given up and made
 *   again (stores/network).
 * - wifi: 20 s, one nmcli read with a margin; the cached list answers at once.
 * - rescan: 35 s, the fresh scan and the reads of the saved networks.
 * - join: 10 s; the join runs on the unit after the 202 and is polled.
 * - joinState: 5 s, polled about once a second.
 * - forget: 20 s. A forget usually answers within a second or two; the 204
 *   of a forget of the network in use is often lost with the link, and a
 *   forget given up is treated as of unknown outcome and the state read
 *   again, so a shorter wait costs nothing.
 */
export const NETWORK_LIMITS_MS = {
  status:    5_000,
  wifi:      20_000,
  rescan:    35_000,
  join:      10_000,
  joinState: 5_000,
  forget:    20_000,
} as const;

/** Run `request` with a signal that aborts after `ms`, or when `outer` aborts. */
async function bounded<T>(ms: number, outer: AbortSignal | undefined, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener('abort', abort);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}

export const networkApi = {
  /** GET /network/status: interfaces, problems and permissions, for every role. */
  async status(signal?: AbortSignal): Promise<NetworkStatus> {
    return bounded(NETWORK_LIMITS_MS.status, signal, (s) => apiRequest<NetworkStatus>('/network/status', { signal: s }));
  },

  /** GET /network/wifi; with `rescan` the unit scans again first (about 10 s). */
  async wifi(rescan = false, signal?: AbortSignal): Promise<WifiScan> {
    return bounded(rescan ? NETWORK_LIMITS_MS.rescan : NETWORK_LIMITS_MS.wifi, signal, (s) =>
      apiRequest<WifiScan>(rescan ? '/network/wifi?rescan=true' : '/network/wifi', { signal: s }));
  },

  /** POST /network/wifi/join: 202 with the join state, which then has to be polled. */
  async join(body: WifiJoinRequest, signal?: AbortSignal): Promise<WifiJoinState> {
    return bounded(NETWORK_LIMITS_MS.join, signal, (s) =>
      apiRequest<WifiJoinState>('/network/wifi/join', { method: 'POST', body: JSON.stringify(body), signal: s }));
  },

  /** GET /network/wifi/join: the last join's state. */
  async joinState(signal?: AbortSignal): Promise<WifiJoinState> {
    return bounded(NETWORK_LIMITS_MS.joinState, signal, (s) => apiRequest<WifiJoinState>('/network/wifi/join', { signal: s }));
  },

  /** DELETE /network/wifi/saved/{uuid} (204); `force` forgets the network the unit is on. */
  async forget(uuid: string, force = false, signal?: AbortSignal): Promise<void> {
    const path = `/network/wifi/saved/${encodeURIComponent(uuid)}`;
    await bounded(NETWORK_LIMITS_MS.forget, signal, (s) =>
      apiRequest<void>(force ? `${path}?force=true` : path, { method: 'DELETE', signal: s }));
  },
};

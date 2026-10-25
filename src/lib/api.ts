import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { env } from '$env/dynamic/public';
import { get } from 'svelte/store';
import { m } from './i18n';
import { authStore } from './stores/auth';
import { tokenStore } from './stores/token';

// Re-exportado por compatibilidad — el resto de la app importa tokenStore
// desde acá (ver login/+page.svelte). La implementación vive en
// stores/token.ts, la única fuente de verdad del access token (NEH-41).
export { tokenStore };

/**
 * Centralized API client for Digitization Toolkit
 * Handles authentication, documents, images, projects, and cameras
 */

// Get appropriate API base URL (browser vs SSR)
// Uses dynamic env vars so the same Docker image works regardless of hostname/IP.
// Set PUBLIC_API_BASE and PUBLIC_API_BASE_SSR in docker-compose environment.
function getApiBase(): string {
  const fallback = 'http://localhost:8000';
  return browser
    ? (env.PUBLIC_API_BASE || fallback)
    : (env.PUBLIC_API_BASE_SSR || env.PUBLIC_API_BASE || fallback);
}

// Thrown for 401/403 responses so callers that care can distinguish an
// auth failure from any other API error (most existing catch blocks just
// read `.message`, which still works since this extends Error).
export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
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
// the comment above its use in apiRequest(). `sentToken` is the token the
// request carried, read from localStorage before it went out.
function isDeadSession(status: number, endpoint: string, sentToken: string | null): boolean {
  if (status !== 401) return false;
  if (SESSION_EXEMPT_ENDPOINTS.some(p => endpoint.startsWith(p))) return false;
  return !!sentToken || authStore.getToken() !== null;
}

// API request helper with authentication
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const base = getApiBase();
  const token = tokenStore.get();

  const headers: { [key: string]: string } = {
    'Content-Type': 'application/json',
    ...(options.headers as { [key: string]: string })
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers
  });

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

    // 401 means the token itself is missing/invalid/expired (or its user was
    // deactivated) — the session is genuinely dead, so clear it globally.
    // Unless this tab had no session at all, which isDeadSession() checks.
    // A 401 cannot mean "your session died" when there was no session, and
    // reading it that way broke first-run setup: POST /auth/register on the
    // first-user path 401s on a wrong bootstrap token (auth.py), the
    // redirect fired, and the operator landed on /login — which on a fresh
    // appliance has no account to log into. The setup page has handled that
    // 401 all along and never got to render it.
    // A missing token alone does not mean there was no session. Logging out
    // in another tab removes the token from localStorage, which this request
    // read, but leaves this tab's authStore holding the old session, which
    // the route guards read. So the request goes out with no bearer and gets
    // a 401, and this tab still shows itself as signed in. The cached session
    // in authStore counts as a session here, so that 401 clears it.
    // 403 means the token is fine but the role/permission check for this one
    // action failed (RoleChecker and every per-resource permission check in
    // the backend run strictly after get_current_user, which is what raises
    // 401 — so a 403 nearly always means a valid, active session. The
    // exceptions are POST /auth/login, which returns 403 for an inactive user
    // with no session at all, and POST /auth/register, which returns 403 when
    // the caller's otherwise valid token belongs to an inactive user; both
    // are harmless here, because a 403 never clears the session). Treating it the same as a dead session would silently log a
    // user out of a perfectly good session over a single denied action, and
    // would swallow the inline "you can't do that" errors that callers
    // (e.g. project member management, bulk status changes) already show.
    // Only meaningful in the browser: clears the stale/rejected session and
    // routes to /login so the UI never keeps rendering as a broken
    // "logged-in" shell against a token the backend has already rejected.
    if (isDeadSession(response.status, endpoint, token) && browser) {
      authStore.clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        goto('/login');
      }
    }

    if (response.status === 401 || response.status === 403) {
      // Pass the extracted string, not the raw detail: if an auth error ever
      // carries a structured detail body, Error.message must stay readable.
      throw new AuthError(response.status, message);
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
// helper rather than a special case inside apiRequest(). Same auth header,
// same 401/403 handling, same error-body parsing into the thrown Error's
// message as apiRequest().
async function apiRequestBlob(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ blob: Blob; headers: Headers }> {
  const base = getApiBase();
  const token = tokenStore.get();

  const headers: { [key: string]: string } = {
    ...(options.headers as { [key: string]: string })
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: get(m).api_request_failed }));
    const detail = errorData.detail || `HTTP ${response.status}`;
    const isStructuredDetail = typeof detail === 'object' && detail !== null;
    const message = isStructuredDetail
      ? (detail as { message?: string }).message || JSON.stringify(detail)
      : String(detail);

    if (isDeadSession(response.status, endpoint, token) && browser) {
      authStore.clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        goto('/login');
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(response.status, message);
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
  role: 'admin' | 'operator' | 'reviewer';
  is_active: boolean;
  created_at?: string;
}

// Alias used by usersApi — same shape as what /auth/users returns
export type UserRead = User;

export interface AuthResponse {
  access_token: string;
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
   * Login with username and password
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    tokenStore.set(response.access_token);
    return response;
  },

  /**
   * Refresh authentication token. Routes through authStore.updateToken()
   * (not tokenStore directly) so the reactive session state — and anything
   * derived from it — stays in sync with the new token (NEH-41: the old
   * version wrote only tokenStore, silently diverging from authStore).
   */
  async refreshToken(): Promise<AuthResponse> {
    const response = await apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST'
    });
    authStore.updateToken(response.access_token);
    return response;
  },

  /**
   * Change user password
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
   * Used to validate a stored token is still good — on session
   * start/reload and after login — since /users/me requires a valid,
   * active-user token and 401s otherwise.
   */
  async me(): Promise<User> {
    return apiRequest<User>('/users/me');
  },

  /** List all users. Requires admin token. */
  async list(): Promise<UserRead[]> {
    return apiRequest<UserRead[]>('/auth/users');
  },

  /** Get a single user by ID. Requires admin token. */
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

  /** Change a user's role. Requires admin token. */
  async updateRole(id: number, role: 'admin' | 'operator' | 'reviewer'): Promise<UserRead> {
    return apiRequest<UserRead>(`/auth/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  /** Activate or deactivate a user account. Requires admin token. */
  async setActive(id: number, isActive: boolean): Promise<UserRead> {
    return apiRequest<UserRead>(`/auth/users/${id}/active?is_active=${isActive}`, {
      method: 'PATCH',
    });
  },

  /** Delete a user permanently. Requires admin token. */
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
}

export interface CreateProjectData {
  name: string;
  description?: string;
  fondo?: string;
  serie?: string;
  signatura?: string;
  created_by?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  fondo?: string;
  serie?: string;
  signatura?: string;
}

export const projectsApi = {
  /**
   * Get all projects
   */
  async list(): Promise<Project[]> {
    return apiRequest<Project[]>('/projects');
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
    return apiRequest<Project>('/projects', {
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
      method: 'DELETE'
    });
  },

  /**
   * Move all top-level collections from this project to another project.
   */
  async moveCollections(fromId: number, toId: number): Promise<{ moved: number; target_project_id: number }> {
    return apiRequest(`/projects/${fromId}/move-collections`, {
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
  record_count?: number;  // número de registros — devuelto por el backend en algunos endpoints
  // Fecha del registro modificado más recientemente dentro del volumen: cuándo
  // se trabajó por última vez. Distinto de updated_at, que solo se mueve al
  // editar la fila del volumen. Null si no tiene registros (NEH-247).
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
}

export interface UpdateCollectionData extends VolumeIdentityData {
  name?: string;
  description?: string;
  collection_type?: string;
  parent_collection_id?: number;
  archival_metadata?: { [key: string]: any };
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
    return apiRequest<Collection[]>(`/collections${query ? '?' + query : ''}`);
  },

  /**
   * Get the complete set of collections matching the given filters.
   *
   * GET /collections is paginated (backend default limit=100, max 1000 per
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
    return apiRequest<Collection>('/collections', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Update a collection
   */
  async update(id: number, data: UpdateCollectionData): Promise<Collection> {
    return apiRequest<Collection>(`/collections/${id}`, {
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
      method: 'PATCH',
      body: JSON.stringify({ ordered_ids })
    });
  },

  /**
   * Renumber the volume's records: the backend sets their `sequence` to
   * 1..N in the current display order, in one transaction. No file is
   * renamed. `renumbered` is the number of records. If the commit fails
   * (500), every sequence stays as it was.
   */
  async renumberImages(collectionId: number): Promise<{ renumbered: number }> {
    return apiRequest(`/collections/${collectionId}/images/renumber`, { method: 'POST' });
  },

  /** The volume's offsite state (NEH-227). `signal` lets the caller abort it. */
  async getOffsiteState(collectionId: number, signal?: AbortSignal): Promise<VolumeOffsiteState> {
    return apiRequest<VolumeOffsiteState>(`/collections/${collectionId}/offsite`, { signal });
  },

  /**
   * Dry run of freeing the volume from the card (NEH-248): what would be
   * removed and what would stay, and why. Admin only. Changes nothing.
   * GET /collections/{id}/offsite/free (plan_free in app/core/offsite_free.py).
   */
  async planFree(collectionId: number): Promise<FreePlan> {
    return apiRequest<FreePlan>(`/collections/${collectionId}/offsite/free`);
  },

  /** Start freeing the volume from the card; 202 with a job to poll. Admin only. */
  async startFree(collectionId: number): Promise<OffsiteJobStart> {
    return apiRequest<OffsiteJobStart>(`/collections/${collectionId}/offsite/free`, { method: 'POST' });
  },

  /** Start copying the volume's freed files back to the card; 202 with a job to poll. Admin only. */
  async startRestore(collectionId: number): Promise<OffsiteJobStart> {
    return apiRequest<OffsiteJobStart>(`/collections/${collectionId}/offsite/restore`, { method: 'POST' });
  },

  /** The state of a free or restore job, with its result once done. Admin only. */
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
    const { blob, headers } = await apiRequestBlob(`/collections/${collectionId}/capture-manifest`);
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
      { method: 'POST' }
    );
  },

  /**
   * Take the handover back: the collection's in_review records return to
   * captured, for an operator who handed a tomo over too early (NEH-260).
   * Records a reviewer has already approved or rejected are left alone.
   */
  async takeBack(collectionId: number): Promise<{ collection_id: number; taken_back: number }> {
    return apiRequest<{ collection_id: number; taken_back: number }>(
      `/collections/${collectionId}/take-back`,
      { method: 'POST' }
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
    return apiRequest(`/collections/${collectionId}/export`, { method: 'POST' });
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
    const base = getApiBase();
    const token = tokenStore.get();
    return `${base}/collections/${collectionId}/export/download${token ? '?token=' + token : ''}`;
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
  status: 'captured' | 'in_review' | 'rejected' | 'approved';
  sequence?: number;
  // Which camera setup produced this document — set once at capture time.
  // It does not decide what a rejection flags: the backend flags every
  // current image of the record, whatever its capture_mode (reject_record,
  // records.py).
  capture_mode: 'single' | 'dual';
}

// The predefined rejection reasons, mirroring the backend's
// PREDEFINED_REJECTION_REASONS and the annotation feature's error types.
export const PREDEFINED_REJECTION_REASONS = ['blur', 'glare', 'shadow', 'focus', 'exposure', 'dirt'] as const;
export type PredefinedRejectionReason = (typeof PREDEFINED_REJECTION_REASONS)[number];

export interface RejectRecordData {
  predefined_reason: PredefinedRejectionReason;
  comment?: string;
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
    return apiRequest<Record[]>(`/records${query ? '?' + query : ''}`);
  },

  /**
   * Get the complete set of records matching the given filters.
   *
   * GET /records is paginated (backend default limit=100, max 1000 per page),
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
    return apiRequest<Record>('/records', {
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
    const base = getApiBase();
    const token = tokenStore.get();
    return `${base}/records/images/${imageId}/thumbnail${token ? '?token=' + token : ''}`;
  },

  /**
   * Get file download URL for a record image: the stored master, unchanged
   * (a RAW master comes back as RAW bytes). For an <img>, use
   * getImagePreviewUrl.
   */
  getImageFileUrl(imageId: number): string {
    const base = getApiBase();
    const token = tokenStore.get();
    return `${base}/records/images/${imageId}/file${token ? '?token=' + token : ''}`;
  },

  /**
   * Get a browser-displayable URL for a record image: a JPEG/PNG/WebP master
   * itself, or a RAW master's JPEG preview. The backend answers 404 when
   * there is none (RAW without a preview, TIFF) and never sends RAW bytes.
   */
  getImagePreviewUrl(imageId: number): string {
    const base = getApiBase();
    const token = tokenStore.get();
    return `${base}/records/images/${imageId}/preview${token ? '?token=' + token : ''}`;
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
  // Capabilities
  has_aperture_control?: boolean;
  supports_zoom?: boolean;
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
    return apiRequest<CameraDevice[]>('/cameras/devices');
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
      method: 'POST'
    });
  },

  /**
   * Single camera capture
   */
  async capture(data: CaptureRequest): Promise<CaptureResponse> {
    return apiRequest<CaptureResponse>('/cameras/capture', {
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
  async testCapture(cameraIndex: number): Promise<TestCaptureResult> {
    const { blob, headers } = await apiRequestBlob(`/cameras/test-capture/${cameraIndex}`, {
      method: 'POST'
    });
    const parseNumericHeader = (value: string | null): number | null => {
      if (value === null) return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    };
    return {
      blob,
      seconds: parseNumericHeader(headers.get('X-Capture-Seconds')),
      bytes: parseNumericHeader(headers.get('X-Capture-Bytes'))
    };
  },

  /**
   * Dual camera capture (left + right)
   */
  async captureDual(data: DualCaptureRequest): Promise<CaptureResponse> {
    return apiRequest<CaptureResponse>('/cameras/capture/dual', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Autofocus calibration
   */
  async calibrate(data: CalibrationRequest = {}): Promise<CalibrationResponse> {
    return apiRequest<CalibrationResponse>('/cameras/calibrate', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * White balance calibration
   */
  async calibrateWhiteBalance(data: WhiteBalanceCalibrationRequest = {}): Promise<WhiteBalanceCalibrationResponse> {
    return apiRequest<WhiteBalanceCalibrationResponse>('/cameras/calibrate/white-balance', {
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
      method: 'POST',
      body: JSON.stringify({ camera_index: cameraIndex, awb_gains: awbGains })
    });
  },

  /**
   * Get current focus (lens position in dioptres)
   */
  async getFocus(cameraIndex: number): Promise<{ camera_index: number; lens_position: number }> {
    return apiRequest<{ camera_index: number; lens_position: number }>(`/cameras/focus/${cameraIndex}`);
  },

  /**
   * Set manual focus (lens position in dioptres; 0 = infinity, 10 ≈ 10 cm)
   */
  async setFocus(cameraIndex: number, lensPosition: number): Promise<{ camera_index: number; lens_position: number }> {
    return apiRequest<{ camera_index: number; lens_position: number }>(`/cameras/focus/${cameraIndex}`, {
      method: 'POST',
      body: JSON.stringify({ lens_position: lensPosition })
    });
  },

  /**
   * Apply live camera controls (exposure, white balance, gain, etc.)
   */
  async setCameraControls(cameraIndex: number, controls: CameraControlsRequest): Promise<void> {
    await apiRequest(`/cameras/settings/${cameraIndex}`, {
      method: 'POST',
      body: JSON.stringify(controls)
    });
  },

  /**
   * Delete stale preview temp files from /tmp (dtk_preview_c*.jpg).
   * Safe to call at any time — active previews recreate the file on the next poll.
   */
  async flushPreviewTmp(): Promise<{ deleted: number; detail: string }> {
    return apiRequest<{ deleted: number; detail: string }>('/cameras/preview/tmp', {
      method: 'DELETE'
    });
  },

  /**
   * Get current backend capabilities (live_preview, focus_control, etc.)
   */
  async getCapabilities(): Promise<CameraCapabilities> {
    return apiRequest<CameraCapabilities>('/cameras/capabilities');
  },

  /**
   * Read current DSLR settings from the active PTP session.
   * Only available when the active backend is gphoto2 (dslr_settings=true).
   */
  async getDSLRSettings(cameraIndex: number): Promise<DSLRSettings> {
    return apiRequest<DSLRSettings>(`/cameras/dslr/${cameraIndex}/settings`);
  },

  /**
   * Apply DSLR settings (ISO, shutter speed, aperture, image format).
   * Only fields provided are applied; others are left at their current camera value.
   * Only available when the active backend is gphoto2 (dslr_settings=true).
   */
  async applyDSLRSettings(cameraIndex: number, settings: DSLRSettingsUpdate): Promise<DSLRSettings> {
    return apiRequest<DSLRSettings>(`/cameras/dslr/${cameraIndex}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  /**
   * Persist the capture rotation the appliance should remember for the body
   * currently at `cameraIndex`. `hardwareId` pins the write to that specific
   * body (R30-4) — the backend returns 409 if a different body now sits at
   * that index, which callers should treat like any other save error (the
   * next device refresh re-seeds the index from whatever is really there).
   * Resolves once the write is acknowledged; the device row the backend
   * returns is not needed by any caller, and apiRequest yields undefined on
   * an empty response, so the promise is typed as void rather than as a row.
   */
  async setOrientation(cameraIndex: number, hardwareId: string, orientation: number): Promise<void> {
    await apiRequest<CameraDevice>(`/cameras/${cameraIndex}/orientation`, {
      method: 'PUT',
      body: JSON.stringify({ orientation, hardware_id: hardwareId }),
    });
  },
};

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

// Records per status in one collection. All four keys are always present.
export interface StatusCounts {
  captured:  number;
  in_review: number;
  rejected:  number;
  approved:  number;
}

export interface CollectionActivity {
  collection_id: number;
  status_counts: StatusCounts;
  // Sum of the four status counts.
  record_count: number;
  // Newest status change among the collection's records (deleted records
  // included), naive UTC ISO string; null when there has been none.
  last_status_change_at: string | null;
}

/** One local calendar day of activity, from GET /activity/daily. */
export interface DailyActivity {
  date: string;              // YYYY-MM-DD, a local calendar day
  captured_images: number;
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
// HEALTH CHECK
// ============================================================================

export const healthApi = {
  async check(): Promise<{ status: string }> {
    return apiRequest<{ status: string }>('/health');
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
  tenant:           string | null;
  misconfigured:    string | null;
  volumes:          number;
  volumes_received: number;
  total:            number;
  verified:         number;
  pending:          number;
  refused:          number;
  last_verified_at: string | null;   // ISO 8601 datetime
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
  reason:             'token' | 'not_found' | 'redirect' | string | null;
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

// Apagado / reinicio del equipo.
export type PowerAction = 'poweroff' | 'reboot';

/**
 * Error de la llamada de energía que conserva el código HTTP.
 * Necesario para distinguir 501 (control no disponible — máquina de
 * desarrollo) de un error real. powerControl() llama a fetch directamente,
 * sin pasar por apiRequest().
 */
export class PowerControlError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PowerControlError';
    this.status = status;
  }
}

export const systemApi = {
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
    return apiRequest('/system/storage/activate', { method: 'DELETE' });
  },

  async unmountDevice(mountpoint: string): Promise<{ message: string; override_cleared: boolean }> {
    return apiRequest('/system/storage/mount', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mountpoint }),
    });
  },

  /**
   * Apagar o reiniciar el equipo.
   *   200 → { message } (el backend se apaga o reinicia segundos después)
   *   501 → control de energía no disponible (p. ej. entorno de desarrollo)
   *   401 → sesión expirada
   * Lanza PowerControlError con el status para que la UI muestre el mensaje
   * adecuado. Llama a fetch directamente, sin pasar por apiRequest().
   */
  async powerControl(action: PowerAction): Promise<{ message: string }> {
    const base  = getApiBase();
    const token = tokenStore.get();
    const headers: { [key: string]: string } = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${base}/system/power`, {
      method: 'POST',
      headers,
      body:   JSON.stringify({ action }),
    });

    // El cuerpo puede venir vacío o no ser JSON (p. ej. proxies); nunca
    // dejamos que eso rompa el tipo de retorno declarado.
    const data: { message?: string; detail?: string } =
      await response.json().catch(() => ({}));
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
  role:         'operator' | 'reviewer' | 'admin';
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

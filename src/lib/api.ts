import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { env } from '$env/dynamic/public';
import { get } from 'svelte/store';
import { m } from './i18n';
import { authStore } from './stores/auth';

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

// Token management
export const tokenStore = {
  get: (): string | null => {
    if (!browser) return null;
    return localStorage.getItem('access_token');
  },
  set: (token: string) => {
    if (browser) {
      localStorage.setItem('access_token', token);
    }
  },
  clear: () => {
    if (browser) {
      localStorage.removeItem('access_token');
    }
  }
};

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
export class ApiError extends Error {
  detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.detail = detail;
  }
}

// Endpoints where a 401 means "bad input" (wrong credentials, wrong old
// password), not "your session is dead" — there's either no session yet or
// the session is perfectly valid, so these must NOT trigger the global
// clear-session-and-redirect below.
const SESSION_EXEMPT_ENDPOINTS = ['/auth/login', '/auth/password-reset'];

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
    // 403 means the token is fine but the role/permission check for this one
    // action failed (RoleChecker and every per-resource permission check in
    // the backend run strictly after get_current_user, which is what raises
    // 401 — a 403 can only happen on an already-valid, already-active
    // session). Treating it the same as a dead session would silently log a
    // user out of a perfectly good session over a single denied action, and
    // would swallow the inline "you can't do that" errors that callers
    // (e.g. project member management, bulk status changes) already show.
    const isSessionExempt = SESSION_EXEMPT_ENDPOINTS.some(p => endpoint.startsWith(p));
    const isDeadSession = response.status === 401 && !isSessionExempt;

    // Only meaningful in the browser: clears the stale/rejected session and
    // routes to /login so the UI never keeps rendering as a broken
    // "logged-in" shell against a token the backend has already rejected.
    if (isDeadSession && browser) {
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

    throw new ApiError(message, isStructuredDetail ? detail : undefined);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json();
}

// ============================================================================
// AUTHENTICATION API
// ============================================================================

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
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
   * Logout (clear local token)
   */
  logout(): void {
    tokenStore.clear();
  },

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<AuthResponse> {
    const response = await apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST'
    });
    tokenStore.set(response.access_token);
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
  email: string;
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
  id: number;
  name: string;
  description?: string;
  collection_type?: string;
  project_id?: number;
  parent_collection_id?: number;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  archival_metadata?: { [key: string]: any };
}

export interface CollectionWithChildren extends Collection {
  child_collections: Collection[];
  record_count?: number;
}

export interface CreateCollectionData {
  name: string;
  description?: string;
  collection_type?: string;
  project_id?: number;
  parent_collection_id?: number;
  created_by?: string;
  archival_metadata?: { [key: string]: any };
}

export interface UpdateCollectionData {
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
   * Set display order of records in a collection.
   * ordered_ids: record IDs in the desired order (0-based sequence assigned automatically).
   */
  async reorderRecords(collectionId: number, ordered_ids: number[]): Promise<{ reordered: number }> {
    return apiRequest(`/collections/${collectionId}/records/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ ordered_ids })
    });
  },

  /**
   * Physically renumber every image file in the collection, sequentially
   * from 1 (zero-padded), based on current display order. All-or-nothing:
   * on any failure no files or DB rows are left renumbered.
   */
  async renumberImages(collectionId: number): Promise<{ renumbered: number; prefix: string; width: number }> {
    return apiRequest(`/collections/${collectionId}/images/renumber`, { method: 'POST' });
  },

  /**
   * Trigger a BagIt export for the collection (all records must be approved).
   * Returns metadata about the generated zip including a download_url.
   */
  async exportBagit(collectionId: number): Promise<{
    bag_name: string;
    zip_filename: string;
    size_bytes: number;
    download_url: string;
  }> {
    return apiRequest(`/collections/${collectionId}/export`, { method: 'POST' });
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
}

export interface Record {
  id: number;
  title: string;
  description?: string;
  object_typology?: string; // book, dossier, document, map, planimetry, other
  author?: string;
  material?: string;
  date?: string;
  custom_attributes?: string;
  project_id?: number;
  collection_id?: number;
  created_by?: string;
  created_at?: string;
  modified_at?: string;
  images: RecordImage[];
  // QA workflow (NEH-208): no more "captured" resting state — a record
  // enters the queue as "in_review" the instant it's captured.
  status: 'in_review' | 'rejected' | 'approved';
  sequence?: number;
  // Which camera setup produced this document — set once at capture time.
  // Determines rejection scope (1 vs 2 images) on the backend; the
  // frontend never needs to compute this itself, only reflect it.
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
  object_typology?: string;
  author?: string;
  material?: string;
  date?: string;
  custom_attributes?: string;
  project_id?: number;
  collection_id?: number;
  created_by?: string;
}

export interface UpdateRecordData {
  title?: string;
  description?: string;
  object_typology?: string;
  author?: string;
  material?: string;
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
    object_typology?: string;
    orphaned?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<Record[]> {
    const queryParams = new URLSearchParams();
    if (params?.collection_id !== undefined) queryParams.set('collection_id', params.collection_id.toString());
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    if (params?.object_typology !== undefined) queryParams.set('object_typology', params.object_typology);
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
    object_typology?: string;
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
   * Get file download URL for a record image
   */
  getImageFileUrl(imageId: number): string {
    const base = getApiBase();
    const token = tokenStore.get();
    return `${base}/records/images/${imageId}/file${token ? '?token=' + token : ''}`;
  },

  /**
   * Delete a specific image (file + thumbnail + DB row)
   */
  async deleteImage(imageId: number): Promise<void> {
    await apiRequest(`/records/images/${imageId}`, { method: 'DELETE' });
  },

  /**
   * Change the QA status of a single record.
   * NEH-208: the generic status endpoint only allows in_review -> approved
   * now — rejection requires the mandatory-reason reject() below.
   */
  async updateStatus(
    id: number,
    status: 'in_review' | 'approved'
  ): Promise<Record> {
    return apiRequest<Record>(`/records/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  /**
   * Reject a record's current capture with a mandatory predefined reason.
   * Flags every current image (both sides of a dual-camera pair, or the
   * single image) as pending recapture — the backend decides how many
   * based on the record's capture_mode, the frontend just reflects
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
   * Single camera capture
   */
  async capture(data: CaptureRequest): Promise<CaptureResponse> {
    return apiRequest<CaptureResponse>('/cameras/capture', {
      method: 'POST',
      body: JSON.stringify(data)
    });
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

// Apagado / reinicio del equipo.
export type PowerAction = 'poweroff' | 'reboot';

/**
 * Error de la llamada de energía que conserva el código HTTP.
 * Necesario para distinguir 501 (control no disponible — máquina de
 * desarrollo) de un error real, ya que apiRequest() descarta el status.
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
   * adecuado. No usamos apiRequest() porque descarta el código HTTP.
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
  email:        string;
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

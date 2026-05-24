import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

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
    const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(errorData.detail || `HTTP ${response.status}`);
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
   * Register a new user
   */
  async register(data: RegisterData): Promise<User> {
    return apiRequest<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
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
    await apiRequest(`/auth/${id}`, { method: 'DELETE' });
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
}

export interface CaptureRequest {
  project_name: string;
  camera_index?: number;
  resolution?: string;
  include_resolution_in_filename?: boolean;
  record_id?: number;
  record_title?: string;
  collection_id?: number;
}

export interface DualCaptureRequest {
  project_name: string;
  resolution?: string;
  include_resolution_in_filename?: boolean;
  stagger_ms?: number;
  record_id?: number;
  record_title?: string;
  sequence?: number;
  collection_id?: number;
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
  }
};

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

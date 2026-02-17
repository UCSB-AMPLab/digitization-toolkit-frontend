import { browser } from '$app/environment';
import { PUBLIC_API_BASE } from '$env/static/public';
import { env } from '$env/dynamic/public';

/**
 * Centralized API client for Digitization Toolkit
 * Handles authentication, documents, images, projects, and cameras
 */

// Get appropriate API base URL (browser vs SSR)
function getApiBase(): string {
  return browser ? PUBLIC_API_BASE : (env.PUBLIC_API_BASE_SSR || PUBLIC_API_BASE);
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
  is_active: boolean;
  created_at?: string;
}

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
// PROJECTS API
// ============================================================================

export interface Project {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  created_by?: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  created_by?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
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
  project_id?: number;
  collection_id?: number;
}

export const recordsApi = {
  /**
   * Get all records (optionally filtered)
   */
  async list(params?: {
    collection_id?: number;
    project_id?: number;
    object_typology?: string;
    skip?: number;
    limit?: number;
  }): Promise<Record[]> {
    const queryParams = new URLSearchParams();
    if (params?.collection_id !== undefined) queryParams.set('collection_id', params.collection_id.toString());
    if (params?.project_id !== undefined) queryParams.set('project_id', params.project_id.toString());
    if (params?.object_typology !== undefined) queryParams.set('object_typology', params.object_typology);
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
}

export interface CaptureRequest {
  project_name: string;
  camera_index?: number;
  resolution?: string;
  include_resolution_in_filename?: boolean;
  record_id?: number;
  record_title?: string;
}

export interface DualCaptureRequest {
  project_name: string;
  resolution?: string;
  include_resolution_in_filename?: boolean;
  stagger_ms?: number;
  record_id?: number;
  record_title?: string;
  sequence?: number;
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

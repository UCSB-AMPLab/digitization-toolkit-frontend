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

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers
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
  email: string;
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
    return apiRequest<User>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Login with username and password
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await apiRequest<AuthResponse>('/api/auth/login', {
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
    const response = await apiRequest<AuthResponse>('/api/auth/refresh', {
      method: 'POST'
    });
    tokenStore.set(response.access_token);
    return response;
  },

  /**
   * Change user password
   */
  async resetPassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiRequest('/api/auth/password-reset', {
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
  updated_at?: string;
  document_count?: number;
}

export interface CreateProjectData {
  name: string;
  description?: string;
}

export const projectsApi = {
  /**
   * Get all projects
   */
  async list(): Promise<Project[]> {
    return apiRequest<Project[]>('/api/projects');
  },

  /**
   * Get a single project by ID
   */
  async get(id: number): Promise<Project> {
    return apiRequest<Project>(`/api/projects/${id}`);
  },

  /**
   * Create a new project
   */
  async create(data: CreateProjectData): Promise<Project> {
    return apiRequest<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Delete a project
   */
  async delete(id: number): Promise<void> {
    await apiRequest(`/api/projects/${id}`, {
      method: 'DELETE'
    });
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
    return apiRequest<Document[]>(`/api/projects/${projectId}/documents`);
  },

  /**
   * Get a single document
   */
  async get(id: number): Promise<Document> {
    return apiRequest<Document>(`/api/documents/${id}`);
  },

  /**
   * Create a new document
   */
  async create(data: CreateDocumentData): Promise<Document> {
    return apiRequest<Document>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Delete a document
   */
  async delete(id: number): Promise<void> {
    await apiRequest(`/api/documents/${id}`, {
      method: 'DELETE'
    });
  }
};

// ============================================================================
// CAMERAS API
// ============================================================================

export interface Camera {
  index: number;
  model: string;
  hardware_id: string;
  label?: string;
  role?: string;
}

export const camerasApi = {
  /**
   * List available cameras
   */
  async list(): Promise<Camera[]> {
    return apiRequest<Camera[]>('/api/cameras');
  },

  /**
   * Get camera settings
   */
  async getSettings(index: number): Promise<any> {
    return apiRequest(`/api/cameras/${index}/settings`);
  },

  /**
   * Capture image from camera
   */
  async capture(index: number, documentId?: number): Promise<any> {
    const params = documentId ? `?document_id=${documentId}` : '';
    return apiRequest(`/api/cameras/${index}/capture${params}`, {
      method: 'POST'
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

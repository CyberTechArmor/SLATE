// API Client with automatic token refresh

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string[]>;

  constructor(message: string, status: number, code?: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Token storage
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Token refresh state
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    accessToken = data.accessToken;
    return accessToken;
  } catch {
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  if (!accessToken) {
    return null;
  }
  return accessToken;
}

// Base fetch with auto-refresh
async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retry = true
): Promise<Response> {
  const token = await getValidToken();

  const headers: HeadersInit = {
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 - try to refresh token
  if (response.status === 401 && retry) {
    // Prevent multiple simultaneous refresh requests
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshToken();
    }

    const newToken = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (newToken) {
      // Retry the original request with new token
      return fetchWithAuth(url, options, false);
    }
  }

  return response;
}

// Parse response and handle errors
async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      const error = await response.json();
      throw new ApiError(
        error.message || 'An error occurred',
        response.status,
        error.error,
        error.details
      );
    }
    throw new ApiError('An error occurred', response.status);
  }

  if (isJson) {
    return response.json();
  }

  return {} as T;
}

// Auth API
export interface User {
  id: string;
  email: string;
  firstName: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export const authApi = {
  async signup(email: string, password: string, firstName: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, firstName }),
    });
    const data = await handleResponse<AuthResponse>(response);
    accessToken = data.accessToken;
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse<AuthResponse>(response);
    accessToken = data.accessToken;
    return data;
  },

  async refresh(): Promise<AuthResponse | null> {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      accessToken = data.accessToken;
      return data;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await fetchWithAuth('/auth/logout', { method: 'POST' });
    accessToken = null;
  },

  async me(): Promise<{ user: User }> {
    const response = await fetchWithAuth('/auth/me');
    return handleResponse(response);
  },
};

// Inquiries API
export interface Resource {
  id: string;
  inquiryId: string;
  type: 'link' | 'file';
  title: string;
  url: string | null;
  filename: string | null;
  mimeType: string | null;
  createdAt: string;
}

export interface Inquiry {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  resources: Resource[];
}

export const inquiriesApi = {
  async list(): Promise<{ inquiries: Inquiry[] }> {
    const response = await fetchWithAuth('/inquiries');
    return handleResponse(response);
  },

  async get(id: string): Promise<{ inquiry: Inquiry }> {
    const response = await fetchWithAuth(`/inquiries/${id}`);
    return handleResponse(response);
  },

  async create(title: string, content?: string): Promise<{ inquiry: Inquiry }> {
    const response = await fetchWithAuth('/inquiries', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    });
    return handleResponse(response);
  },

  async update(id: string, data: { title?: string; content?: string }): Promise<{ inquiry: Inquiry }> {
    const response = await fetchWithAuth(`/inquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(id: string): Promise<void> {
    const response = await fetchWithAuth(`/inquiries/${id}`, {
      method: 'DELETE',
    });
    await handleResponse(response);
  },

  async addResource(
    inquiryId: string,
    resource: {
      type: 'link' | 'file';
      title: string;
      url?: string;
      filename?: string;
      mimeType?: string;
    }
  ): Promise<{ resource: Resource }> {
    const response = await fetchWithAuth(`/inquiries/${inquiryId}/resources`, {
      method: 'POST',
      body: JSON.stringify(resource),
    });
    return handleResponse(response);
  },

  async deleteResource(inquiryId: string, resourceId: string): Promise<void> {
    const response = await fetchWithAuth(`/inquiries/${inquiryId}/resources/${resourceId}`, {
      method: 'DELETE',
    });
    await handleResponse(response);
  },
};

// Uploads API
export interface UploadResponse {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export const uploadsApi = {
  async upload(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetchWithAuth('/uploads', {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  getUrl(filename: string): string {
    return `${API_BASE}/uploads/${filename}`;
  },
};

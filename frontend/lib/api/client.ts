// ============================================================================
// API Client — Centralized fetch wrapper with JWT auth, auto-refresh, and
// error handling. All service modules use this client.
// ============================================================================

import { STORAGE_KEYS } from '@/lib/utils/constants';
import { isTokenExpired } from '@/lib/utils/jwt';

// Use relative paths by default so all devices on the local network can reach
// the Django backend through Next.js's server-side rewrite proxy (/api/* → :8000).
// Set NEXT_PUBLIC_API_URL only when the backend lives on a separate host.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/** Structured error from API responses */
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Get stored access token from localStorage.
 */
function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Get stored refresh token from localStorage.
 */
function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Attempt to refresh the access token using the refresh token.
 * Uses Simple JWT's token refresh endpoint.
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${BASE_URL}/api/auth/login/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      // Refresh failed — clear tokens and force re-login
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      return null;
    }

    const data = await response.json();
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access);
    if (data.refresh) {
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh);
    }
    return data.access;
  } catch {
    return null;
  }
}

/**
 * Core request function. Handles:
 * - Base URL prefixing
 * - JWT Authorization header
 * - Auto token refresh on 401
 * - JSON response parsing
 * - Error extraction
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  let token = getAccessToken();

  // Auto-refresh if token is about to expire
  if (token && isTokenExpired(token)) {
    token = await refreshAccessToken();
  }

  const headers: Record<string, string> = {};

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    cache: 'no-store',
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });

  // Handle 401 — try refresh once
  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(endpoint, options, false);
    }
    // Force redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new ApiError('Authentication required', 401);
  }

  // Handle file download responses (PDF, Excel)
  const contentType = response.headers.get('content-type') || '';
  if (
    contentType.includes('application/pdf') ||
    contentType.includes('spreadsheetml') ||
    contentType.includes('octet-stream')
  ) {
    if (!response.ok) {
      throw new ApiError('Download failed', response.status);
    }
    const blob = await response.blob();
    return blob as unknown as T;
  }

  // Parse JSON response
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`Request failed with status ${response.status}`, response.status);
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    if (data.error) {
      errorMessage = data.error as string;
    } else if (data.detail) {
      errorMessage = data.detail as string;
    } else if (data.message) {
      errorMessage = data.message as string;
    } else if (data.non_field_errors) {
      errorMessage = (data.non_field_errors as string[])[0];
    } else {
      // Look for the first field-level validation error
      const firstField = Object.keys(data)[0];
      if (firstField && Array.isArray(data[firstField]) && data[firstField].length > 0) {
        errorMessage = `${firstField}: ${data[firstField][0]}`;
      } else if (firstField && typeof data[firstField] === 'string') {
        errorMessage = `${firstField}: ${data[firstField]}`;
      }
    }
    throw new ApiError(errorMessage, response.status, data);
  }

  return data as T;
}

// ============================================================================
// Exported HTTP methods
// ============================================================================

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'DELETE',
      body: body ? JSON.stringify(body) : undefined,
    }),

  /** Upload FormData (file uploads) */
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
    }),

  /** Download a file as Blob */
  download: async (endpoint: string): Promise<Blob> => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}${endpoint}`, { headers });
    if (!response.ok) {
      throw new ApiError('Download failed', response.status);
    }
    return response.blob();
  },
};

export default api;

// ============================================================================
// Auth Service — Maps to Django apps.accounts endpoints.
// POST /api/auth/login/
// POST /api/auth/logout/
// GET/POST /api/auth/users/
// GET/PATCH/DELETE /api/auth/users/{id}/
// POST /api/auth/bind-device/
// ============================================================================

import api from './client';
import type { AdminPermission, UserRole } from '@/lib/utils/constants';

// --- Types ---

export interface LoginRequest {
  email: string;
  password: string;
  device_id?: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    admin_permissions?: Partial<Record<AdminPermission, boolean>>;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone_number: string;
  role: UserRole;
  bound_device_id: string | null;
  admin_permissions: Partial<Record<AdminPermission, boolean>>;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateAdminRequest {
  email: string;
  full_name: string;
  phone_number: string;
  role: UserRole;
  password: string;
  admin_permissions?: Partial<Record<AdminPermission, boolean>>;
  bound_device_id?: string;
}

export interface DeviceBindRequest {
  protocol_member_id: string;
  device_id: string;
}

// --- API Calls ---

export const authService = {
  /** POST /api/auth/login/ — Authenticate and receive JWT tokens */
  login: (data: LoginRequest) => api.post<LoginResponse>('/api/auth/login/', data),

  /** POST /api/auth/logout/ — Blacklist refresh token */
  logout: (refreshToken: string) =>
    api.post<{ message: string }>('/api/auth/logout/', { refresh: refreshToken }),

  /** GET /api/auth/users/ — List all admin users (Superadmin only) */
  listUsers: () => api.get<{ results?: AdminUser[]; count?: number } | AdminUser[]>('/api/auth/users/'),

  /** POST /api/auth/users/ — Create admin user (Superadmin only) */
  createUser: (data: CreateAdminRequest) => api.post<AdminUser>('/api/auth/users/', data),

  /** GET /api/auth/users/{id}/ — Get user details */
  getUser: (id: string) => api.get<AdminUser>(`/api/auth/users/${id}/`),

  /** PATCH /api/auth/users/{id}/ — Update user */
  updateUser: (id: string, data: Partial<CreateAdminRequest>) =>
    api.patch<AdminUser>(`/api/auth/users/${id}/`, data),

  /** DELETE /api/auth/users/{id}/ — Deactivate user */
  deleteUser: (id: string) => api.delete<void>(`/api/auth/users/${id}/`),

  /** POST /api/auth/bind-device/ — Bind device to protocol member */
  bindDevice: (data: DeviceBindRequest) =>
    api.post<{ message: string; protocol_member: string; device_id: string }>(
      '/api/auth/bind-device/',
      data
    ),
};

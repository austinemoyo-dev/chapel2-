// ============================================================================
// Service Service — Maps to Django apps.services endpoints.
// GET/POST /api/services/
// GET/PATCH /api/services/{id}/
// DELETE /api/services/{id}/cancel/
// GET/POST /api/services/semesters/
// GET/PATCH /api/services/semesters/{id}/
// GET/PATCH /api/geo-fence/
// ============================================================================

import api from './client';
import type { ServiceType, ServiceGroup } from '@/lib/utils/constants';

// --- Types ---

export interface GroupStat {
  count: number;
  capacity: number;
  percentage: number;
}

export interface Semester {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_archived: boolean;
  registration_open: boolean;
  service_group_capacities: Record<string, number>;
  group_stats: Record<string, GroupStat>;
  total_students: number;
  total_services: number;
  created_at: string;
}

export interface CreateSemesterRequest {
  name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
}

export interface Service {
  id: string;
  semester: string;
  semester_name?: string;
  service_type: ServiceType;
  service_group: ServiceGroup;
  name: string;
  scheduled_date: string;
  window_open_time: string;
  window_close_time: string;
  signout_required: boolean;
  signout_open_time?: string | null;
  signout_close_time?: string | null;
  capacity_cap: number;
  is_cancelled: boolean;
  is_window_open?: boolean;
  created_at: string;
}

export interface CreateServiceRequest {
  semester: string;
  service_type: ServiceType;
  service_group: ServiceGroup;
  name?: string;
  scheduled_date: string;
  window_open_time: string;
  window_close_time: string;
  signout_required?: boolean;
  signout_open_time?: string | null;
  signout_close_time?: string | null;
  capacity_cap?: number;
}

export interface GeoFenceConfig {
  id: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  updated_at: string;
}

// --- API Calls ---

export const serviceService = {
  // Semesters
  /** GET /api/services/semesters/ — List all semesters */
  listSemesters: () => api.get<Semester[] | { results: Semester[] }>('/api/services/semesters/'),

  /** POST /api/services/semesters/ — Create semester */
  createSemester: (data: CreateSemesterRequest) =>
    api.post<Semester>('/api/services/semesters/', data),

  /** GET /api/services/semesters/{id}/ — Get semester details */
  getSemester: (id: string) => api.get<Semester>(`/api/services/semesters/${id}/`),

  /** PATCH /api/services/semesters/{id}/ — Update semester */
  updateSemester: (id: string, data: Partial<CreateSemesterRequest & { service_group_capacities: Record<string, number> }>) =>
    api.patch<Semester>(`/api/services/semesters/${id}/`, data),

  /** POST /api/services/semesters/{id}/archive/ — Archive semester (locks it, deletes face samples, resets students) */
  archiveSemester: (id: string) =>
    api.post<{ message: string; deleted_samples: number; students_reset: number }>(
      `/api/services/semesters/${id}/archive/`,
    ),

  // Services
  /** GET /api/services/ — List services (filterable) */
  listServices: (params?: {
    semester_id?: string;
    service_type?: string;
    service_group?: string;
    is_cancelled?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) searchParams.set(k, v);
      });
    }
    const qs = searchParams.toString();
    return api.get<Service[] | { results: Service[] }>(`/api/services/${qs ? `?${qs}` : ''}`);
  },

  /** POST /api/services/ — Create a new service */
  createService: (data: CreateServiceRequest) => api.post<Service>('/api/services/', data),

  /** GET /api/services/{id}/ — Get service details */
  getService: (id: string) => api.get<Service>(`/api/services/${id}/`),

  /** PATCH /api/services/{id}/ — Update service */
  updateService: (id: string, data: Partial<CreateServiceRequest>) =>
    api.patch<Service>(`/api/services/${id}/`, data),

  /** DELETE /api/services/{id}/cancel/ — Cancel a service */
  cancelService: (id: string, reason?: string) =>
    api.delete<{ message: string }>(`/api/services/${id}/cancel/`, { reason }),

  // Geo-fence
  /** GET /api/geo-fence/ — Get current geo-fence config */
  getGeoFence: () => api.get<GeoFenceConfig>('/api/geo-fence/'),

  /** PATCH /api/geo-fence/ — Update geo-fence config */
  updateGeoFence: (data: Partial<Omit<GeoFenceConfig, 'id' | 'updated_at'>>) =>
    api.patch<{ message: string; config: GeoFenceConfig }>('/api/geo-fence/', data),

  /** DELETE /api/geo-fence/ — Reset geo-fence to unconfigured (0, 0) */
  resetGeoFence: () =>
    api.delete<{ message: string }>('/api/geo-fence/'),
};

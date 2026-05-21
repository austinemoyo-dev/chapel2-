// ============================================================================
// Attendance Service — Maps to Django apps.attendance endpoints.
// POST /api/attendance/sign-in/
// POST /api/attendance/sign-out/
// POST /api/attendance/sync/
// GET  /api/attendance/embeddings/{service_id}/
// ============================================================================

import api from './client';

// --- Types ---

export interface SignInRequest {
  service_id: string;
  face_image?: File;
  face_embedding?: number[];
  student_id?: string; // Pre-matched offline
  device_id: string;
  gps_lat: number;
  gps_lng: number;
}

export interface SignInResponse {
  message: string;
  record_id: string;
  student_id: string;
  student_name: string;
  signed_in_at: string;
  is_valid: boolean;
  confidence: number;
}

export interface SignOutRequest {
  service_id: string;
  student_id?: string;
  face_image?: File;
  face_embedding?: number[];
  device_id: string;
  gps_lat: number;
  gps_lng: number;
}

export interface SignOutResponse {
  message: string;
  record_id: string;
  student_name: string;
  signed_out_at: string;
  is_valid: boolean;
}

export interface OfflineSyncRecord {
  student_id: string;
  service_id: string;
  attendance_type: 'sign_in' | 'sign_out';
  device_id: string;
  gps_lat: number;
  gps_lng: number;
  timestamp: string; // ISO datetime
  protocol_member_id: string;
}

export interface SyncResultItem {
  index: number;
  status: 'accepted' | 'rejected';
  record_id?: string;
  student_name?: string;
  reason?: string;
  validation?: string;
}

export interface SyncResponse {
  message: string;
  total: number;
  accepted: number;
  rejected: number;
  results: SyncResultItem[];
}

export interface EmbeddingEntry {
  student_id: string;
  student_name: string;
  embeddings: number[][];
}

export interface EmbeddingsResponse {
  service_id: string;
  service_type: string;
  service_group: string;
  student_count: number;
  embeddings: EmbeddingEntry[];
}

// --- API Calls ---

export const attendanceService = {
  /** POST /api/attendance/sign-in/ — Mark student sign-in */
  signIn: (data: SignInRequest) => {
    // If face_image is a File, use FormData
    if (data.face_image) {
      const formData = new FormData();
      formData.append('service_id', data.service_id);
      formData.append('face_image', data.face_image);
      formData.append('device_id', data.device_id);
      formData.append('gps_lat', String(data.gps_lat));
      formData.append('gps_lng', String(data.gps_lng));
      if (data.student_id) formData.append('student_id', data.student_id);
      return api.upload<SignInResponse>('/api/attendance/sign-in/', formData);
    }
    return api.post<SignInResponse>('/api/attendance/sign-in/', data);
  },

  /** POST /api/attendance/sign-out/ — Mark student sign-out */
  signOut: (data: SignOutRequest) => {
    if (data.face_image) {
      const formData = new FormData();
      formData.append('service_id', data.service_id);
      formData.append('face_image', data.face_image);
      formData.append('device_id', data.device_id);
      formData.append('gps_lat', String(data.gps_lat));
      formData.append('gps_lng', String(data.gps_lng));
      if (data.student_id) formData.append('student_id', data.student_id);
      return api.upload<SignOutResponse>('/api/attendance/sign-out/', formData);
    }
    return api.post<SignOutResponse>('/api/attendance/sign-out/', data);
  },

  /** POST /api/attendance/sync/ — Sync offline attendance batch */
  syncOffline: (records: OfflineSyncRecord[]) =>
    api.post<SyncResponse>('/api/attendance/sync/', { records }),

  /** GET /api/attendance/embeddings/{service_id}/ — Download face embeddings */
  getEmbeddings: (serviceId: string) =>
    api.get<EmbeddingsResponse>(`/api/attendance/embeddings/${serviceId}/`, 60000),

  /** POST /api/attendance/device-ready/ — Report offline model downloaded */
  reportModelReady: () =>
    api.post<{ message: string }>('/api/attendance/device-ready/'),

  /** POST /api/attendance/manual-sign-in/ — Admin manual sign-in */
  manualSignIn: (data: { service_id: string; student_id: string; reason_note: string }) =>
    api.post<{ message: string; record_id: string; student_id: string; student_name: string; signed_in_at: string }>(
      '/api/attendance/manual-sign-in/',
      data,
    ),

  /** POST /api/attendance/bulk-mark/ — Bulk mark attendance */
  bulkMark: (data: {
    service_id: string;
    student_ids?: string[];
    mark_all_active?: boolean;
    reason_note: string;
  }) =>
    api.post<{ message: string; created: number; skipped: number; total_students: number }>(
      '/api/attendance/bulk-mark/',
      data,
    ),

  // ── Manual Mode ──────────────────────────────────────────────────────────

  /** GET /api/attendance/manual-mode/ — Admin: get current config */
  getManualModeConfig: () =>
    api.get<{
      is_enabled: boolean;
      allowed_member_ids: string[];
      protocol_members: { id: string; full_name: string; email: string; device_bound: boolean; allowed: boolean }[];
    }>('/api/attendance/manual-mode/'),

  /** PATCH /api/attendance/manual-mode/ — Admin: update config */
  updateManualModeConfig: (data: { is_enabled?: boolean; allowed_member_ids?: string[] }) =>
    api.patch<{ message: string; is_enabled: boolean }>('/api/attendance/manual-mode/', data),

  /** GET /api/attendance/manual-mode/status/ — Protocol member: check own access */
  getManualModeStatus: () =>
    api.get<{ enabled: boolean }>('/api/attendance/manual-mode/status/'),

  /** GET /api/attendance/students/?q=...&service_id=... — Student search for manual mode */
  searchStudents: (q: string, serviceId?: string) => {
    const params = new URLSearchParams({ q });
    if (serviceId) params.set('service_id', serviceId);
    return api.get<{ id: string; full_name: string; matric_number: string; service_group: string; profile_photo: string | null }[]>(
      `/api/attendance/students/?${params.toString()}`,
    );
  },

  /** POST /api/attendance/protocol-manual-sign-in/ — Protocol member: manual sign-in */
  protocolManualSignIn: (data: { service_id: string; student_id: string; device_id: string; gps_lat: number; gps_lng: number }) =>
    api.post<{ message: string; record_id: string; student_id: string; student_name: string; signed_in_at: string }>(
      '/api/attendance/protocol-manual-sign-in/',
      data,
    ),
};


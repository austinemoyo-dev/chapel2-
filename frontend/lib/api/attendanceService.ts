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
    api.get<EmbeddingsResponse>(`/api/attendance/embeddings/${serviceId}/`),
};

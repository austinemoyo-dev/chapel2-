// ============================================================================
// Registration Service — Maps to Django apps.students endpoints.
// GET  /api/registration/status/
// POST /api/registration/student/
// POST /api/registration/face-sample/
// GET  /api/registration/face-status/
// PATCH /api/registration/update-matric/
// ============================================================================

import api from './client';
import type { StudentLevel, Gender } from '@/lib/utils/constants';

// --- Types ---

export interface RegistrationStatus {
  registration_open: boolean;
  semester_id?: string;
  semester_name?: string;
}

export interface StudentRegistrationRequest {
  student_type: 'old' | 'new';
  full_name: string;
  phone_number: string;
  matric_number?: string;
  faculty: string;
  department: string;
  level: StudentLevel;
  gender: Gender;
  profile_photo?: File;
  semester: string; // UUID of active semester
}

export interface Student {
  id: string;
  student_type: 'old' | 'new';
  matric_number: string | null;
  system_id: string;
  full_name: string;
  phone_number: string;
  faculty: string | null;
  department: string;
  level: StudentLevel;
  gender: Gender;
  profile_photo: string | null;
  face_registered: boolean;
  service_group: string | null;
  semester: string;
  semester_name?: string;
  is_active: boolean;
  duplicate_flag: boolean;
  duplicate_details?: Record<string, unknown>;
  duplicate_results?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  approved_face_samples?: number;
}

export interface FaceSampleResponse {
  id: string;
  student: string;
  status: 'approved' | 'rejected';
  rejection_reason: string | null;
  embedding_vector: number[];
  created_at: string;
}

export interface FaceStatusResponse {
  student_id: string;
  total_samples: number;
  approved_samples: number;
  rejected_samples: number;
  face_registered: boolean;
  is_active: boolean;
  message: string;
}

export interface PublicStudentLookupResponse {
  id: string;
  system_id: string;
  full_name: string;
  department: string;
  level: string;
  service_group: string | null;
  face_registered: boolean;
  is_active: boolean;
  duplicate_flag: boolean;
}

export interface MatricUpdateRequest {
  token: string;
  system_id: string;
  matric_number: string;
}

// --- API Calls ---

export const registrationService = {
  /** GET /api/registration/status/ — Check if registration window is open */
  getStatus: () => api.get<RegistrationStatus>('/api/registration/status/'),

  /** POST /api/registration/student/ — Submit student registration */
  registerStudent: (data: StudentRegistrationRequest) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (value instanceof File) {
          formData.append(key, value);
        } else {
          formData.append(key, String(value));
        }
      }
    });
    return api.upload<Student>('/api/registration/student/', formData);
  },

  /** POST /api/registration/face-sample/ — Upload a single face capture */
  uploadFaceSample: (studentId: string, semesterId: string, file: File) => {
    const formData = new FormData();
    formData.append('student_id', studentId);
    if (semesterId) formData.append('semester', semesterId);
    formData.append('sample_file', file);
    return api.upload<FaceSampleResponse>('/api/registration/face-sample/', formData);
  },

  /** GET /api/registration/face-status/ — Check approved sample count */
  getFaceStatus: (studentId: string) =>
    api.get<FaceStatusResponse>(`/api/registration/face-status/?student_id=${studentId}`),

  /** PATCH /api/registration/update-matric/ — Student updates matric via secure link */
  updateMatric: (data: MatricUpdateRequest) =>
    api.patch<{ message: string }>('/api/registration/update-matric/', data),

  /** GET /api/registration/lookup/ — Public student service group and status lookup */
  lookupStudent: (identifier: string) =>
    api.get<PublicStudentLookupResponse>(`/api/registration/lookup/?identifier=${encodeURIComponent(identifier)}`),
};

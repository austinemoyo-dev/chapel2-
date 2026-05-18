// ============================================================================
// Admin Service — Admin student management, duplicates, attendance edit, backdate.
// ============================================================================

import api from './client';
import type { Student } from './registrationService';

export interface AttendanceRecord {
  id: string;
  student: string;
  student_name: string;
  student_matric: string | null;
  service: string;
  service_info: { service_type: string; service_group: string; scheduled_date: string };
  protocol_member: string | null;
  device_id: string;
  gps_lat: number;
  gps_lng: number;
  signed_in_at: string;
  signed_out_at: string | null;
  is_valid: boolean;
  is_offline_record: boolean;
  is_backdated: boolean;
  backdate_type: string | null;
  sync_validation_result: string | null;
  created_at: string;
}

export interface FaceCaptureStats {
  total: number;
  active: number;
  inactive: number;
  no_capture: number;
  bad_capture: number;
  duplicate_flagged: number;
}

export interface BackdateRequest {
  student_id: string;
  service_ids: string[];
  backdate_type: 'valid' | 'excused';
  reason_note: string;
}

export interface DuplicateResolveRequest {
  student_id: string;
  action: 'approve' | 'reject' | 'merge';
  reason_note?: string;
}

export const adminService = {
  // Registration window
  toggleRegistration: (open: boolean) =>
    api.patch<{ message: string }>('/api/admin/registration/open/', { registration_open: open }),

  // Student management
  listStudents: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return api.get<{ results: Student[]; count: number }>(`/api/admin/students/${qs}`);
  },

  getStudent: (id: string) => api.get<Student>(`/api/admin/students/${id}/`),

  updateStudent: (id: string, data: Partial<Student>) =>
    api.patch<Student>(`/api/admin/students/${id}/`, data),

  deleteStudent: (id: string) =>
    api.delete<{ message: string }>(`/api/admin/students/${id}/delete/`),

  resetFaceCapture: (id: string) =>
    api.delete<{ message: string; deleted_count: number }>(`/api/admin/students/${id}/reset-face/`),

  // Duplicates
  resolveDuplicate: (data: DuplicateResolveRequest) =>
    api.post<{ message: string }>('/api/admin/duplicates/resolve/', data),

  // Matric update link
  generateMatricLink: (studentId: string) =>
    api.post<{
      token: string;
      student_name: string;
      system_id: string;
      expires_in_hours: number;
      message: string;
    }>(`/api/admin/matric-update-link/${studentId}/`),

  // Attendance records for a service
  getServiceAttendance: (serviceId: string) =>
    api.get<{ results: AttendanceRecord[] }>(`/api/attendance/service/${serviceId}/`),

  // Manual attendance edit
  editAttendance: (id: string, data: { is_valid?: boolean; signed_in_at?: string; signed_out_at?: string | null; reason_note: string }) =>
    api.patch<{ message: string; record: AttendanceRecord }>(`/api/attendance/${id}/edit/`, data),

  // Backdate
  backdateAttendance: (data: BackdateRequest) =>
    api.post<{ message: string; created_records: string[]; skipped_services: { service_id: string; reason: string }[] }>(
      '/api/attendance/backdate/', data
    ),

  // Get all attendance records for a specific student
  getStudentAttendance: (studentId: string) =>
    api.get<{ results: AttendanceRecord[] }>(`/api/attendance/student/${studentId}/`),

  // Get active scanners for a service
  getActiveScanners: (serviceId: string) =>
    api.get<{
      service_id: string;
      active_scanners: {
        protocol_member_name: string;
        device_id: string;
        scan_count: number;
        last_scan_at: string;
        gps_lat: number;
        gps_lng: number;
      }[];
      total_active: number;
    }>(`/api/attendance/active-scanners/${serviceId}/`),

  getDeviceStatus: () =>
    api.get<{
      devices: {
        id: string;
        name: string;
        device_id: string;
        offline_ready: boolean;
        ready_at: string | null;
      }[];
    }>('/api/attendance/device-status/'),

  getFaceCaptureReport: (semesterId?: string) =>
    api.get<{
      all: FaceCaptureStats;
      S1: FaceCaptureStats;
      S2: FaceCaptureStats;
      S3: FaceCaptureStats;
    }>(`/api/admin/students/face-capture-report/${semesterId ? `?semester_id=${semesterId}` : ''}`),

  getStudentAccounts: (search?: string) =>
    api.get<{ students: any[]; total: number }>(
      `/api/admin/student-accounts/${search ? `?search=${encodeURIComponent(search)}` : ''}`
    ),

  resetStudentAccountPassword: (id: string, password?: string) =>
    api.post<{ message: string; temp_password: string; student_id: string }>(
      `/api/admin/student-accounts/${id}/reset-password/`,
      password ? { password } : {}
    ),

  toggleStudentAccount: (id: string) =>
    api.patch<{ message: string; portal_active: boolean }>(
      `/api/admin/student-accounts/${id}/toggle/`
    ),

  getPhotoAudit: (recordId: string) =>
    api.get<{ record_id: string; student_name: string; signed_in_at: string; face_image_url: string }>(
      `/api/attendance/${recordId}/photo/`
    ),

  getSuspiciousPatterns: (serviceId?: string) =>
    api.get<{ service_id: string | null; total_flags: number; flags: any[] }>(
      `/api/attendance/suspicious/${serviceId ? `?service_id=${serviceId}` : ''}`
    ),
};


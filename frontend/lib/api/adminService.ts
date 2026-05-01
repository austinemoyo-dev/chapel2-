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
};

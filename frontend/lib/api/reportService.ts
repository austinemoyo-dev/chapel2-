// ============================================================================
// Report Service — Maps to Django apps.reports endpoints.
// ============================================================================

import api from './client';

export interface ReportFilters {
  semester_id?: string;
  service_id?: string;
  service_type?: string;
  service_group?: string;
  week?: string;
  below_threshold?: string;
}

export interface ReportStudent {
  student_id: string;
  student_name: string;
  matric_number: string | null;
  system_id: string;
  service_group: string;
  valid_count: number;
  total_required: number;
  percentage: number;
  below_threshold: boolean;
}

export interface AttendanceReport {
  semester_id: string;
  semester_name: string;
  total_students: number;
  students_below_threshold: number;
  report: ReportStudent[];
  generated_at: string;
}

export const reportService = {
  getAttendanceReport: (filters?: ReportFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
    }
    const qs = params.toString();
    return api.get<AttendanceReport>(`/api/reports/attendance/${qs ? `?${qs}` : ''}`);
  },

  exportPDF: (filters?: ReportFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
    }
    const qs = params.toString();
    return api.download(`/api/reports/export/pdf/${qs ? `?${qs}` : ''}`);
  },

  exportExcel: (filters?: ReportFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
    }
    const qs = params.toString();
    return api.download(`/api/reports/export/excel/${qs ? `?${qs}` : ''}`);
  },
};

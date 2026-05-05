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

  getDashboardStats: () =>
    api.get<DashboardStats>('/api/reports/dashboard-stats/'),

  getSemesterComparison: () =>
    api.get<SemesterComparison>('/api/reports/semester-comparison/'),

  getStudentTrend: (studentId: string) =>
    api.get<StudentTrend>(`/api/reports/student-trend/?student_id=${studentId}`),

  getScanMetrics: (serviceId: string) =>
    api.get<ScanMetrics>(`/api/reports/scan-metrics/${serviceId}/`),
};

// --- Dashboard Stats Types ---
export interface DashboardStats {
  attendance_by_day: { date: string; count: number }[];
  group_distribution: Record<string, number>;
  signin_histogram: { hour: number; count: number }[];
  weekly_trend: { week: string; valid: number; total: number; percentage: number }[];
}

export interface SemesterComparisonEntry {
  semester_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  total_students: number;
  total_services: number;
  avg_percentage: number;
  below_threshold_count: number;
}

export interface SemesterComparison {
  semesters: SemesterComparisonEntry[];
  total_semesters: number;
}

export interface StudentTrend {
  student_name: string;
  trend: {
    semester_id: string;
    semester_name: string;
    percentage: number;
    valid_count: number;
    total_required: number;
    below_threshold: boolean;
  }[];
}

export interface ScanMetrics {
  service_id: string;
  total_scans: number;
  avg_scans_per_minute: number;
  timeline: { time: string; count: number }[];
  per_member: { name: string; scan_count: number; avg_gap_seconds: number }[];
}


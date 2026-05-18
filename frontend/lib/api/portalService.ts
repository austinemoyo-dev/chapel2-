// ─────────────────────────────────────────────────────────────────────────────
// Portal Service — Student portal API calls using X-Portal-Token header
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const TOKEN_KEY = 'portal_token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function portalRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['X-Portal-Token'] = token;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      cache: 'no-store',
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });
  } catch {
    console.error(`[portal] ${options.method || 'GET'} ${endpoint} → network error (backend may not be running)`);
    throw new Error('Cannot reach the server. Make sure the backend is running.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any).error || (data as any).detail || `Request failed (${res.status})`;
    console.error(`[portal] ${options.method || 'GET'} ${endpoint} → ${res.status}: ${msg}`);
    throw new Error(msg);
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PortalStudent {
  id: string;
  full_name: string;
  student_type: string;
  service_group: string;
  department: string;
  faculty: string;
  level: string;
  face_registered: boolean;
  system_id: string;
}

export interface PortalLookupResult {
  student_id: string;
  full_name: string;
  student_type: string;
  face_registered: boolean;
  has_account: boolean;
}

export interface PortalProfile extends PortalStudent {
  phone_number: string;
  matric_number: string | null;
  gender: string;
  profile_photo: string | null;
  semester: string;
  last_login: string | null;
}

export interface AttendanceServiceEntry {
  service_id: string;
  service_name: string;
  service_type: string;
  scheduled_date: string;
  signed_in_at: string | null;
  signed_out_at: string | null;
  is_valid: boolean;
  status: 'valid' | 'invalid' | 'upcoming' | 'missed' | 'excused';
}

export interface PortalAttendance {
  semester_name: string;
  percentage: number;
  valid_count: number;
  total_required: number;
  excused_count: number;
  below_threshold: boolean;
  services: AttendanceServiceEntry[];
}

export interface TodayService {
  id: string;
  name: string;
  service_type: string;
  window_open_time: string;
  window_close_time: string;
  is_window_open: boolean;
  notes: string;
  signout_required: boolean;
  signed_in: boolean;
  signed_out: boolean;
  is_valid: boolean;
}

export interface FaceStatus {
  face_registered: boolean;
  approved_samples: number;
  rejected_count: number;
  rejection_reasons: string[];
  required_samples: number;
  remaining: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API methods
// ─────────────────────────────────────────────────────────────────────────────

export const portalService = {
  lookup: (identifier: string) =>
    portalRequest<PortalLookupResult>('/api/portal/lookup/', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  login: (identifier: string, password: string) =>
    portalRequest<{ token: string; student: PortalStudent }>('/api/portal/login/', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  setupPassword: (formData: FormData) =>
    portalRequest<{ message: string; token: string; student: PortalStudent }>('/api/portal/setup-password/', {
      method: 'POST',
      body: formData,
    }),

  getMe: () => portalRequest<PortalProfile>('/api/portal/me/'),

  getAttendance: () => portalRequest<PortalAttendance>('/api/portal/attendance/'),

  getToday: () => portalRequest<{ services: TodayService[]; date: string }>('/api/portal/today/'),

  getFaceStatus: () => portalRequest<FaceStatus>('/api/portal/face-status/'),
};

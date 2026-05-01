// ============================================================================
// Constants — Shared enums, role definitions, and configuration values.
// ============================================================================

/** User roles matching Django AdminUser.RoleChoices */
export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  PROTOCOL_ADMIN: 'protocol_admin',
  PROTOCOL_MEMBER: 'protocol_member',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

/** Granular Admin permission keys matching the backend JSON field. */
export const ADMIN_PERMISSIONS = {
  VIEW_STUDENTS: 'view_students',
  ADD_STUDENTS: 'add_students',
  EDIT_STUDENTS: 'edit_students',
  VIEW_REPORTS: 'view_reports',
  VIEW_ARCHIVES: 'view_archives',
  CHANGE_SERVICE_ASSIGNMENT: 'change_service_assignment',
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  [ADMIN_PERMISSIONS.VIEW_STUDENTS]: 'View student profiles and attendance records',
  [ADMIN_PERMISSIONS.ADD_STUDENTS]: 'Add students manually',
  [ADMIN_PERMISSIONS.EDIT_STUDENTS]: 'Edit student profiles',
  [ADMIN_PERMISSIONS.VIEW_REPORTS]: 'View reports and analytics',
  [ADMIN_PERMISSIONS.VIEW_ARCHIVES]: 'View archived records',
  [ADMIN_PERMISSIONS.CHANGE_SERVICE_ASSIGNMENT]: 'Change student service assignment',
};

/** Service group assignments */
export const SERVICE_GROUPS = {
  S1: 'S1',
  S2: 'S2',
  S3: 'S3',
  ALL: 'all',
} as const;

export type ServiceGroup = (typeof SERVICE_GROUPS)[keyof typeof SERVICE_GROUPS];

/** Service types */
export const SERVICE_TYPES = {
  MIDWEEK: 'midweek',
  SUNDAY: 'sunday',
  SPECIAL: 'special',
} as const;

export type ServiceType = (typeof SERVICE_TYPES)[keyof typeof SERVICE_TYPES];

/** Student levels */
export const LEVELS = ['100', '200', '300', '400'] as const;
export type StudentLevel = (typeof LEVELS)[number];

/** Genders */
export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

/** Student types */
export const STUDENT_TYPES = {
  OLD: 'old',
  NEW: 'new',
} as const;

/** Attendance threshold for exam eligibility */
export const ATTENDANCE_THRESHOLD = 70;

/** Liveness challenge prompts */
export const LIVENESS_CHALLENGES = [
  { id: 'blink', label: 'Please Blink', instruction: 'Blink your eyes slowly' },
  { id: 'smile', label: 'Please Smile', instruction: 'Give a natural smile' },
  { id: 'turn_left', label: 'Turn Head Left', instruction: 'Slowly turn your head to the left' },
  { id: 'turn_right', label: 'Turn Head Right', instruction: 'Slowly turn your head to the right' },
  { id: 'nod', label: 'Please Nod', instruction: 'Nod your head slowly' },
] as const;

/** Role → default redirect path */
export const ROLE_REDIRECTS: Record<UserRole, string> = {
  [ROLES.SUPERADMIN]: '/admin/dashboard',
  [ROLES.ADMIN]: '/admin/dashboard',
  [ROLES.PROTOCOL_MEMBER]: '/scan',
  [ROLES.PROTOCOL_ADMIN]: '/monitor',
};

/** Roles allowed per route group */
export const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/admin': [ROLES.SUPERADMIN, ROLES.ADMIN],
  '/scan': [ROLES.PROTOCOL_MEMBER],
  '/sync': [ROLES.PROTOCOL_MEMBER],
  '/monitor': [ROLES.SUPERADMIN, ROLES.PROTOCOL_ADMIN],
};

/** Local storage keys */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'chapel_access_token',
  REFRESH_TOKEN: 'chapel_refresh_token',
  USER: 'chapel_user',
  DEVICE_ID: 'chapel_device_id',
} as const;

/** Cosine distance threshold for face matching (matches backend DEEPFACE_MATCH_THRESHOLD) */
export const FACE_MATCH_THRESHOLD = parseFloat(
  process.env.NEXT_PUBLIC_FACE_MATCH_THRESHOLD || '0.30'
);

/** IndexedDB database name */
export const IDB_NAME = 'chapel_attendance_offline';
export const IDB_VERSION = 1;

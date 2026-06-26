// ─────────────────────────────────────────────────────────────────────────────
// Issues Portal Service — student-submitted issue reports (X-Portal-Token)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const TOKEN_KEY = 'portal_token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function portalRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Portal-Token'] = token;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      cache: 'no-store',
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });
  } catch {
    throw new Error('Cannot reach the server. Make sure the backend is running.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any).error || (data as any).detail || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export type IssueStatus = 'open' | 'in_review' | 'auto_resolved' | 'resolved' | 'dismissed';
export type IssueCategory = 'scan_failed' | 'wrong_status' | 'sync_issue' | 'account_access' | 'other';

export interface PortalIssueReport {
  id: string;
  description: string;
  category: IssueCategory;
  status: IssueStatus;
  admin_reply: string;
  created_at: string;
  updated_at: string;
}

export const issuesPortalService = {
  list: () => portalRequest<{ results: PortalIssueReport[] }>('/api/portal/issues/'),

  create: (description: string) =>
    portalRequest<{ id: string; status: IssueStatus; message: string }>('/api/portal/issues/', {
      method: 'POST',
      body: JSON.stringify({ description }),
    }),

  reopen: (id: string) =>
    portalRequest<{ id: string; status: IssueStatus }>(`/api/portal/issues/${id}/reopen/`, {
      method: 'POST',
    }),
};

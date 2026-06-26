// ─────────────────────────────────────────────────────────────────────────────
// Issues Portal Service — student-facing issue chat (X-Portal-Token)
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
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
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

export type IssueStatus = 'open' | 'awaiting_proof' | 'in_review' | 'auto_resolved' | 'resolved' | 'dismissed';
export type IssueCategory = 'scan_failed' | 'wrong_status' | 'sync_issue' | 'account_access' | 'other';
export type MessageSender = 'student' | 'ai' | 'admin';

export interface IssueMessage {
  id: string;
  sender: MessageSender;
  text: string;
  attachment: string | null;
  created_at: string;
}

export interface PortalIssueSummary {
  id: string;
  ticket_code: string;
  category: IssueCategory;
  status: IssueStatus;
  last_message: string;
  created_at: string;
  updated_at: string;
}

export interface PortalIssueThread {
  id: string;
  ticket_code: string;
  category: IssueCategory;
  status: IssueStatus;
  messages: IssueMessage[];
  created_at: string;
  updated_at: string;
}

function buildBody(text: string, attachment?: File | null) {
  if (attachment) {
    const fd = new FormData();
    fd.append('text', text);
    fd.append('attachment', attachment);
    return fd;
  }
  return JSON.stringify({ text });
}

export const issuesPortalService = {
  list: () => portalRequest<{ results: PortalIssueSummary[] }>('/api/portal/issues/'),

  getThread: (id: string) => portalRequest<PortalIssueThread>(`/api/portal/issues/${id}/`),

  start: (text: string, attachment?: File | null) =>
    portalRequest<PortalIssueThread>('/api/portal/issues/', {
      method: 'POST',
      body: buildBody(text, attachment),
    }),

  sendMessage: (id: string, text: string, attachment?: File | null) =>
    portalRequest<PortalIssueThread>(`/api/portal/issues/${id}/messages/`, {
      method: 'POST',
      body: buildBody(text, attachment),
    }),
};

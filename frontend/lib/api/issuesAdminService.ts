// ============================================================================
// Issues Admin Service — triage inbox for student-submitted issue chats.
// ============================================================================

import api from './client';
import type { IssueStatus, IssueCategory, MessageSender, IssueMessage } from './issuesPortalService';

export type { IssueStatus, IssueCategory, MessageSender, IssueMessage };

export type IssueSeverity = 'low' | 'medium' | 'high' | 'urgent';
export type ResolutionType = 'none' | 'explained' | 'awaiting_proof' | 'fix_needed';

export interface IssueReportListItem {
  id: string;
  ticket_code: string;
  student: string;
  student_name: string;
  student_identifier: string | null;
  last_message: string;
  category: IssueCategory;
  status: IssueStatus;
  severity: IssueSeverity;
  resolution_type: ResolutionType;
  created_at: string;
  updated_at: string;
}

export interface FlaggedServiceDetail {
  service_id: string;
  label: string;
  scheduled_date: string;
  has_record: boolean;
  is_valid: boolean | null;
  sync_validation_result: string | null;
}

export interface SuggestedFix {
  action: 'backdate' | 'edit';
  student_id?: string;
  service_ids?: string[];
  backdate_type?: 'valid' | 'excused';
  attendance_record_id?: string;
  is_valid?: boolean;
}

export interface IssueReportDetail extends IssueReportListItem {
  messages: IssueMessage[];
  suggested_fix: SuggestedFix | null;
  flagged_services: string[];
  flagged_services_detail: FlaggedServiceDetail[];
  ai_summary: string;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
}

export interface IssueUpdateRequest {
  status?: IssueStatus;
  severity?: IssueSeverity;
  category?: IssueCategory;
}

export const issuesAdminService = {
  list: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return api.get<{ results: IssueReportListItem[]; count: number }>(`/api/admin/issues/${qs}`);
  },

  get: (id: string) => api.get<IssueReportDetail>(`/api/admin/issues/${id}/`),

  update: (id: string, data: IssueUpdateRequest) =>
    api.patch<IssueReportDetail>(`/api/admin/issues/${id}/`, data),

  sendMessage: (id: string, text: string) =>
    api.post<IssueReportDetail>(`/api/admin/issues/${id}/messages/`, { text }),

  resolve: (id: string, message?: string) =>
    api.post<IssueReportDetail>(`/api/admin/issues/${id}/resolve/`, { message }),
};

// ============================================================================
// Audit Service — GET /api/audit/logs/
// ============================================================================

import api from './client';

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_email?: string;
  action_type: string;
  target_type: string;
  target_id: string;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason_note: string;
  device_id: string;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
}

export const auditService = {
  getLogs: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return api.get<{ results: AuditLog[]; count: number }>(`/api/audit/logs/${qs}`);
  },
};

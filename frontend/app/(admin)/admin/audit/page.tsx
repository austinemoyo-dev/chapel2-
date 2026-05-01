'use client';

import { useState, useEffect } from 'react';
import { auditService, type AuditLog } from '@/lib/api/auditService';
import { formatDateTime } from '@/lib/utils/formatters';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    action_type: '',
    target_type: '',
    date_from: '',
    date_to: '',
  });

  useEffect(() => {
    let cancelled = false;
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value.trim() !== '')
    );

    auditService.getLogs(params)
      .then((data) => { if (!cancelled) setLogs(data.results || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [filters]);

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted">All privileged and destructive actions are append-only.</p>
      </div>

      <Card className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Input id="audit-search" label="Search" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Actor, target, note..." />
        <Input id="audit-action" label="Action" value={filters.action_type} onChange={(e) => setFilter('action_type', e.target.value)} placeholder="ATTENDANCE_EDIT" />
        <Input id="audit-target" label="Target" value={filters.target_type} onChange={(e) => setFilter('target_type', e.target.value)} placeholder="Student" />
        <Input id="audit-from" label="From" type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} />
        <Input id="audit-to" label="To" type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} />
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="text-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="info">{log.action_type.replace(/_/g, ' ')}</Badge>
                    <span className="text-xs text-muted">{formatDateTime(log.created_at)}</span>
                  </div>
                  <p className="text-muted mt-2">Actor: {log.actor_email || log.actor_id || 'Unknown'}</p>
                  <p className="text-muted">Target: {log.target_type} ({log.target_id?.slice(0, 8)}...)</p>
                  {log.device_id && <p className="text-muted">Device: {log.device_id}</p>}
                  {log.gps_lat && log.gps_lng && <p className="text-muted">GPS: {log.gps_lat}, {log.gps_lng}</p>}
                  {log.reason_note && <p className="text-warning mt-2">Reason: {log.reason_note}</p>}
                </div>
                <details className="lg:w-1/2">
                  <summary className="cursor-pointer text-primary text-xs">View before/after</summary>
                  <div className="grid gap-2 mt-2">
                    <pre className="text-xs bg-surface-2 border border-border rounded-lg p-3 overflow-auto">
                      {JSON.stringify({ previous: log.previous_value, new: log.new_value }, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            </Card>
          ))}
          {logs.length === 0 && <p className="text-center py-10 text-muted">No audit logs match these filters</p>}
        </div>
      )}
    </div>
  );
}

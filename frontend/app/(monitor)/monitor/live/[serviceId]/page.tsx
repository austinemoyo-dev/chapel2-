'use client';

import { useState, useEffect, use } from 'react';
import { adminService, type AttendanceRecord } from '@/lib/api/adminService';
import { formatDateTime, formatTime } from '@/lib/utils/formatters';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';

export default function LiveMonitorPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = use(params);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRecords = async () => {
      try {
        const data = await adminService.getServiceAttendance(serviceId);
        if (cancelled) return;
        const list = data.results || [];
        setRecords(list);
        setLastUpdated(new Date().toISOString());
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    const initial = window.setTimeout(() => {
      void fetchRecords();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchRecords();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [serviceId]);

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const signedIn = records.filter((r) => r.signed_in_at).length;
  const signedOut = records.filter((r) => r.signed_out_at).length;
  const flagged = records.filter((r) => !r.is_valid || r.sync_validation_result || r.is_offline_record).length;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Live Attendance Monitor</h1>
          <a href="/monitor" className="text-xs text-primary">Back to services</a>
        </div>
        <div className="grid grid-cols-3 gap-2 min-w-72">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Signed in</p>
            <p className="text-xl font-bold text-primary">{signedIn}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Signed out</p>
            <p className="text-xl font-bold text-success">{signedOut}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">Flags</p>
            <p className="text-xl font-bold text-warning">{flagged}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <span className="text-xs text-muted">
          Polling every 3s{lastUpdated ? `, last updated ${formatTime(lastUpdated)}` : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-2 border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-muted">Student</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Timing</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Protocol / Device</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Location</th>
              <th className="text-left px-4 py-3 font-medium text-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-border/50 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{record.student_name}</p>
                  <p className="text-xs text-muted">{record.student_matric || record.student}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  <p>In: {formatDateTime(record.signed_in_at)}</p>
                  <p className="text-muted">Out: {formatDateTime(record.signed_out_at)}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  <p>{record.protocol_member || 'Unknown protocol member'}</p>
                  <p className="text-muted break-all">{record.device_id || 'No device ID'}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {record.gps_lat && record.gps_lng ? `${record.gps_lat}, ${record.gps_lng}` : 'No GPS'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={record.is_valid ? 'success' : 'warning'}>
                      {record.is_valid ? 'Valid' : 'Pending'}
                    </Badge>
                    {record.is_offline_record && <Badge variant="info">Offline synced</Badge>}
                    {record.is_backdated && <Badge variant="warning">{record.backdate_type || 'Backdated'}</Badge>}
                    {record.sync_validation_result && <Badge variant="danger">{record.sync_validation_result}</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <p className="text-center py-10 text-muted">No attendance records yet</p>
        )}
      </div>
    </div>
  );
}

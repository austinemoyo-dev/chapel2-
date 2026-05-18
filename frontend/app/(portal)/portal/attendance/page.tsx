'use client';

import { useState, useEffect } from 'react';
import { portalService, type PortalAttendance, type AttendanceServiceEntry } from '@/lib/api/portalService';

const STATUS_CONFIG = {
  valid:    { label: 'Present',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400' },
  invalid:  { label: 'Incomplete', color: 'text-amber-400', bg: 'bg-amber-500/10',   dot: 'bg-amber-400'   },
  excused:  { label: 'Excused',  color: 'text-blue-400',   bg: 'bg-blue-500/10',     dot: 'bg-blue-400'    },
  upcoming: { label: 'Upcoming', color: 'text-muted',      bg: 'bg-surface-2',        dot: 'bg-muted'       },
  missed:   { label: 'Absent',   color: 'text-red-400',    bg: 'bg-red-500/10',       dot: 'bg-red-400'     },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function PortalAttendancePage() {
  const [data, setData]     = useState<PortalAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all');

  useEffect(() => {
    portalService.getAttendance()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.services.filter(s => {
    if (filter === 'present') return s.status === 'valid';
    if (filter === 'absent')  return s.status === 'missed';
    return true;
  }) ?? [];

  const pct = data?.percentage ?? 0;
  const below = data?.below_threshold ?? false;

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Attendance</h1>
        <p className="text-xs text-muted mt-0.5">{data?.semester_name}</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
      ) : !data ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">Could not load attendance data.</p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="glass-panel rounded-2xl p-4 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold" style={{ color: below ? '#ef4444' : '#22c55e' }}>{pct.toFixed(1)}%</p>
                <p className="text-xs text-muted">{data.valid_count} / {data.total_required} services attended</p>
              </div>
              {below && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-right">
                  <p className="text-[10px] text-red-400 font-bold">⚠️ Below threshold</p>
                  <p className="text-[10px] text-muted">Min. 70% required</p>
                </div>
              )}
            </div>
            <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: below ? '#ef4444' : '#22c55e' }}
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'present', 'absent'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  filter === f ? 'bg-primary text-white' : 'bg-surface-2 text-muted'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Service list */}
          <div className="space-y-2">
            {filtered.map(svc => {
              const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.upcoming;
              return (
                <div key={svc.service_id} className={`rounded-2xl p-4 border border-border ${cfg.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{svc.service_name}</p>
                        <p className="text-xs text-muted">{formatDate(svc.scheduled_date)}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold shrink-0 ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  {svc.signed_in_at && (
                    <p className="text-[10px] text-muted mt-2 ml-4">
                      In: {formatTime(svc.signed_in_at)}
                      {svc.signed_out_at && ` · Out: ${formatTime(svc.signed_out_at)}`}
                    </p>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="glass-panel rounded-2xl p-8 text-center">
                <p className="text-sm text-muted">No records found</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { portalService, type TodayService, type PortalAttendance } from '@/lib/api/portalService';
import { usePortalAuth } from '../layout';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AttendanceRing({ pct, below }: { pct: number; below: boolean }) {
  const size = 120; const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const color = below ? '#ef4444' : '#22c55e';
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold" style={{ color }}>{pct.toFixed(0)}%</p>
        <p className="text-[9px] text-muted">attendance</p>
      </div>
    </div>
  );
}

export default function StudentHomePage() {
  const { student, logout } = usePortalAuth();
  const [today, setToday]     = useState<TodayService[]>([]);
  const [summary, setSummary] = useState<Pick<PortalAttendance, 'percentage' | 'valid_count' | 'total_required' | 'below_threshold'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.allSettled([portalService.getToday(), portalService.getAttendance()])
      .then(([todayResult, attendanceResult]) => {
        if (todayResult.status === 'fulfilled') {
          setToday(todayResult.value.services);
        }
        if (attendanceResult.status === 'fulfilled') {
          const a = attendanceResult.value;
          setSummary({ percentage: a.percentage, valid_count: a.valid_count, total_required: a.total_required, below_threshold: a.below_threshold });
        }
        const failed = [todayResult, attendanceResult].filter(r => r.status === 'rejected');
        if (failed.length === 2) {
          setError((failed[0] as PromiseRejectedResult).reason?.message || 'Failed to load data');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = student?.full_name.split(' ')[0] || '';

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">{greeting}</p>
          <h1 className="text-xl font-bold text-foreground">{firstName} 👋</h1>
          <p className="text-xs text-muted mt-0.5">{student?.service_group} · {student?.department}</p>
        </div>
        <button onClick={logout} className="text-xs text-muted underline">Sign out</button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
      ) : error ? (
        <div className="glass-panel rounded-2xl p-6 border border-red-500/30 bg-red-500/5 text-center space-y-2">
          <p className="text-sm font-semibold text-red-400">Could not load data</p>
          <p className="text-xs text-muted">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-xs text-primary underline">Retry</button>
        </div>
      ) : (
        <>
          {summary && (
            <div className="glass-panel rounded-2xl p-5 border border-border flex items-center gap-5">
              <AttendanceRing pct={summary.percentage} below={summary.below_threshold} />
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Attendance</p>
                <p className="text-xs text-muted mt-0.5">{summary.valid_count} of {summary.total_required} services</p>
                {summary.below_threshold && (
                  <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">
                    <p className="text-[10px] text-red-400 font-semibold">⚠️ Below 70% threshold</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Today's Services</p>
            {today.length === 0 ? (
              <div className="glass-panel rounded-2xl p-6 text-center">
                <p className="text-2xl mb-1">📅</p>
                <p className="text-sm text-muted">No services today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {today.map(svc => (
                  <div key={svc.id} className="glass-panel rounded-2xl p-4 border border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-foreground">{svc.name}</p>
                        <p className="text-xs text-muted mt-0.5">{formatTime(svc.window_open_time)} → {formatTime(svc.window_close_time)}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${svc.is_window_open ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-2 text-muted'}`}>
                        {svc.is_window_open ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${svc.signed_in ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-2 text-muted'}`}>
                        {svc.signed_in ? '✓ Signed in' : '✗ Not scanned'}
                      </span>
                      {svc.signout_required && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${svc.signed_out ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {svc.signed_out ? '✓ Signed out' : '⏳ Sign-out required'}
                        </span>
                      )}
                    </div>
                    {svc.notes && <p className="text-xs text-amber-300 mt-2 bg-amber-500/10 rounded-lg px-2 py-1">📌 {svc.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

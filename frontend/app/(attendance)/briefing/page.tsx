'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api/client';

interface BriefingService {
  id: string;
  name: string;
  service_type: string;
  service_group: string;
  window_open_time: string;
  window_close_time: string;
  window_status: 'upcoming' | 'open' | 'closed';
  seconds_until_open: number;
  seconds_until_close: number;
  signed_in_count: number;
  expected_count: number;
  attendance_pct: number;
  notes: string;
  signout_required: boolean;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function BriefingPage() {
  const router = useRouter();
  const [services, setServices] = useState<BriefingService[]>([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ date: string; services: BriefingService[] }>('/api/attendance/briefing/');
      setServices(data.services);
      setDate(data.date);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh data every 30s
  useEffect(() => {
    const id = setInterval(() => { load(); setTick(t => t + 1); }, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Local countdown tick every second
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute live countdowns from current time
  const liveServices = services.map(svc => {
    const now = Date.now();
    const openMs = new Date(svc.window_open_time).getTime();
    const closeMs = new Date(svc.window_close_time).getTime();
    let window_status: BriefingService['window_status'] = svc.window_status;
    let seconds_until_open = 0;
    let seconds_until_close = 0;

    if (now < openMs) {
      window_status = 'upcoming';
      seconds_until_open = Math.max(0, Math.floor((openMs - now) / 1000));
    } else if (now > closeMs) {
      window_status = 'closed';
    } else {
      window_status = 'open';
      seconds_until_close = Math.max(0, Math.floor((closeMs - now) / 1000));
    }

    return { ...svc, window_status, seconds_until_open, seconds_until_close };
  });

  const statusColor = (s: BriefingService['window_status']) => ({
    open:     'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    upcoming: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    closed:   'bg-red-500/20 border-red-500/40 text-red-300',
  }[s]);

  const statusLabel = (svc: typeof liveServices[0]) => {
    if (svc.window_status === 'open')     return `Closes in ${formatCountdown(svc.seconds_until_close)}`;
    if (svc.window_status === 'upcoming') return `Opens in ${formatCountdown(svc.seconds_until_open)}`;
    return 'Window closed';
  };

  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Daily Briefing</h1>
          <p className="text-xs text-muted mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => router.push('/scan')}
          className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
        >
          Go to Scanner
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-40 rounded-2xl bg-surface-2 animate-pulse" />
          ))}
        </div>
      ) : liveServices.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-sm font-semibold text-foreground">No services today</p>
          <p className="text-xs text-muted mt-1">Check back on your next service day</p>
        </div>
      ) : (
        <div className="space-y-4">
          {liveServices.map(svc => (
            <div key={svc.id} className="glass-panel rounded-2xl p-5 border border-border space-y-4">
              {/* Service header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground">{svc.name}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatTime(svc.window_open_time)} → {formatTime(svc.window_close_time)}
                    {svc.signout_required && <span className="ml-2 text-warning">· Sign-out required</span>}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border whitespace-nowrap ${statusColor(svc.window_status)}`}>
                  {statusLabel(svc)}
                </span>
              </div>

              {/* Headcount */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{svc.signed_in_count}</p>
                  <p className="text-[10px] text-muted mt-0.5">Scanned</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{svc.expected_count}</p>
                  <p className="text-[10px] text-muted mt-0.5">Expected</p>
                </div>
                <div className="bg-surface-2 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${svc.attendance_pct >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {svc.attendance_pct}%
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">Rate</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${svc.attendance_pct >= 70 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(100, svc.attendance_pct)}%` }}
                />
              </div>

              {/* Notes */}
              {svc.notes && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-amber-300 font-semibold mb-0.5">📌 Notes</p>
                  <p className="text-xs text-white/80 leading-relaxed">{svc.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Auto-refresh note */}
      <p className="text-center text-[10px] text-muted pb-4">Refreshes every 30 seconds</p>
    </div>
  );
}

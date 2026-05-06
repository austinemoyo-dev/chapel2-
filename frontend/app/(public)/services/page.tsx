'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registrationService, type PublicStudentLookupResponse, type StudentAttendancePortalResponse } from '@/lib/api/registrationService';
import Logo from '@/components/ui/Logo';

const TABS = [
  { key: 'lookup',     label: 'Service Check',  icon: '🔍' },
  { key: 'attendance', label: 'My Attendance',   icon: '📊' },
  { key: 'resume',     label: 'Resume Capture',  icon: '📷' },
] as const;
type TabKey = typeof TABS[number]['key'];

function Ring({ pct, bad }: { pct: number; bad: boolean }) {
  const r = 58, sw = 8, c = 2 * Math.PI * r;
  const off = c - (Math.min(pct, 100) / 100) * c;
  const col = bad ? '#ef4444' : '#22c55e';
  return (
    <div className="relative w-[148px] h-[148px] mx-auto">
      <svg width={148} height={148} className="-rotate-90">
        <circle cx={74} cy={74} r={r} stroke="var(--color-border)" strokeWidth={sw} fill="none" opacity={.18}/>
        <circle cx={74} cy={74} r={r} stroke={col} strokeWidth={sw} fill="none"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
                className="transition-all duration-[1.2s] ease-out"/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-black tracking-tight" style={{ color: col }}>{pct.toFixed(1)}%</span>
        <span className="text-[10px] font-semibold text-muted mt-0.5">Attendance</span>
      </div>
    </div>
  );
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
  ) : (
    <svg className="w-4 h-4 text-danger shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
  );
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}
function fmtD(d: string) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return d; }
}

function StudentServicesContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<TabKey>((sp.get('tab') as TabKey) || 'lookup');
  const [id, setId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [lookup, setLookup] = useState<PublicStudentLookupResponse | null>(null);
  const [att, setAtt] = useState<StudentAttendancePortalResponse | null>(null);

  const switchTab = (t: TabKey) => { setTab(t); setErr(''); setLookup(null); setAtt(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return;
    setLoading(true); setErr(''); setLookup(null); setAtt(null);
    try {
      if (tab === 'attendance') setAtt(await registrationService.getMyAttendance(id.trim()));
      else setLookup(await registrationService.lookupStudent(id.trim()));
    } catch (ex: any) {
      let m = 'Student not found. Check your Matric or Phone Number.';
      if (ex?.response?.status === 429) m = 'Too many requests — please wait and retry.';
      else if (ex?.response?.status >= 500) m = 'Server issue. Try again shortly.';
      else if (ex?.message === 'Network Error') m = 'No internet connection.';
      else if (ex?.response?.data?.error) m = ex.response.data.error;
      setErr(m);
    } finally { setLoading(false); }
  };

  const btnLabel = tab === 'lookup' ? 'Check Status' : tab === 'attendance' ? 'View Attendance' : 'Verify Identity';

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute -top-[18%] -left-[12%] w-[55%] h-[55%] bg-primary/12 blur-[160px] rounded-full pointer-events-none"/>
      <div className="absolute bottom-[2%] -right-[12%] w-[40%] h-[40%] bg-accent/12 blur-[130px] rounded-full pointer-events-none"/>
      <div className="absolute top-[35%] left-[55%] w-[22%] h-[22%] bg-primary/8 blur-[90px] rounded-full pointer-events-none"/>

      <div className="relative z-10 max-w-[440px] mx-auto px-5 pt-10 pb-12">
        {/* Header */}
        <header className="text-center mb-8 animate-fade-in">
          <Logo className="mx-auto"/>
          <h1 className="mt-5 text-[1.75rem] font-black text-foreground tracking-tight leading-tight">Student Services</h1>
          <p className="mt-1.5 text-[13px] text-muted max-w-[260px] mx-auto leading-relaxed">
            Check your service group, view attendance, or resume face capture.
          </p>
        </header>

        {/* Tab bar */}
        <nav className="flex gap-1 p-1.5 rounded-[1.25rem] bg-surface/70 backdrop-blur-xl border border-white/30
                        shadow-[0_2px_16px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] mb-7 animate-slide-up"
             style={{ animationDelay: '.1s' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-1 rounded-[0.85rem] text-[13px] font-bold
                         transition-all duration-300 touch-manipulation
                         ${tab === t.key
                           ? 'bg-primary text-white shadow-[0_4px_20px_rgba(139,0,255,0.35)]'
                           : 'text-muted hover:text-foreground'}`}>
              <span className="text-[15px]">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Search card */}
        <div className="animate-slide-up" style={{ animationDelay: '.18s' }}>
          <div className="glass-panel rounded-[1.5rem] p-6 border border-white/35
                          shadow-[0_8px_40px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.55)]">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="svc-id" className="block text-xs font-bold text-muted mb-2 uppercase tracking-wider">
                  Matric Number or Phone
                </label>
                <input id="svc-id" type="text" required placeholder="e.g. 210101010 or 08012345678"
                  value={id} onChange={e => setId(e.target.value)}
                  className="w-full h-[52px] px-5 rounded-2xl bg-surface-2 border border-border text-[15px] text-foreground
                             placeholder:text-muted/50 font-medium
                             focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40
                             transition-all duration-200"/>
              </div>
              <button type="submit" disabled={!id.trim() || loading}
                className="btn-liquid w-full h-[52px] rounded-2xl text-[15px] font-black text-white
                           disabled:opacity-40 disabled:cursor-not-allowed
                           shadow-[0_6px_24px_rgba(139,0,255,0.3)]
                           transition-all active:scale-[0.97]">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    Searching…
                  </span>
                ) : btnLabel}
              </button>
            </form>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="mt-5 p-4 rounded-2xl bg-danger/8 border border-danger/15 text-danger text-center animate-slide-up
                          shadow-[0_4px_20px_rgba(239,68,68,0.08)]">
            <svg className="w-5 h-5 mx-auto mb-1 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
            </svg>
            <p className="text-[13px] font-semibold">{err}</p>
          </div>
        )}

        {/* ═══ LOOKUP RESULT ═══ */}
        {lookup && tab === 'lookup' && (
          <div className="mt-6 animate-slide-up">
            <div className="glass-panel rounded-[1.5rem] overflow-hidden border border-white/35
                            shadow-[0_8px_40px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-7 text-center border-b border-border/30">
                <p className="text-[10px] font-black text-primary/50 uppercase tracking-[0.2em] mb-2">Your Service Group</p>
                <h3 className="text-[3rem] font-black text-foreground tracking-tight leading-none">
                  {lookup.service_group || 'N/A'}
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{lookup.full_name}</p>
                  <p className="text-[13px] text-muted mt-0.5">{lookup.department} · {lookup.level} Level</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface-2/60 border border-border/40">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-foreground">Face Capture</span>
                    <span className={`text-[11px] font-black px-3 py-1 rounded-full ${
                      lookup.face_registered
                        ? 'bg-success/15 text-success border border-success/20'
                        : 'bg-warning/15 text-warning border border-warning/20'
                    }`}>{lookup.face_registered ? '✓ Registered' : '⏳ Pending'}</span>
                  </div>
                  <p className="text-[12px] text-muted mt-2.5 leading-relaxed">
                    {lookup.face_registered
                      ? 'You\'re fully set! Head to the smart scanners for attendance.'
                      : `Visit the Chapel admin desk during your ${lookup.service_group || 'service'} session.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESUME RESULT ═══ */}
        {lookup && tab === 'resume' && (
          <div className="mt-6 animate-slide-up">
            <div className="glass-panel rounded-[1.5rem] overflow-hidden border border-white/35
                            shadow-[0_8px_40px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{lookup.full_name}</p>
                  <p className="text-[13px] text-muted">{lookup.department} · {lookup.level} Level</p>
                  <div className="mt-2.5">
                    <span className={`text-[11px] font-black px-3 py-1 rounded-full ${
                      lookup.face_registered
                        ? 'bg-success/15 text-success border border-success/20'
                        : 'bg-warning/15 text-warning border border-warning/20'
                    }`}>{lookup.face_registered ? '✓ Face Registered' : '⏳ Face Pending'}</span>
                  </div>
                </div>
                {lookup.face_registered ? (
                  <div className="p-5 rounded-2xl bg-success/8 border border-success/15 text-center">
                    <svg className="w-12 h-12 text-success mx-auto mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <p className="text-[14px] font-bold text-success">Already Captured!</p>
                    <p className="text-[12px] text-success/70 mt-1">No further action needed.</p>
                  </div>
                ) : (
                  <button onClick={() => router.push(`/registration/face-capture?student=${lookup.id}&semester=${lookup.semester}`)}
                    className="btn-liquid w-full h-[56px] rounded-2xl text-[15px] font-black text-white flex items-center justify-center gap-2.5
                               shadow-[0_6px_28px_rgba(139,0,255,0.35)] active:scale-[0.97] transition-transform">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    Open Camera
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ATTENDANCE RESULT ═══ */}
        {att && tab === 'attendance' && (
          <div className="mt-6 space-y-4 animate-slide-up">
            {/* Student card + ring */}
            <div className="glass-panel rounded-[1.5rem] overflow-hidden border border-white/35
                            shadow-[0_8px_40px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-5 text-center border-b border-border/30">
                <p className="text-lg font-bold text-foreground">{att.full_name}</p>
                <p className="text-[13px] text-muted">{att.department} · {att.level} Level</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15">{att.service_group || 'N/A'}</span>
                  <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-surface-2 text-muted border border-border/50">{att.semester_name}</span>
                </div>
              </div>
              <div className="p-6">
                <Ring pct={att.percentage} bad={att.below_threshold}/>
                {att.below_threshold && (
                  <div className="mt-4 p-3 rounded-2xl bg-danger/8 border border-danger/12 text-center">
                    <p className="text-[13px] font-bold text-danger">Below 70% Threshold</p>
                    <p className="text-[11px] text-danger/70 mt-0.5">
                      Need {Math.max(0, Math.ceil(att.total_required * .7) - att.valid_count)} more valid attendance(s).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { l: 'Present', v: att.services.filter(s => s.status === 'valid').length,  c: 'text-success', bg: 'bg-success/8 border-success/12' },
                { l: 'Missed',  v: att.services.filter(s => s.status === 'missed').length, c: 'text-danger',  bg: 'bg-danger/8 border-danger/12' },
                { l: 'Excused', v: att.excused_count,                                      c: 'text-warning', bg: 'bg-warning/8 border-warning/12' },
                { l: 'Total',   v: att.total_required,                                     c: 'text-primary', bg: 'bg-primary/8 border-primary/12' },
              ].map(s => (
                <div key={s.l} className={`${s.bg} border rounded-2xl p-3 text-center`}>
                  <p className={`text-xl font-black ${s.c}`}>{s.v}</p>
                  <p className="text-[9px] text-muted font-bold mt-0.5 uppercase tracking-wider">{s.l}</p>
                </div>
              ))}
            </div>

            {/* History */}
            <div className="glass-panel rounded-[1.5rem] border border-white/35 p-5
                            shadow-[0_8px_40px_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.55)]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-black text-foreground">Service History</h2>
                <span className="text-[10px] text-muted font-bold">{att.services.length} services</span>
              </div>
              {att.services.length === 0 ? (
                <p className="text-[13px] text-muted text-center py-6">No services recorded yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                  {att.services.map((s, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-2/50 border border-border/30">
                      <StatusIcon ok={s.status === 'valid'}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-foreground truncate">{s.service_name}</p>
                        <p className="text-[10px] text-muted">{fmtD(s.scheduled_date)}{s.signed_in_at && <> · {fmt(s.signed_in_at)}</>}</p>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        s.status === 'valid'   ? 'bg-success/12 text-success' :
                        s.status === 'missed'  ? 'bg-danger/12 text-danger' :
                                                 'bg-warning/12 text-warning'
                      }`}>{s.status === 'valid' ? 'Present' : s.status === 'missed' ? 'Missed' : 'Excused'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Back */}
        <div className="mt-8 text-center animate-fade-in" style={{ animationDelay: '.3s' }}>
          <button onClick={() => router.push('/')}
            className="text-[13px] font-bold text-muted hover:text-foreground transition-colors">
            ← Return Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudentServicesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"/></div>}>
      <StudentServicesContent />
    </Suspense>
  );
}

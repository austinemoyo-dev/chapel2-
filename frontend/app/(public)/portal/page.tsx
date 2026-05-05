'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrationService, type StudentAttendancePortalResponse, type AttendanceServiceRecord } from '@/lib/api/registrationService';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Logo from '@/components/ui/Logo';

/* ─── Circular progress ring ─── */
function AttendanceRing({ percentage, belowThreshold }: { percentage: number; belowThreshold: boolean }) {
  const size = 160;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(percentage, 100);
  const offset = circumference - (progress / 100) * circumference;

  const color = belowThreshold ? '#ef4444' : '#22c55e';
  const bgColor = belowThreshold ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--border)"
          strokeWidth={stroke}
          fill="none"
          opacity={0.3}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold" style={{ color }}>
          {percentage.toFixed(1)}%
        </span>
        <span className="text-xs font-medium text-muted mt-0.5">Attendance</span>
      </div>
    </div>
  );
}

/* ─── Status icon for each service row ─── */
function StatusIcon({ status }: { status: string }) {
  if (status === 'valid') return (
    <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
  if (status === 'missed') return (
    <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  if (status === 'excused') return (
    <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
  // invalid
  return (
    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

/* ─── Status badge variant mapping ─── */
function statusBadge(status: string) {
  const map: Record<string, { variant: 'success' | 'danger' | 'warning' | 'info'; label: string }> = {
    valid:   { variant: 'success', label: 'Present' },
    missed:  { variant: 'danger',  label: 'Missed' },
    excused: { variant: 'warning', label: 'Excused' },
    invalid: { variant: 'info',    label: 'Incomplete' },
  };
  return map[status] || { variant: 'info' as const, label: status };
}

/* ─── Service type label ─── */
function serviceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    midweek: 'Midweek',
    sunday: 'Sunday',
    special: 'Special',
  };
  return labels[type] || type;
}

/* ─── Format time from ISO string ─── */
function formatTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/* ─── Format date ─── */
function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function AttendancePortalPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<StudentAttendancePortalResponse | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await registrationService.getMyAttendance(identifier.trim());
      setResult(data);
    } catch (err: any) {
      let friendlyError = 'Could not retrieve attendance data.';
      if (err?.response?.status === 404) {
        friendlyError = 'No student found with that Matric Number or Phone Number.';
      } else if (err?.response?.status === 429) {
        friendlyError = 'Too many requests. Please wait a moment and try again.';
      } else if (err?.response?.status >= 500) {
        friendlyError = 'Server is experiencing issues. Please try again later.';
      } else if (err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
        friendlyError = 'Network connection failed. Please check your internet.';
      } else if (err?.response?.data?.error) {
        friendlyError = err.response.data.error;
      }
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  };

  const stats = result ? {
    attended: result.services.filter(s => s.status === 'valid').length,
    missed: result.services.filter(s => s.status === 'missed').length,
    excused: result.services.filter(s => s.status === 'excused').length,
    invalid: result.services.filter(s => s.status === 'invalid').length,
  } : null;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[10%] -right-[10%] w-[30%] h-[30%] bg-accent/20 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Logo className="mx-auto" />
          <h1 className="mt-6 text-3xl font-extrabold text-foreground tracking-tight">
            My Attendance
          </h1>
          <p className="mt-2 text-sm text-muted">
            Check your attendance record and service history.
          </p>
        </div>

        {/* Search form */}
        <Card variant="glass" className="p-6 md:p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            <Input
              id="portal-identifier"
              label="Matric Number or Phone Number"
              placeholder="e.g. 210101010 or 08012345678"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full h-12 text-lg"
              loading={loading}
              disabled={!identifier.trim() || loading}
            >
              Check Attendance
            </Button>
          </form>
        </Card>

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-center animate-fade-in text-sm font-medium">
            {error}
          </div>
        )}

        {/* Results */}
        {result && stats && (
          <div className="mt-8 space-y-6 animate-slide-up">

            {/* Student info + ring */}
            <Card variant="glass" className="overflow-hidden">
              <div className="bg-primary/10 p-6 text-center border-b border-primary/20">
                <p className="text-xl font-bold text-foreground">{result.full_name}</p>
                <p className="text-sm text-muted mt-1">{result.department} · {result.level} Level</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Badge variant="info">{result.service_group || 'Unassigned'}</Badge>
                  <Badge variant="info">{result.semester_name}</Badge>
                </div>
              </div>

              <div className="p-6 flex flex-col items-center">
                <AttendanceRing percentage={result.percentage} belowThreshold={result.below_threshold} />

                {result.below_threshold && (
                  <div className="mt-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-center w-full">
                    <p className="text-sm font-semibold text-danger">Below 70% Threshold</p>
                    <p className="text-xs text-danger/80 mt-0.5">
                      You need {Math.max(0, Math.ceil(result.total_required * 0.7) - result.valid_count)} more valid attendance(s) to meet the requirement.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Present', value: stats.attended, color: 'text-success', bg: 'bg-success/10' },
                { label: 'Missed', value: stats.missed, color: 'text-danger', bg: 'bg-danger/10' },
                { label: 'Excused', value: stats.excused, color: 'text-warning', bg: 'bg-warning/10' },
                { label: 'Total', value: result.total_required, color: 'text-primary', bg: 'bg-primary/10' },
              ].map((stat) => (
                <div key={stat.label} className={`${stat.bg} rounded-xl p-3 text-center`}>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted font-medium mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Service-by-service breakdown */}
            <Card variant="glass">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-foreground">Service History</h2>
                <span className="text-xs text-muted">{result.services.length} services</span>
              </div>

              {result.services.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted">No services recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {result.services.map((svc, idx) => {
                    const badge = statusBadge(svc.status);
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border/50 hover:border-border transition-colors"
                      >
                        <StatusIcon status={svc.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {svc.service_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted">{formatDate(svc.scheduled_date)}</span>
                            <span className="text-xs text-muted/40">·</span>
                            <span className="text-xs text-muted">{serviceTypeLabel(svc.service_type)}</span>
                            {svc.signed_in_at && (
                              <>
                                <span className="text-xs text-muted/40">·</span>
                                <span className="text-xs text-muted">
                                  In: {formatTime(svc.signed_in_at)}
                                  {svc.signed_out_at && ` → Out: ${formatTime(svc.signed_out_at)}`}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Back button */}
        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={() => router.push('/')}>
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}

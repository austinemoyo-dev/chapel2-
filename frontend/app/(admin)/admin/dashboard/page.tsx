'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { adminService } from '@/lib/api/adminService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import { reportService } from '@/lib/api/reportService';
import { registrationService } from '@/lib/api/registrationService';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import { ATTENDANCE_THRESHOLD } from '@/lib/utils/constants';
import { formatTime } from '@/lib/utils/formatters';

interface DashStats {
  totalStudents:   number;
  belowThreshold:  number;
  activeServices:  number;
  pendingDuplicates: number;
  registrationOpen:  boolean;
}

/* ─── Stat card icons ─── */
const StatIcon = {
  students: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>
  ),
  services: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008z"/>
    </svg>
  ),
  duplicate: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/>
    </svg>
  ),
};

/* ─── Quick action link ─── */
function QuickAction({
  href, icon, label, description,
}: { href: string; icon: React.ReactNode; label: string; description: string }) {
  return (
    <Link href={href}
          className="group flex items-center gap-4 p-4 rounded-2xl glass-card
                     border border-transparent hover:border-primary/25
                     card-lift transition-all duration-300">
      <div className="w-10 h-10 rounded-xl bg-surface/50 flex items-center justify-center
                      shadow-sm text-muted group-hover:text-primary
                      group-hover:bg-primary/10 transition-colors shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
        <p className="text-xs text-muted truncate">{description}</p>
      </div>
      <svg className="w-4 h-4 text-muted ml-auto shrink-0 opacity-0 -translate-x-1
                      group-hover:opacity-100 group-hover:translate-x-0 transition-all"
           fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
      </svg>
    </Link>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveServices, setLiveServices] = useState<Service[]>([]);
  const [upcomingServices, setUpcomingServices] = useState<Service[]>([]);
  const [recentSignIns, setRecentSignIns] = useState<any[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    const [studentsRes, servicesRes, reportRes, duplicatesRes, statusRes] =
      await Promise.allSettled([
        adminService.listStudents({ page: '1' }),
        serviceService.listServices({ is_cancelled: 'false' }),
        reportService.getAttendanceReport({ below_threshold: 'true' }),
        adminService.listStudents({ duplicate_flag: 'true' }),
        registrationService.getStatus(),
      ]);

    const totalStudents   = studentsRes.status   === 'fulfilled' ? studentsRes.value.count || 0   : 0;
    const allServices     = servicesRes.status   === 'fulfilled'
      ? Array.isArray(servicesRes.value) ? servicesRes.value : servicesRes.value.results || []
      : [];
    const belowThreshold  = reportRes.status     === 'fulfilled' ? reportRes.value.students_below_threshold : 0;
    const pendingDuplicates = duplicatesRes.status === 'fulfilled' ? duplicatesRes.value.count || 0 : 0;
    const registrationOpen  = statusRes.status   === 'fulfilled' ? statusRes.value.registration_open : false;

    const now = new Date().toISOString();
    const live = allServices.filter(
      (s: Service) => s.window_open_time <= now && s.window_close_time >= now && !s.is_cancelled
    );
    const upcoming = allServices.filter(
      (s: Service) => s.window_open_time > now && !s.is_cancelled
    ).slice(0, 3);

    setLiveServices(live);
    setUpcomingServices(upcoming);
    setStats({ totalStudents, belowThreshold, activeServices: allServices.filter((s: Service) => !s.is_cancelled).length, pendingDuplicates, registrationOpen });
    
    if (live.length > 0) {
      try {
        const attendanceData = await adminService.getServiceAttendance(live[0].id);
        setRecentSignIns(attendanceData.results?.slice(0, 5) || []);
      } catch (err) {
        console.error('Failed to fetch recent sign-ins', err);
      }
    } else {
      setRecentSignIns([]);
    }

    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Full stats refresh every 30 seconds
    const statsInterval = setInterval(() => { void load(); }, 30000);

    // Dedicated 5-second fast poll for the live attendance feed only
    const feedInterval = setInterval(async () => {
      const now = new Date().toISOString();
      try {
        const servicesData = await serviceService.listServices({ is_cancelled: 'false' });
        const all = Array.isArray(servicesData) ? servicesData : (servicesData as any).results || [];
        const live = all.filter(
          (s: Service) => s.window_open_time <= now && s.window_close_time >= now && !s.is_cancelled,
        );
        if (live.length > 0) {
          const attendanceData = await adminService.getServiceAttendance(live[0].id);
          // Sort most recent first, keep top 5
          const sorted = (attendanceData.results || [])
            .sort((a: any, b: any) =>
              new Date(b.signed_in_at).getTime() - new Date(a.signed_in_at).getTime(),
            )
            .slice(0, 5);
          setRecentSignIns(sorted);
          setLiveServices(live);
        } else {
          setRecentSignIns([]);
          setLiveServices([]);
        }
      } catch {
        // Silent — don't error the whole dashboard on a feed poll failure
      }
    }, 5000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(feedInterval);
    };
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40 rounded-xl"/>
          <Skeleton className="h-6 w-28 rounded-full"/>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl"/>)}
        </div>
        <Skeleton className="h-48 rounded-2xl"/>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Students', value: stats?.totalStudents || 0,
      icon: StatIcon.students,
      iconBg: 'bg-primary/10 text-primary',
      valueCls: 'text-foreground',
    },
    {
      label: 'Active Services', value: stats?.activeServices || 0,
      icon: StatIcon.services,
      iconBg: 'bg-info-muted text-info',
      valueCls: 'text-foreground',
    },
    {
      label: `Below ${ATTENDANCE_THRESHOLD}%`, value: stats?.belowThreshold || 0,
      icon: StatIcon.warning,
      iconBg: 'bg-danger-muted text-danger',
      valueCls: stats?.belowThreshold ? 'text-danger' : 'text-foreground',
    },
    {
      label: 'Pending Duplicates', value: stats?.pendingDuplicates || 0,
      icon: StatIcon.duplicate,
      iconBg: 'bg-warning-muted text-warning',
      valueCls: stats?.pendingDuplicates ? 'text-warning' : 'text-foreground',
    },
  ];

  const serviceTypeIcon = (type: string) => {
    if (type === 'midweek') return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
      </svg>
    );
    if (type === 'sunday') return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21"/>
      </svg>
    );
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
      </svg>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">
            Updated {lastRefresh.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <Badge
          variant={stats?.registrationOpen ? 'success' : 'warning'}
          dot
        >
          Registration {stats?.registrationOpen ? 'Open' : 'Closed'}
        </Badge>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} variant="glass" className="relative overflow-hidden group card-lift">
            {/* Subtle corner glow */}
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full
                            bg-primary/5 group-hover:bg-primary/10 transition-colors"/>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.iconBg}`}>
              {card.icon}
            </div>
            <p className={`text-3xl font-bold tracking-tight mb-1 ${card.valueCls}`}>
              {card.value.toLocaleString()}
            </p>
            <p className="text-xs text-muted font-medium">{card.label}</p>
          </Card>
        ))}
      </div>

      {/* ── Live Services ── */}
      <Card variant="glass">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {liveServices.length > 0 ? (
              <div className="status-dot-live w-3 h-3 rounded-full bg-success shrink-0"/>
            ) : (
              <div className="w-3 h-3 rounded-full bg-surface-3 shrink-0"/>
            )}
            <h2 className="text-base font-bold text-foreground">Live Services</h2>
            {liveServices.length > 0 && (
              <Badge variant="success" dot>{liveServices.length} active</Badge>
            )}
          </div>
          <span className="text-xs text-muted">Refreshes every 30s</span>
        </div>

        {liveServices.length > 0 ? (
          <div className="space-y-2">
            {liveServices.map((s) => (
              <div key={s.id}
                   className="flex items-center justify-between glass-purple
                              rounded-xl px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/20 text-primary-deep
                                  flex items-center justify-center shadow-sm">
                    {serviceTypeIcon(s.service_type)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {s.name || `${s.service_type} ${s.service_group}`}
                    </p>
                    <p className="text-xs text-muted">
                      {formatTime(s.window_open_time)} → {formatTime(s.window_close_time)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" dot>Window Open</Badge>
                  {s.signout_required && <Badge variant="warning">Sign-out req.</Badge>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-foreground/60">No open attendance windows</p>
            <p className="text-xs text-muted mt-1">Windows open automatically at scheduled times</p>
          </div>
        )}

        {liveServices.length > 0 && (
          <div className="mt-5 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-xs font-bold text-muted uppercase tracking-wider">Live Audit Feed</p>
              </div>
              <span className="text-[10px] text-muted/50">updates every 5s</span>
            </div>

            {recentSignIns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center bg-surface-2 rounded-xl">
                <span className="text-2xl mb-2">⏳</span>
                <p className="text-sm font-semibold text-foreground/60">Waiting for first sign-in</p>
                <p className="text-xs text-muted mt-1">Protocol members can start scanning now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSignIns.map((record) => (
                  <div key={record.id} className="flex items-center justify-between text-sm p-3 bg-surface-2 rounded-xl">
                    <div>
                      <p className="font-semibold text-foreground">{record.student_name}</p>
                      <p className="text-xs text-muted">{record.student_matric || record.student}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-success">
                        {new Date(record.signed_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                      <Badge variant={record.is_valid ? 'success' : 'warning'} className="mt-1">
                        {record.is_valid ? 'Valid' : 'Pending'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 text-center">
              <Link href={`/monitor/live/${liveServices[0].id}`} className="text-xs text-primary font-semibold hover:underline">
                View Full Monitor →
              </Link>
            </div>
          </div>
        )}

        {upcomingServices.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">Upcoming</p>
            <div className="space-y-1.5">
              {upcomingServices.map((s) => (
                <div key={s.id}
                     className="flex items-center justify-between text-sm
                                px-3 py-2.5 bg-surface-2 rounded-xl">
                  <div className="flex items-center gap-2.5 text-muted">
                    <span className="text-muted/60">{serviceTypeIcon(s.service_type)}</span>
                    <span>{s.name || `${s.service_type} ${s.service_group}`}</span>
                  </div>
                  <span className="text-xs text-muted/60 font-medium">
                    {s.scheduled_date} · {formatTime(s.window_open_time)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Quick Actions ── */}
      <Card variant="glass" className="mb-8">
        <h2 className="text-base font-bold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickAction href="/admin/students"
            label="View Students" description="Browse & manage student records"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            }
          />
          <QuickAction href="/admin/services"
            label="Manage Services" description="Schedule & configure service sessions"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            }
          />
          <QuickAction href="/admin/reports"
            label="Reports & Exports" description="Attendance analytics & PDF/Excel export"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            }
          />
          <QuickAction href="/admin/settings"
            label="Settings" description="Geo-fence, semesters & system config"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            }
          />
        </div>
      </Card>
    </div>
  );
}

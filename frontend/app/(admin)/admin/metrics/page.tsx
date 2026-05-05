'use client';

import { useState, useEffect } from 'react';
import { reportService, type ScanMetrics } from '@/lib/api/reportService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import BarChart from '@/components/charts/BarChart';

export default function MetricsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [metrics, setMetrics] = useState<ScanMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);

  useEffect(() => {
    serviceService.listServices({ is_cancelled: 'false' })
      .then(data => {
        const list = Array.isArray(data) ? data : (data as any).results || [];
        setServices(list);
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    reportService.getScanMetrics(selectedId)
      .then(setMetrics)
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const timelineAsBarData = (metrics?.timeline || []).map(t => ({
    date: new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: t.count,
  }));

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Scan Speed Metrics</h1>
        <p className="text-sm text-muted mt-0.5">Analyze scan throughput and protocol member performance</p>
      </div>

      {/* Service selector */}
      <Card variant="glass">
        <label className="text-sm font-medium text-foreground block mb-2">Select a Service</label>
        {servicesLoading ? (
          <Skeleton className="h-12 rounded-xl" />
        ) : (
          <select
            id="metrics-service-select"
            className="w-full h-12 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Choose a service...</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || `${s.service_type} ${s.service_group}`} — {s.scheduled_date}
              </option>
            ))}
          </select>
        )}
      </Card>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      )}

      {metrics && !loading && (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Scans', value: metrics.total_scans, color: 'text-primary' },
              { label: 'Avg Scans/Min', value: metrics.avg_scans_per_minute, color: 'text-success' },
              { label: 'Protocol Members', value: metrics.per_member.length, color: 'text-info' },
            ].map(stat => (
              <Card key={stat.label} variant="glass" className="text-center">
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted font-medium mt-1">{stat.label}</p>
              </Card>
            ))}
          </div>

          {/* Timeline chart */}
          {timelineAsBarData.length > 0 && (
            <Card variant="glass">
              <h2 className="text-sm font-bold text-foreground mb-3">Scans Over Time (5-min buckets)</h2>
              <BarChart data={timelineAsBarData} height={180} />
            </Card>
          )}

          {/* Protocol member leaderboard */}
          <Card variant="glass">
            <h2 className="text-sm font-bold text-foreground mb-4">Protocol Member Performance</h2>
            {metrics.per_member.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No scans recorded.</p>
            ) : (
              <div className="space-y-2">
                {metrics.per_member.map((member, i) => (
                  <div key={member.name}
                       className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                                    ${i === 0 ? 'bg-primary/20 text-primary' : 'bg-surface text-muted'}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{member.name}</p>
                      <p className="text-xs text-muted">
                        Avg {member.avg_gap_seconds.toFixed(1)}s between scans
                      </p>
                    </div>
                    <Badge variant="info">{member.scan_count} scans</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {!selectedId && !loading && (
        <Card variant="glass" className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-muted">Select a service above to view scan metrics.</p>
        </Card>
      )}
    </div>
  );
}

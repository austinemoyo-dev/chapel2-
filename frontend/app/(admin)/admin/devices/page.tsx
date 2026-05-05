'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/lib/api/adminService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';

interface ActiveScanner {
  protocol_member_name: string;
  device_id: string;
  scan_count: number;
  last_scan_at: string;
  gps_lat: number;
  gps_lng: number;
}

function timeSince(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusFromLastScan(iso: string): { color: string; label: string; variant: 'success' | 'warning' | 'danger' } {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 120) return { color: 'bg-success', label: 'Active', variant: 'success' };
  if (diff < 300) return { color: 'bg-warning', label: 'Idle', variant: 'warning' };
  return { color: 'bg-danger', label: 'Disconnected', variant: 'danger' };
}

export default function DevicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scanners, setScanners] = useState<ActiveScanner[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [lastPoll, setLastPoll] = useState<Date>(new Date());

  useEffect(() => {
    serviceService.listServices({ is_cancelled: 'false' })
      .then(data => {
        const list = Array.isArray(data) ? data : (data as any).results || [];
        setServices(list);
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, []);

  const fetchScanners = useCallback(async () => {
    if (!selectedId) return;
    try {
      const data = await adminService.getActiveScanners(selectedId);
      setScanners(data.active_scanners);
      setTotalActive(data.total_active);
      setLastPoll(new Date());
    } catch {
      // Silent fail on polling
    }
  }, [selectedId]);

  // Initial load
  useEffect(() => {
    if (selectedId) {
      setLoading(true);
      fetchScanners().finally(() => setLoading(false));
    }
  }, [selectedId, fetchScanners]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(fetchScanners, 5000);
    return () => clearInterval(interval);
  }, [selectedId, fetchScanners]);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Device Monitor</h1>
          <p className="text-sm text-muted mt-0.5">Real-time protocol device activity</p>
        </div>
        {selectedId && (
          <div className="text-right">
            <p className="text-xs text-muted">
              Updated {lastPoll.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <Badge variant="info" dot>{totalActive} device{totalActive !== 1 ? 's' : ''}</Badge>
          </div>
        )}
      </div>

      {/* Service selector */}
      <Card variant="glass">
        <label className="text-sm font-medium text-foreground block mb-2">Select a Service</label>
        {servicesLoading ? (
          <Skeleton className="h-12 rounded-xl" />
        ) : (
          <select
            id="devices-service-select"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      )}

      {!loading && selectedId && scanners.length === 0 && (
        <Card variant="glass" className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-muted">No active scanners in the last 5 minutes.</p>
          <p className="text-xs text-muted mt-1">Auto-refreshes every 5 seconds.</p>
        </Card>
      )}

      {/* Device cards */}
      {!loading && scanners.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {scanners.map(scanner => {
            const status = statusFromLastScan(scanner.last_scan_at);
            return (
              <Card key={scanner.protocol_member_name} variant="glass" className="relative overflow-hidden">
                {/* Status indicator */}
                <div className={`absolute top-3 right-3 w-3 h-3 rounded-full ${status.color} ${
                  status.variant === 'success' ? 'status-dot-live' : ''
                }`} />

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{scanner.protocol_member_name}</p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-2 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{scanner.scan_count}</p>
                    <p className="text-[10px] text-muted font-medium mt-0.5">Scans (5min)</p>
                  </div>
                  <div className="bg-surface-2 rounded-xl p-3 text-center">
                    <p className="text-sm font-semibold text-foreground">{timeSince(scanner.last_scan_at)}</p>
                    <p className="text-[10px] text-muted font-medium mt-0.5">Last Scan</p>
                  </div>
                </div>

                <div className="mt-3 text-xs text-muted">
                  <span>Device: {scanner.device_id.slice(0, 12)}...</span>
                  {scanner.gps_lat && (
                    <span className="ml-2">📍 {scanner.gps_lat.toFixed(4)}, {scanner.gps_lng.toFixed(4)}</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!selectedId && !loading && (
        <Card variant="glass" className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
          </div>
          <p className="text-sm text-muted">Select a service above to monitor active devices.</p>
        </Card>
      )}
    </div>
  );
}

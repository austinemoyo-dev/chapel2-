'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/lib/api/adminService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface SuspiciousFlag {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  device_id?: string;
  record_id?: string;
  student_name?: string;
  signed_in_at?: string;
  count?: number;
  distance_meters?: number;
}

const SEVERITY_COLOR = {
  high:   'danger',
  medium: 'warning',
  low:    'info',
} as const;

export default function SecurityPage() {
  const [services, setServices]   = useState<Service[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [flags, setFlags]         = useState<SuspiciousFlag[]>([]);
  const [totalFlags, setTotalFlags] = useState(0);
  const [loading, setLoading]     = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);

  // Photo audit
  const [auditRecordId, setAuditRecordId] = useState('');
  const [auditData, setAuditData]   = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [showAuditModal, setShowAuditModal] = useState(false);

  useEffect(() => {
    serviceService.listServices({ is_cancelled: 'false' })
      .then(data => setServices(Array.isArray(data) ? data : (data as any).results || []))
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, []);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getSuspiciousPatterns(selectedId || undefined);
      setFlags(data.flags);
      setTotalFlags(data.total_flags);
    } catch { setFlags([]); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  async function handlePhotoAudit() {
    if (!auditRecordId.trim()) return;
    setAuditLoading(true); setAuditError(''); setAuditData(null);
    try {
      const data = await adminService.getPhotoAudit(auditRecordId.trim());
      setAuditData(data);
      setShowAuditModal(true);
    } catch (e: any) {
      setAuditError(e.message || 'Record not found or no image stored.');
    } finally { setAuditLoading(false); }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Security & Integrity</h1>
        <p className="text-sm text-muted mt-0.5">Suspicious patterns and face photo audit</p>
      </div>

      {/* ── Photo Audit ── */}
      <Card variant="glass">
        <p className="text-sm font-bold text-foreground mb-3">Photo Audit</p>
        <p className="text-xs text-muted mb-3">Enter an attendance record ID to view the face photo captured at sign-in.</p>
        <div className="flex gap-2">
          <input
            className="flex-1 h-11 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
            placeholder="Attendance Record UUID"
            value={auditRecordId}
            onChange={e => { setAuditRecordId(e.target.value); setAuditError(''); }}
            onKeyDown={e => e.key === 'Enter' && handlePhotoAudit()}
          />
          <Button onClick={handlePhotoAudit} disabled={auditLoading || !auditRecordId.trim()}>
            {auditLoading ? 'Loading...' : 'View Photo'}
          </Button>
        </div>
        {auditError && <p className="text-xs text-red-400 mt-2">{auditError}</p>}
      </Card>

      {/* ── Suspicious Patterns ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">Suspicious Patterns</p>
            <p className="text-xs text-muted">Rapid scanning and out-of-fence records</p>
          </div>
          {totalFlags > 0 && <Badge variant="danger">{totalFlags} flag{totalFlags > 1 ? 's' : ''}</Badge>}
        </div>

        {/* Service filter */}
        <Card variant="glass">
          <label className="text-xs font-medium text-muted block mb-2">Filter by Service (optional)</label>
          {servicesLoading ? (
            <Skeleton className="h-11 rounded-xl" />
          ) : (
            <select
              className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">All services</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || `${s.service_type} ${s.service_group}`} — {s.scheduled_date}
                </option>
              ))}
            </select>
          )}
        </Card>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        ) : flags.length === 0 ? (
          <Card variant="glass" className="text-center py-10">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm text-muted">No suspicious patterns detected</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {flags.map((flag, i) => (
              <Card key={i} variant="glass" className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{flag.type === 'rapid_scanning' ? '⚡' : '📍'}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{flag.message}</p>
                      {flag.student_name && <p className="text-xs text-muted">{flag.student_name}</p>}
                      {flag.device_id && <p className="text-xs text-muted font-mono">{flag.device_id.slice(0, 20)}...</p>}
                      {flag.signed_in_at && (
                        <p className="text-xs text-muted">
                          {new Date(flag.signed_in_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={SEVERITY_COLOR[flag.severity]}>{flag.severity}</Badge>
                    {flag.record_id && (
                      <button
                        onClick={() => { setAuditRecordId(flag.record_id!); handlePhotoAudit(); }}
                        className="text-[10px] text-primary underline"
                      >
                        View photo
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Photo audit modal */}
      <Modal open={showAuditModal} onClose={() => setShowAuditModal(false)} title="Face Photo Audit">
        {auditData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted">Student</p><p className="font-semibold">{auditData.student_name}</p></div>
              <div><p className="text-xs text-muted">Signed In</p><p className="font-semibold">{new Date(auditData.signed_in_at).toLocaleString()}</p></div>
            </div>
            <img
              src={auditData.face_image_url}
              alt="Face capture"
              className="w-full rounded-2xl object-cover max-h-80"
            />
            <p className="text-[10px] text-muted text-center">Record ID: {auditData.record_id}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  issuesAdminService,
  type IssueReportListItem,
  type IssueReportDetail,
  type IssueStatus,
  type IssueSeverity,
} from '@/lib/api/issuesAdminService';
import { adminService } from '@/lib/api/adminService';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

const STATUS_TABS: { value: IssueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'awaiting_proof', label: 'Awaiting Proof' },
  { value: 'in_review', label: 'In Review' },
  { value: 'auto_resolved', label: 'Auto-Resolved' },
  { value: 'resolved', label: 'Resolved' },
];

const SEVERITY_BADGE: Record<IssueSeverity, 'danger' | 'warning' | 'info' | 'default'> = {
  urgent: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'default',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminIssuesPage() {
  const [statusTab, setStatusTab] = useState<IssueStatus>('open');
  const [issues, setIssues] = useState<IssueReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    issuesAdminService.list({ status: statusTab })
      .then(res => setIssues(res.results))
      .catch((err: Error) => setError(err.message || 'Failed to load issues'))
      .finally(() => setLoading(false));
  }, [statusTab]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Issue Reports</h1>
        <p className="text-sm text-muted mt-0.5">Student-submitted complaints, triaged automatically</p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              statusTab === tab.value ? 'bg-primary text-white' : 'bg-surface-2 text-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium">{error}</div>
      )}

      <Card variant="glass">
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-surface-2 animate-pulse" />)}</div>
        ) : issues.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">No reports here.</p>
        ) : (
          <div className="space-y-2">
            {issues.map(issue => (
              <div
                key={issue.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border/50
                           hover:border-border transition-colors cursor-pointer"
                onClick={() => setSelectedId(issue.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{issue.student_name}</p>
                  <p className="text-xs text-muted truncate">{issue.description}</p>
                  <p className="text-[10px] text-muted mt-0.5">{formatDate(issue.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {issue.resolution_type === 'fix_needed' && <Badge variant="warning" size="sm">Fix needed</Badge>}
                  {issue.resolution_type === 'awaiting_proof' && <Badge variant="info" size="sm">Awaiting proof</Badge>}
                  <Badge variant={SEVERITY_BADGE[issue.severity]} size="sm">{issue.severity}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedId && (
        <IssueDetailModal id={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}

function IssueDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<IssueReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<IssueStatus>('open');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fixReason, setFixReason] = useState('');
  const [fixBackdateType, setFixBackdateType] = useState<'valid' | 'excused'>('valid');
  const [fixIsValid, setFixIsValid] = useState(true);
  const [applyingFix, setApplyingFix] = useState(false);

  useEffect(() => {
    issuesAdminService.get(id)
      .then(d => {
        setDetail(d);
        setReply(d.admin_reply || d.ai_draft_reply || '');
        setStatus(d.status);
        setSeverity(d.severity);
        if (d.suggested_fix?.backdate_type) setFixBackdateType(d.suggested_fix.backdate_type);
        if (typeof d.suggested_fix?.is_valid === 'boolean') setFixIsValid(d.suggested_fix.is_valid);
        setFixReason(d.ai_summary ? `Approved via issue report: ${d.ai_summary}`.slice(0, 500) : '');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      await issuesAdminService.update(detail.id, { status, severity, admin_reply: reply });
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      await issuesAdminService.resolve(detail.id, reply);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Failed to resolve');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyFix = async () => {
    if (!detail?.suggested_fix) return;
    if (fixReason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }
    setApplyingFix(true);
    setError('');
    try {
      const fix = detail.suggested_fix;
      if (fix.action === 'backdate' && fix.student_id && fix.service_ids) {
        await adminService.backdateAttendance({
          student_id: fix.student_id,
          service_ids: fix.service_ids,
          backdate_type: fixBackdateType,
          reason_note: fixReason,
        });
      } else if (fix.action === 'edit' && fix.attendance_record_id) {
        await adminService.editAttendance(fix.attendance_record_id, {
          is_valid: fixIsValid,
          reason_note: fixReason,
        });
      }
      await issuesAdminService.resolve(detail.id, reply || 'This has been corrected — thanks for flagging it.');
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Failed to apply fix');
    } finally {
      setApplyingFix(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card variant="glass" className="w-full max-w-lg space-y-4 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">Issue Report</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="h-40 rounded-xl bg-surface-2 animate-pulse" />
        ) : !detail ? (
          <p className="text-sm text-danger">{error || 'Not found'}</p>
        ) : (
          <>
            <div className="p-3 rounded-xl bg-surface-2 text-sm space-y-1">
              <p className="font-semibold text-foreground">
                {detail.student_name} <span className="text-muted text-xs">({detail.student_identifier})</span>
              </p>
              <p className="text-foreground">{detail.description}</p>
            </div>

            {detail.student_followup && (
              <div className="p-3 rounded-xl bg-surface-2 border border-border text-sm">
                <p className="text-xs font-semibold text-muted mb-1">Student&apos;s response</p>
                <p className="text-foreground">{detail.student_followup}</p>
              </div>
            )}

            {detail.ai_summary && (
              <div className="p-3 rounded-xl bg-primary-muted border border-primary/20 text-sm">
                <p className="text-xs font-semibold text-primary mb-1">Summary</p>
                <p className="text-foreground">{detail.ai_summary}</p>
              </div>
            )}

            {detail.flagged_services_detail.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Related Services</p>
                {detail.flagged_services_detail.map(s => (
                  <div key={s.service_id} className="text-xs p-2 rounded-lg bg-surface-2 flex items-center justify-between">
                    <span className="text-foreground">{s.label} — {s.scheduled_date}</span>
                    <Badge variant={s.has_record ? (s.is_valid ? 'success' : 'danger') : 'default'} size="sm">
                      {s.has_record ? (s.is_valid ? 'Valid' : 'Invalid') : 'No record'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {detail.resolution_type === 'fix_needed' && detail.suggested_fix && (
              <div className="p-3 rounded-xl bg-warning-muted border border-warning/20 space-y-3">
                <p className="text-xs font-semibold text-warning">Suggested fix — needs your approval</p>

                {detail.suggested_fix.action === 'backdate' ? (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-foreground">Backdate as:</label>
                    {(['valid', 'excused'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setFixBackdateType(t)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium ${
                          fixBackdateType === t ? 'bg-primary text-white' : 'bg-surface-2 text-muted'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-foreground">Mark valid:</label>
                    <button
                      onClick={() => setFixIsValid(true)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium ${fixIsValid ? 'bg-success/20 text-success' : 'bg-surface-2 text-muted'}`}
                    >Yes</button>
                    <button
                      onClick={() => setFixIsValid(false)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium ${!fixIsValid ? 'bg-danger/20 text-danger' : 'bg-surface-2 text-muted'}`}
                    >No</button>
                  </div>
                )}

                <textarea
                  value={fixReason}
                  onChange={e => setFixReason(e.target.value)}
                  placeholder="Reason for this change (min 10 chars)..."
                  className="w-full h-20 px-3 py-2 rounded-xl bg-surface-2 border border-border text-xs text-foreground
                             resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />

                <Button
                  variant="primary" size="sm" className="w-full"
                  onClick={handleApplyFix} loading={applyingFix}
                  disabled={fixReason.trim().length < 10}
                >
                  Approve &amp; Apply Fix
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as IssueStatus)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm text-foreground"
                >
                  <option value="open">Open</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={e => setSeverity(e.target.value as IssueSeverity)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm text-foreground"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted block mb-1">Reply to student</label>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border text-sm text-foreground
                           resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button variant="secondary" className="flex-1" onClick={handleSave} loading={saving}>Save</Button>
              <Button variant="success" className="flex-1" onClick={handleResolve} loading={saving}>Resolve</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

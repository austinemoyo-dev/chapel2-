'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Live updates — refresh the inbox periodically so new tickets and
  // status changes show up without a manual reload. Paused while a
  // thread is open so it doesn't yank focus from the conversation.
  useEffect(() => {
    if (selectedId) return;
    const interval = setInterval(() => {
      issuesAdminService.list({ status: statusTab })
        .then(res => setIssues(res.results))
        .catch(() => { /* transient poll failure — don't disrupt the view */ });
    }, 6000);
    return () => clearInterval(interval);
  }, [statusTab, selectedId]);

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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{issue.student_name}</p>
                    <span className="text-[10px] text-muted shrink-0">{issue.ticket_code}</span>
                  </div>
                  <p className="text-xs text-muted truncate">{issue.last_message}</p>
                  <p className="text-[10px] text-muted mt-0.5">{formatDate(issue.updated_at)}</p>
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
        <IssueThreadModal id={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}

function IssueThreadModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<IssueReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<IssueStatus>('open');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [fixReason, setFixReason] = useState('');
  const [fixBackdateType, setFixBackdateType] = useState<'valid' | 'excused'>('valid');
  const [fixIsValid, setFixIsValid] = useState(true);
  const [applyingFix, setApplyingFix] = useState(false);

  const load = useCallback(() => {
    issuesAdminService.get(id)
      .then(d => {
        setDetail(d);
        setStatus(d.status);
        setSeverity(d.severity);
        if (d.suggested_fix?.backdate_type) setFixBackdateType(d.suggested_fix.backdate_type);
        if (typeof d.suggested_fix?.is_valid === 'boolean') setFixIsValid(d.suggested_fix.is_valid);
        setFixReason(d.ai_summary ? `Approved via ${d.ticket_code}: ${d.ai_summary}`.slice(0, 500) : '');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [detail?.messages.length]);

  // Live updates — while this thread is open, poll for new messages (e.g.
  // the student replying) without disturbing the status/severity/fix
  // fields the admin may be mid-editing.
  useEffect(() => {
    const interval = setInterval(() => {
      issuesAdminService.get(id)
        .then(fresh => {
          setDetail(prev => {
            if (!prev) return prev;
            const changed = fresh.messages.length !== prev.messages.length || fresh.status !== prev.status;
            return changed ? fresh : prev;
          });
        })
        .catch(() => { /* transient poll failure — don't disrupt the view */ });
    }, 4000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSendMessage = async () => {
    if (!detail || messageDraft.trim().length < 1) return;
    setSendingMessage(true);
    setError('');
    try {
      const updated = await issuesAdminService.sendMessage(detail.id, messageDraft.trim());
      setDetail(updated);
      setStatus(updated.status);
      setMessageDraft('');
      onChanged();
    } catch (e) {
      setError((e as Error).message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSaveFields = async () => {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      await issuesAdminService.update(detail.id, { status, severity });
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
      await issuesAdminService.resolve(detail.id, messageDraft.trim() || undefined);
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
      await issuesAdminService.resolve(detail.id, "This has been corrected — thanks for flagging it.");
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
      <Card variant="glass" className="w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 pb-0">
          <div>
            <h3 className="text-lg font-bold text-foreground">{detail?.student_name || 'Issue'}</h3>
            {detail && <p className="text-xs text-muted">{detail.ticket_code} · {detail.student_identifier}</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="h-40 rounded-xl bg-surface-2 animate-pulse m-4" />
        ) : !detail ? (
          <p className="text-sm text-danger p-4">{error || 'Not found'}</p>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {detail.ai_summary && (
              <div className="p-3 rounded-xl bg-primary-muted border border-primary/20 text-sm">
                <p className="text-xs font-semibold text-primary mb-1">AI Summary</p>
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

            {!(detail.resolution_type === 'fix_needed' && detail.suggested_fix)
              && detail.status !== 'resolved' && detail.status !== 'dismissed' && (
              <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-2">
                <p className="text-xs font-semibold text-muted">
                  No automatic fix for this one — reply below, then mark it fixed when you&apos;re done.
                </p>
                <Button variant="success" size="sm" className="w-full" onClick={handleResolve} loading={saving}>
                  Mark as Fixed
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Conversation</p>
              {detail.messages.map(msg => {
                const isAdmin = msg.sender === 'admin';
                const isAi = msg.sender === 'ai';
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                      isAdmin ? 'bg-primary text-white'
                      : isAi ? 'bg-surface-2 text-foreground'
                      : 'bg-surface-3 text-foreground'
                    }`}>
                      {!isAdmin && <p className={`text-[10px] font-bold mb-0.5 ${isAi ? 'text-muted' : 'text-foreground/70'}`}>{isAi ? 'AI' : 'Student'}</p>}
                      {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                      {msg.attachment && (
                        <a href={msg.attachment} target="_blank" rel="noreferrer">
                          <img src={msg.attachment} alt="attachment" className="mt-1.5 rounded-xl max-h-40 object-cover" />
                        </a>
                      )}
                      <p className={`text-[9px] mt-1 ${isAdmin ? 'text-white/60' : 'text-muted'}`}>{formatDate(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

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

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">{error}</div>
            )}
          </div>
        )}

        {detail && (
          <div className="p-4 pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={messageDraft}
                onChange={e => setMessageDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Reply to student..."
                className="flex-1 bg-surface-2 rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button variant="primary" size="sm" onClick={handleSendMessage} loading={sendingMessage} disabled={messageDraft.trim().length < 1}>
                Send
              </Button>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Close</Button>
              <Button variant="secondary" className="flex-1" onClick={handleSaveFields} loading={saving}>Save</Button>
              <Button variant="success" className="flex-1" onClick={handleResolve} loading={saving}>Resolve</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

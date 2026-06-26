'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { issuesPortalService, type PortalIssueReport, type IssueStatus } from '@/lib/api/issuesPortalService';

const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string; bg: string; dot: string }> = {
  open:          { label: 'Submitted',    color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',    dot: 'bg-blue-400'    },
  in_review:     { label: 'In Review',    color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',  dot: 'bg-amber-400'   },
  auto_resolved: { label: 'Resolved',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  resolved:      { label: 'Resolved',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  dismissed:     { label: 'Dismissed',    color: 'text-muted',       bg: 'bg-surface-2 border-border',           dot: 'bg-muted'       },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function IssuesContent() {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<PortalIssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  useEffect(() => {
    const prefill = searchParams.get('prefill');
    if (prefill) setDescription(prefill);
  }, [searchParams]);

  const load = () => {
    setError(null);
    issuesPortalService.list()
      .then(res => setReports(res.results))
      .catch((e: Error) => setError(e.message || 'Failed to load your reports'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (description.trim().length < 5) return;
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const res = await issuesPortalService.create(description.trim());
      setSubmitMessage(res.message);
      setDescription('');
      load();
    } catch (e) {
      setSubmitMessage((e as Error).message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async (id: string) => {
    setReopeningId(id);
    try {
      await issuesPortalService.reopen(id);
      load();
    } catch (e) {
      setError((e as Error).message || 'Failed to reopen report');
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Help &amp; Issues</h1>
        <p className="text-xs text-muted mt-0.5">Tell us what&apos;s wrong — we&apos;ll look into it.</p>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-border space-y-3">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What's going on? Describe it however feels natural — e.g. &quot;I don't see my attendance for last Sunday&quot;."
          rows={4}
          className="w-full bg-surface-2 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || description.trim().length < 5}
          className="w-full bg-primary text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
        {submitMessage && <p className="text-xs text-center text-muted">{submitMessage}</p>}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Your Reports</p>
        {loading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
        ) : error ? (
          <div className="glass-panel rounded-2xl p-6 border border-red-500/30 bg-red-500/5 text-center space-y-2">
            <p className="text-sm font-semibold text-red-400">Could not load reports</p>
            <p className="text-xs text-muted">{error}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <p className="text-sm text-muted">No reports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(report => {
              const cfg = STATUS_CONFIG[report.status];
              const canReopen = report.status === 'auto_resolved' || report.status === 'resolved';
              return (
                <div key={report.id} className={`rounded-2xl p-4 border ${cfg.bg} space-y-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground flex-1">{report.description}</p>
                    <span className={`flex items-center gap-1 text-[10px] font-bold shrink-0 ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted">{formatDate(report.created_at)}</p>
                  {report.admin_reply && (
                    <div className="bg-surface-1/60 rounded-xl px-3 py-2">
                      <p className="text-xs text-foreground">{report.admin_reply}</p>
                    </div>
                  )}
                  {canReopen && (
                    <button
                      onClick={() => handleReopen(report.id)}
                      disabled={reopeningId === report.id}
                      className="text-xs text-primary underline disabled:opacity-40"
                    >
                      {reopeningId === report.id ? 'Reopening…' : "This didn't solve it"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentIssuesPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background px-4 py-6 max-w-lg mx-auto"><div className="h-40 rounded-2xl bg-surface-2 animate-pulse" /></div>}>
      <IssuesContent />
    </Suspense>
  );
}

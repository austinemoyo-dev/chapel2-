'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  issuesPortalService,
  type PortalIssueSummary,
  type PortalIssueThread,
  type IssueStatus,
} from '@/lib/api/issuesPortalService';

const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string; bg: string }> = {
  open:           { label: 'Open',          color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20'    },
  awaiting_proof: { label: 'Needs info',    color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20'  },
  in_review:      { label: 'In Review',     color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20'  },
  auto_resolved:  { label: 'Resolved',      color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  resolved:       { label: 'Resolved',      color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  dismissed:      { label: 'Dismissed',     color: 'text-muted',       bg: 'bg-surface-2 border-border'           },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function IssuesContent() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'thread'>('list');
  const [tickets, setTickets] = useState<PortalIssueSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeThread, setActiveThread] = useState<PortalIssueThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftText, setDraftText] = useState('');
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefill = searchParams.get('prefill');
    if (prefill) setDraftText(prefill);
  }, [searchParams]);

  const loadList = () => {
    setError(null);
    issuesPortalService.list()
      .then(res => setTickets(res.results))
      .catch((e: Error) => setError(e.message || 'Failed to load your tickets'))
      .finally(() => setLoadingList(false));
  };

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length]);

  const openThread = async (id: string) => {
    setView('thread');
    setLoadingThread(true);
    setError(null);
    try {
      setActiveThread(await issuesPortalService.getThread(id));
    } catch (e) {
      setError((e as Error).message || 'Failed to load this ticket');
    } finally {
      setLoadingThread(false);
    }
  };

  const backToList = () => {
    setView('list');
    setActiveThread(null);
    setDraftText('');
    setDraftFile(null);
    loadList();
  };

  const handleStart = async () => {
    if (draftText.trim().length < 3) return;
    setSending(true);
    setError(null);
    try {
      const thread = await issuesPortalService.start(draftText.trim(), draftFile);
      setActiveThread(thread);
      setView('thread');
      setDraftText('');
      setDraftFile(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to submit');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!activeThread) return;
    if (draftText.trim().length < 3 && !draftFile) return;
    setSending(true);
    setError(null);
    try {
      const thread = await issuesPortalService.sendMessage(activeThread.id, draftText.trim(), draftFile);
      setActiveThread(thread);
      setDraftText('');
      setDraftFile(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const canAttach = view === 'thread' && activeThread?.status === 'awaiting_proof';

  if (view === 'thread') {
    const cfg = activeThread ? STATUS_CONFIG[activeThread.status] : null;
    return (
      <div className="min-h-dvh bg-background flex flex-col max-w-lg mx-auto">
        <div className="px-4 py-4 flex items-center gap-3 border-b border-border">
          <button onClick={backToList} className="text-muted text-sm">&larr; Back</button>
          {activeThread && cfg && (
            <div className="flex-1 flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">{activeThread.ticket_code}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingThread ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
          ) : (
            activeThread?.messages.map(msg => {
              const isStudent = msg.sender === 'student';
              const isAdmin = msg.sender === 'admin';
              return (
                <div key={msg.id} className={`flex ${isStudent ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                    isStudent ? 'bg-primary text-white'
                    : isAdmin ? 'bg-amber-500/10 border border-amber-500/20 text-foreground'
                    : 'bg-surface-2 text-foreground'
                  }`}>
                    {isAdmin && <p className="text-[10px] font-bold text-amber-400 mb-0.5">Admin</p>}
                    {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                    {msg.attachment && (
                      <img src={msg.attachment} alt="attachment" className="mt-1.5 rounded-xl max-h-40 object-cover" />
                    )}
                    <p className={`text-[9px] mt-1 ${isStudent ? 'text-white/60' : 'text-muted'}`}>{formatDate(msg.created_at)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-4 text-xs text-red-400">{error}</p>}

        <div className="px-4 py-3 border-t border-border space-y-2">
          {draftFile && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>📎 {draftFile.name}</span>
              <button onClick={() => setDraftFile(null)} className="text-red-400">Remove</button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {canAttach && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => setDraftFile(e.target.files?.[0] || null)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-9 h-9 rounded-full bg-surface-2 text-muted flex items-center justify-center"
                  title="Attach evidence photo"
                >
                  📎
                </button>
              </>
            )}
            <input
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="flex-1 bg-surface-2 rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleSend}
              disabled={sending || (draftText.trim().length < 3 && !draftFile)}
              className="shrink-0 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40"
            >
              {sending ? '…' : '➤'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Help &amp; Issues</h1>
        <p className="text-xs text-muted mt-0.5">Tell us what&apos;s wrong — we&apos;ll chat it through.</p>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-border space-y-3">
        <textarea
          value={draftText}
          onChange={e => setDraftText(e.target.value)}
          placeholder="What's going on? e.g. &quot;I don't see my attendance for last Sunday&quot;."
          rows={3}
          className="w-full bg-surface-2 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={handleStart}
          disabled={sending || draftText.trim().length < 3}
          className="w-full bg-primary text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-40"
        >
          {sending ? 'Starting…' : 'Start conversation'}
        </button>
        {error && <p className="text-xs text-center text-red-400">{error}</p>}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Your Tickets</p>
        {loadingList ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <p className="text-sm text-muted">No tickets yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(t => {
              const cfg = STATUS_CONFIG[t.status];
              return (
                <button
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={`w-full text-left rounded-2xl p-3 border ${cfg.bg} flex items-center justify-between gap-2`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">{t.ticket_code}</p>
                    <p className="text-xs text-muted truncate">{t.last_message}</p>
                  </div>
                  <span className={`text-[10px] font-bold shrink-0 ${cfg.color}`}>{cfg.label}</span>
                </button>
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

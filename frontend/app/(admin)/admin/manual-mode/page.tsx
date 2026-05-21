'use client';

import { useEffect, useState, useCallback } from 'react';
import { attendanceService } from '@/lib/api/attendanceService';

interface ProtocolMember {
  id: string;
  full_name: string;
  email: string;
  device_bound: boolean;
  allowed: boolean;
}

export default function ManualModePage() {
  const [isEnabled, setIsEnabled]       = useState(false);
  const [members, setMembers]           = useState<ProtocolMember[]>([]);
  const [allowedIds, setAllowedIds]     = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await attendanceService.getManualModeConfig();
      setIsEnabled(data.is_enabled);
      setMembers(data.protocol_members);
      setAllowedIds(new Set(data.allowed_member_ids));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleMember = (id: string) => {
    setAllowedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await attendanceService.updateManualModeConfig({
        is_enabled: isEnabled,
        allowed_member_ids: [...allowedIds],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Manual Attendance Mode</h1>
        <p className="text-sm text-muted mt-1">
          When enabled, selected protocol members can mark attendance by searching
          for students by name or matric number — no face scan required.
          Use this when the camera or network is unavailable.
        </p>
      </div>

      {/* Global toggle */}
      <div className="glass-panel rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-foreground">Manual Mode</p>
          <p className="text-xs text-muted mt-0.5">
            {isEnabled ? 'Protocol members with access can see the manual tab on the scan page.' : 'Manual tab is hidden from all protocol members.'}
          </p>
        </div>
        <button
          onClick={() => setIsEnabled((v) => !v)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0
                      ${isEnabled ? 'bg-primary' : 'bg-surface-3'}`}
          aria-label="Toggle manual mode"
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
                            ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Member selection */}
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">Who can use manual mode</p>
          <span className="text-xs text-muted bg-surface-2 px-2 py-1 rounded-lg">
            {allowedIds.size} / {members.length} selected
          </span>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No protocol members found.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const checked = allowedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150 text-left
                              ${checked
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border bg-surface-2/50 hover:bg-surface-2'}`}
                >
                  {/* Checkbox */}
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                                    ${checked ? 'border-primary bg-primary' : 'border-border bg-transparent'}`}>
                    {checked && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>

                  {/* Avatar */}
                  <span className="w-8 h-8 rounded-xl bg-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                    {m.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                    <p className="text-xs text-muted truncate">{m.email}</p>
                  </div>

                  {/* Device status */}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0
                                    ${m.device_bound ? 'bg-success-muted text-success' : 'bg-surface-3 text-muted'}`}>
                    {m.device_bound ? 'Device bound' : 'No device'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-2xl font-semibold text-sm transition-all duration-200
                   bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
      </button>
    </div>
  );
}

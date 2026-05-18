'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminService } from '@/lib/api/adminService';
import { useToast } from '@/providers/ToastProvider';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';

interface StudentAccountRow {
  id: string;
  full_name: string;
  system_id: string;
  phone_number: string;
  matric_number: string | null;
  student_type: string;
  service_group: string;
  face_registered: boolean;
  is_active: boolean;
  has_portal_account: boolean;
  portal_active: boolean;
  last_login: string | null;
  account_created_at: string | null;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function StudentAccountsPage() {
  const { addToast } = useToast();
  const [students, setStudents] = useState<StudentAccountRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'active' | 'inactive' | 'no_account'>('all');

  const [resetTarget, setResetTarget] = useState<StudentAccountRow | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetting, setResetting]       = useState(false);
  const [generatedPw, setGeneratedPw]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminService.getStudentAccounts(search || undefined);
      setStudents(data.students);
    } catch { addToast('Failed to load student accounts', 'error'); }
    finally { setLoading(false); }
  }, [search, addToast]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(student: StudentAccountRow) {
    try {
      const res = await adminService.toggleStudentAccount(student.id);
      setStudents(prev => prev.map(s =>
        s.id === student.id ? { ...s, portal_active: !s.portal_active } : s
      ));
      addToast(res.message, 'success');
    } catch { addToast('Failed to update portal access', 'error'); }
  }

  async function handleReset() {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await adminService.resetStudentAccountPassword(resetTarget.id, tempPassword || undefined);
      setGeneratedPw(res.temp_password);
      addToast(`Password reset for ${resetTarget.full_name}`, 'success');
    } catch { addToast('Failed to reset password', 'error'); }
    finally { setResetting(false); }
  }

  const filtered = students.filter(s => {
    if (filter === 'active')     return s.has_portal_account && s.portal_active;
    if (filter === 'inactive')   return s.has_portal_account && !s.portal_active;
    if (filter === 'no_account') return !s.has_portal_account;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Student Portal Accounts</h1>
        <p className="text-sm text-muted mt-0.5">Manage student portal access and reset passwords</p>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 h-11 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Search by name, phone, or matric..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          {(['all', 'active', 'inactive', 'no_account'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-surface-2 text-muted'}`}>
              {f === 'no_account' ? 'No Account' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(student => (
            <Card key={student.id} variant="glass" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {student.full_name.split(' ').slice(0,2).map(w => w[0]).join('')}
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{student.full_name}</p>
                  <p className="text-xs text-muted">{student.system_id} · {student.phone_number}{student.matric_number ? ` · ${student.matric_number}` : ''}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={student.service_group === 'S1' ? 'info' : student.service_group === 'S2' ? 'success' : 'warning'}>
                      {student.service_group}
                    </Badge>
                    {!student.face_registered && <Badge variant="danger">No face</Badge>}
                    {!student.has_portal_account && <Badge variant="info">No account</Badge>}
                    {student.has_portal_account && (
                      <Badge variant={student.portal_active ? 'success' : 'danger'}>
                        Portal {student.portal_active ? 'active' : 'inactive'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {student.last_login && (
                  <p className="text-xs text-muted">Last: {timeAgo(student.last_login)}</p>
                )}
                <Button variant="secondary" size="sm" onClick={() => { setResetTarget(student); setTempPassword(''); setGeneratedPw(null); }}>
                  Reset Password
                </Button>
                {student.has_portal_account && (
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(student)}>
                    {student.portal_active ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card variant="glass" className="text-center py-12">
              <p className="text-muted text-sm">No students found</p>
            </Card>
          )}
        </div>
      )}

      {/* Reset password modal */}
      <Modal open={!!resetTarget} onClose={() => { setResetTarget(null); setGeneratedPw(null); }} title="Reset Portal Password">
        {resetTarget && !generatedPw && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Reset portal password for <strong className="text-foreground">{resetTarget.full_name}</strong>.
              Leave blank to auto-generate a secure temporary password.
            </p>
            <input
              className="w-full h-11 px-4 rounded-xl bg-surface-2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Custom password (optional, min 6 chars)"
              type="text"
              value={tempPassword}
              onChange={e => setTempPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleReset} disabled={resetting}>
                {resetting ? 'Resetting...' : 'Reset Password'}
              </Button>
              <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
            </div>
          </div>
        )}
        {generatedPw && (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
              <p className="text-xs text-muted mb-2">Temporary password for {resetTarget?.full_name}</p>
              <p className="text-2xl font-bold font-mono text-emerald-400 tracking-widest">{generatedPw}</p>
            </div>
            <p className="text-xs text-muted text-center">Share this with the student. They should change it after logging in.</p>
            <Button className="w-full" onClick={() => { setResetTarget(null); setGeneratedPw(null); }}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

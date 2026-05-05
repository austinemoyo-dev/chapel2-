'use client';

import { useState } from 'react';
import { adminService, type AttendanceRecord } from '@/lib/api/adminService';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CorrectionsPage() {
  const [searchId, setSearchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState('');
  const [studentName, setStudentName] = useState('');

  // Edit modal state
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ is_valid: true, signed_in_at: '', signed_out_at: '', reason_note: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  const handleSearch = async () => {
    if (!searchId.trim()) return;
    setLoading(true);
    setError('');
    setRecords([]);

    try {
      // First find the student
      const studentsRes = await adminService.listStudents({ search: searchId.trim() });
      const students = studentsRes.results || [];
      if (students.length === 0) {
        setError('No student found.');
        setLoading(false);
        return;
      }
      const student = students[0];
      setStudentName(student.full_name);

      // Then fetch their attendance
      const attendanceRes = await adminService.getStudentAttendance(student.id);
      const recs = attendanceRes.results || [];
      setRecords(recs);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to fetch records.');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (record: AttendanceRecord) => {
    setEditing(record);
    setEditForm({
      is_valid: record.is_valid,
      signed_in_at: record.signed_in_at,
      signed_out_at: record.signed_out_at || '',
      reason_note: '',
    });
    setSaveError('');
    setSaveSuccess('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (editForm.reason_note.length < 10) {
      setSaveError('Reason must be at least 10 characters.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await adminService.editAttendance(editing.id, {
        is_valid: editForm.is_valid,
        signed_in_at: editForm.signed_in_at,
        signed_out_at: editForm.signed_out_at || null,
        reason_note: editForm.reason_note,
      });
      setSaveSuccess('Record updated successfully.');
      // Refresh records
      const student = (await adminService.listStudents({ search: searchId.trim() })).results?.[0];
      if (student) {
        const attendanceRes = await adminService.getStudentAttendance(student.id);
        setRecords(attendanceRes.results || []);
      }
      setTimeout(() => setEditing(null), 1500);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Attendance Corrections</h1>
        <p className="text-sm text-muted mt-0.5">Search for a student to view and edit their attendance records</p>
      </div>

      {/* Search */}
      <Card variant="glass">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              id="corrections-search"
              placeholder="Search by name, matric number, or phone..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button variant="primary" onClick={handleSearch} loading={loading} disabled={!searchId.trim()}>
            Search
          </Button>
        </div>
      </Card>

      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
          {error}
        </div>
      )}

      {/* Results */}
      {records.length > 0 && (
        <Card variant="glass">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground">{studentName}</h2>
            <span className="text-xs text-muted">{records.length} records</span>
          </div>

          <div className="space-y-2">
            {records.map(record => (
              <div
                key={record.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border/50
                           hover:border-border transition-colors cursor-pointer"
                onClick={() => openEdit(record)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {record.service_info?.service_type} {record.service_info?.service_group}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted">{formatDate(record.service_info?.scheduled_date)}</span>
                    <span className="text-xs text-muted/40">·</span>
                    <span className="text-xs text-muted">
                      In: {formatTime(record.signed_in_at)}
                      {record.signed_out_at && ` → Out: ${formatTime(record.signed_out_at)}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {record.is_backdated && <Badge variant="warning">Backdated</Badge>}
                  {record.is_offline_record && <Badge variant="info">Offline</Badge>}
                  <Badge variant={record.is_valid ? 'success' : 'danger'}>
                    {record.is_valid ? 'Valid' : 'Invalid'}
                  </Badge>
                </div>
                <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card variant="glass" className="w-full max-w-md space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Edit Record</h3>
              <button onClick={() => setEditing(null)} className="text-muted hover:text-foreground transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-3 rounded-xl bg-surface-2 text-sm">
              <p className="font-semibold">{editing.service_info?.service_type} {editing.service_info?.service_group}</p>
              <p className="text-xs text-muted">{formatDate(editing.service_info?.scheduled_date)}</p>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">Valid:</label>
              <button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  editForm.is_valid ? 'bg-success/20 text-success border border-success/30' : 'bg-surface-2 text-muted'
                }`}
                onClick={() => setEditForm(f => ({ ...f, is_valid: true }))}
              >Yes</button>
              <button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  !editForm.is_valid ? 'bg-danger/20 text-danger border border-danger/30' : 'bg-surface-2 text-muted'
                }`}
                onClick={() => setEditForm(f => ({ ...f, is_valid: false }))}
              >No</button>
            </div>

            <Input
              id="edit-signin"
              label="Signed In At"
              type="datetime-local"
              value={editForm.signed_in_at?.slice(0, 16) || ''}
              onChange={(e) => setEditForm(f => ({ ...f, signed_in_at: e.target.value }))}
            />

            <Input
              id="edit-signout"
              label="Signed Out At"
              type="datetime-local"
              value={editForm.signed_out_at?.slice(0, 16) || ''}
              onChange={(e) => setEditForm(f => ({ ...f, signed_out_at: e.target.value }))}
            />

            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Reason for Edit <span className="text-danger">*</span>
              </label>
              <textarea
                className="w-full h-24 px-4 py-3 rounded-xl bg-surface-2 border border-border text-sm text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Explain why this record needs to be corrected (min 10 chars)..."
                value={editForm.reason_note}
                onChange={(e) => setEditForm(f => ({ ...f, reason_note: e.target.value }))}
              />
            </div>

            {saveError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">{saveError}</div>
            )}
            {saveSuccess && (
              <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-success text-xs">{saveSuccess}</div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave} loading={saving}
                      disabled={editForm.reason_note.length < 10}>
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

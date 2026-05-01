'use client';

import { useState, useEffect } from 'react';
import { adminService } from '@/lib/api/adminService';
import { type Student } from '@/lib/api/registrationService';
import { useToast } from '@/providers/ToastProvider';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

function renderConflict(details: Record<string, unknown> | undefined) {
  if (!details) return <p className="text-xs text-muted">No conflict details returned by the backend.</p>;

  const entries = Object.entries(details);
  if (entries.length === 0) return <p className="text-xs text-muted">No conflict details returned by the backend.</p>;

  return (
    <div className="grid gap-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg bg-surface-2 border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{key.replace(/_/g, ' ')}</p>
          <p className="text-sm mt-1 break-words">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function DuplicatesPage() {
  const { addToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    adminService.listStudents({ duplicate_flag: 'true' })
      .then((data) => setStudents(data.results || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleResolve(studentId: string, action: 'approve' | 'reject' | 'merge') {
    const reason_note = notes[studentId]?.trim() || '';
    if (reason_note.length < 5) {
      addToast('Enter a short resolution note first', 'warning');
      return;
    }

    try {
      await adminService.resolveDuplicate({ student_id: studentId, action, reason_note });
      setStudents((prev) => prev.filter((student) => student.id !== studentId));
      addToast(`Duplicate ${action} saved`, 'success');
    } catch {
      addToast('Failed to resolve duplicate', 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Duplicate Flags</h1>
        <p className="text-sm text-muted">{students.length} pending review</p>
      </div>

      {students.length === 0 ? (
        <p className="text-center py-10 text-muted">No duplicate flags pending</p>
      ) : (
        <div className="space-y-3">
          {students.map((student) => (
            <Card key={student.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{student.full_name}</p>
                    <Badge variant="danger">Flagged</Badge>
                  </div>
                  <p className="text-xs text-muted mt-1">{student.phone_number} · {student.matric_number || student.system_id}</p>
                  <p className="text-xs text-muted">{student.department} · {student.level} · {student.service_group || 'Unassigned'}</p>
                </div>
                <a href={`/admin/students/${student.id}`} className="text-sm text-primary">Open profile</a>
              </div>

              {renderConflict(student.duplicate_details || student.duplicate_results || undefined)}

              <div className="mt-4 space-y-3">
                <Input
                  id={`dup-note-${student.id}`}
                  label="Resolution Note"
                  value={notes[student.id] || ''}
                  onChange={(e) => setNotes((current) => ({ ...current, [student.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" size="sm" onClick={() => void handleResolve(student.id, 'approve')}>Approve</Button>
                  <Button variant="secondary" size="sm" onClick={() => void handleResolve(student.id, 'merge')}>Mark Merged</Button>
                  <Button variant="danger" size="sm" onClick={() => void handleResolve(student.id, 'reject')}>Reject</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { adminService } from '@/lib/api/adminService';
import { registrationService, type Student } from '@/lib/api/registrationService';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  ADMIN_PERMISSIONS,
  GENDERS,
  LEVELS,
  ROLES,
  STUDENT_TYPES,
} from '@/lib/utils/constants';
import { toTitleCase } from '@/lib/utils/formatters';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';

export default function StudentsPage() {
  const { hasRole, hasPermission } = useAuth();
  const { addToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    student_type: STUDENT_TYPES.OLD as 'old' | 'new',
    full_name: '',
    phone_number: '',
    matric_number: '',
    department: '',
    level: '',
    gender: '',
  });

  const canAdd = hasRole(ROLES.SUPERADMIN) || hasPermission(ADMIN_PERMISSIONS.ADD_STUDENTS);

  useEffect(() => {
    let cancelled = false;
    adminService.listStudents(search ? { search } : undefined)
      .then((data) => {
        if (cancelled) return;
        setStudents(data.results || []);
        setTotal(data.count || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  async function handleAddStudent() {
    if (!form.full_name || !form.phone_number || !form.department || !form.level || !form.gender) {
      addToast('Fill all required student fields', 'warning');
      return;
    }
    if (form.student_type === STUDENT_TYPES.OLD && !form.matric_number) {
      addToast('Matric number is required for old students', 'warning');
      return;
    }

    setAdding(true);
    try {
      const created = await registrationService.registerStudent({
        student_type: form.student_type,
        full_name: toTitleCase(form.full_name),
        phone_number: form.phone_number.trim(),
        matric_number: form.student_type === STUDENT_TYPES.OLD ? form.matric_number.trim().toUpperCase() : undefined,
        department: form.department.trim(),
        level: form.level as typeof LEVELS[number],
        gender: form.gender as typeof GENDERS[number],
        semester: '',
      });

      setStudents((current) => [created, ...current]);
      setTotal((current) => current + 1);
      setShowAdd(false);
      setForm({
        student_type: STUDENT_TYPES.OLD,
        full_name: '',
        phone_number: '',
        matric_number: '',
        department: '',
        level: '',
        gender: '',
      });
      addToast('Student added. Continue with face capture.', 'success');
      window.location.href = `/registration/face-capture?student=${created.id}`;
    } catch {
      addToast('Failed to add student', 'error');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Students</h1>
          <p className="text-sm text-muted">{total} total students</p>
        </div>
        {canAdd && <Button onClick={() => setShowAdd(true)}>Add Student</Button>}
      </div>

      <Input
        id="student-search"
        placeholder="Search by name, matric, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
      />

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-2">
          {students.map((student) => (
            <a
              key={student.id}
              href={`/admin/students/${student.id}`}
              className="block p-4 rounded-xl bg-surface border border-border hover:border-border-light transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{student.full_name}</p>
                  <p className="text-xs text-muted">{student.matric_number || student.system_id} · {student.department}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={student.is_active ? 'success' : 'warning'}>
                    {student.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {student.duplicate_flag && <Badge variant="danger">Duplicate</Badge>}
                </div>
              </div>
            </a>
          ))}
          {students.length === 0 && (
            <p className="text-center py-10 text-muted">No students found</p>
          )}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Student">
        <div className="space-y-4">
          <Select
            id="add-student-type"
            label="Student Type"
            options={[
              { value: STUDENT_TYPES.OLD, label: 'Old Student' },
              { value: STUDENT_TYPES.NEW, label: 'New Student' },
            ]}
            value={form.student_type}
            onChange={(e) => setForm((current) => ({ ...current, student_type: e.target.value as 'old' | 'new' }))}
          />
          <Input id="add-name" label="Full Name" value={form.full_name} onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))} onBlur={(e) => setForm((current) => ({ ...current, full_name: toTitleCase(e.target.value) }))} />
          <Input id="add-phone" label="Phone Number" value={form.phone_number} onChange={(e) => setForm((current) => ({ ...current, phone_number: e.target.value }))} />
          {form.student_type === STUDENT_TYPES.OLD && (
            <Input id="add-matric" label="Matric Number" value={form.matric_number} onChange={(e) => setForm((current) => ({ ...current, matric_number: e.target.value }))} />
          )}
          <Input id="add-department" label="Department" value={form.department} onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select id="add-level" label="Level" options={LEVELS.map((level) => ({ value: level, label: `${level} Level` }))} value={form.level} onChange={(e) => setForm((current) => ({ ...current, level: e.target.value }))} />
            <Select id="add-gender" label="Gender" options={GENDERS.map((gender) => ({ value: gender, label: gender.charAt(0).toUpperCase() + gender.slice(1) }))} value={form.gender} onChange={(e) => setForm((current) => ({ ...current, gender: e.target.value }))} />
          </div>
          <Button className="w-full" loading={adding} onClick={() => void handleAddStudent()}>Add Student</Button>
        </div>
      </Modal>
    </div>
  );
}

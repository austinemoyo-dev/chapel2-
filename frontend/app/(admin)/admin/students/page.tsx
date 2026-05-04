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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getProfilePhotoUrl(photo: string | null | undefined) {
  if (!photo) return '';
  if (photo.startsWith('http')) return photo;
  if (photo.startsWith('/')) return `${API_URL}${photo}`;
  return `${API_URL}/media/${photo}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const FACULTIES_AND_DEPARTMENTS: Record<string, string[]> = {
  "FACULTY OF BASIC AND APPLIED SCIENCES": [
    "Biotechnology",
    "Microbiology",
    "Industrial Chemistry",
    "Computer Science",
    "Cyber Security",
    "Mathematics",
    "Physics with Electronics"
  ],
  "FACULTY OF HUMANITIES, MANAGEMENT AND SOCIAL SCIENCES": [
    "Accounting",
    "Entrepreneurship",
    "Business Administration",
    "Economics",
    "History and International Relations",
    "English",
    "Mass Communication",
    "Criminology and Security Studies"
  ],
  "FACULTY OF BASIC AND MEDICAL SCIENCES": [
    "Nursing",
    "Medical Laboratory Science",
    "Public Health"
  ]
};

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
    faculty: '',
    department: '',
    level: '',
    gender: '',
  });

  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const canAdd = hasRole(ROLES.SUPERADMIN) || hasPermission(ADMIN_PERMISSIONS.ADD_STUDENTS);

  useEffect(() => {
    let cancelled = false;
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter === 'active') params.is_active = 'true';
    if (statusFilter === 'inactive') params.is_active = 'false';
    if (levelFilter) params.level = levelFilter;
    if (facultyFilter) params.faculty = facultyFilter;
    if (departmentFilter) params.department = departmentFilter;

    adminService.listStudents(Object.keys(params).length > 0 ? params : undefined)
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
  }, [search, statusFilter, levelFilter, facultyFilter, departmentFilter]);

  async function handleAddStudent() {
    if (!form.full_name || !form.phone_number || !form.faculty || !form.department || !form.level || !form.gender) {
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
        faculty: form.faculty,
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
        faculty: '',
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

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              id="student-search"
              placeholder="Search by name, matric, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
            />
          </div>
          <Button variant={showFilters ? 'primary' : 'secondary'} className="px-4 shrink-0" onClick={() => setShowFilters(!showFilters)}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </Button>
        </div>

        {showFilters && (
          <div className="glass-panel p-4 rounded-xl border border-border animate-slide-up-fade grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Select
              id="filter-status"
              label="Status"
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' }
              ]}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
            <Select
              id="filter-level"
              label="Level"
              options={[
                { value: '', label: 'All Levels' },
                ...LEVELS.map(l => ({ value: l, label: `${l} Level` }))
              ]}
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            />
            <Select
              id="filter-faculty"
              label="Faculty"
              options={[
                { value: '', label: 'All Faculties' },
                ...Object.keys(FACULTIES_AND_DEPARTMENTS).map(f => ({ value: f, label: toTitleCase(f) }))
              ]}
              value={facultyFilter}
              onChange={(e) => {
                setFacultyFilter(e.target.value);
                setDepartmentFilter('');
              }}
            />
            <Select
              id="filter-department"
              label="Department"
              options={[
                { value: '', label: 'All Departments' },
                ...(facultyFilter ? FACULTIES_AND_DEPARTMENTS[facultyFilter] : []).map(d => ({ value: d, label: d }))
              ]}
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className={!facultyFilter ? "opacity-50 pointer-events-none" : ""}
            />
            
            <div className="md:col-span-4 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => {
                setSearch(''); setStatusFilter('all'); setLevelFilter(''); setFacultyFilter(''); setDepartmentFilter('');
              }}>Clear Filters</Button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {students.map((student) => {
            const photoUrl = getProfilePhotoUrl(student.profile_photo);
            return (
              <a
                key={student.id}
                href={`/admin/students/${student.id}`}
                className="group relative block p-5 rounded-3xl glass-card card-lift border border-white/40 hover:border-primary/40 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="relative flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="h-16 w-16 rounded-full border-2 border-surface bg-surface-2 overflow-hidden shadow-sm flex items-center justify-center shrink-0">
                      {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-muted">{initials(student.full_name) || 'ST'}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={student.is_active ? 'success' : 'warning'} className="text-[10px] px-1.5 py-0">
                        {student.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {student.duplicate_flag && (
                        <Badge variant="danger" className="text-[10px] px-1.5 py-0">Duplicate</Badge>
                      )}
                      {!student.face_registered && (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0">No Face</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-bold text-foreground leading-tight group-hover:text-primary transition-colors line-clamp-1" title={student.full_name}>
                      {student.full_name}
                    </p>
                    <p className="text-xs font-medium text-muted mt-1">{student.matric_number || student.system_id}</p>
                    <p className="text-xs text-muted/80 mt-1 line-clamp-1" title={student.department}>
                      {student.level ? `${student.level} Lvl · ` : ''}{student.department}
                    </p>
                  </div>
                </div>
              </a>
            );
          })}
          {students.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-2 mb-4">
                <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-foreground">No students found</p>
              <p className="text-sm text-muted mt-1">Try adjusting your filters or search query.</p>
            </div>
          )}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Student" className="glass-panel backdrop-blur-md">
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
          <Select 
            id="add-faculty" 
            label="Faculty" 
            options={Object.keys(FACULTIES_AND_DEPARTMENTS).map(f => ({ value: f, label: f }))} 
            value={form.faculty} 
            onChange={(e) => setForm((current) => ({ ...current, faculty: e.target.value, department: '' }))} 
          />
          <Select 
            id="add-department" 
            label="Department" 
            options={(form.faculty ? FACULTIES_AND_DEPARTMENTS[form.faculty] : []).map(d => ({ value: d, label: d }))} 
            value={form.department} 
            onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))} 
            disabled={!form.faculty}
          />
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

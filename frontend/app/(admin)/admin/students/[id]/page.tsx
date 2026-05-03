'use client';

import { useState, useEffect, use } from 'react';
import { adminService } from '@/lib/api/adminService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import { type Student } from '@/lib/api/registrationService';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  ADMIN_PERMISSIONS,
  GENDERS,
  LEVELS,
  ROLES,
  SERVICE_GROUPS,
} from '@/lib/utils/constants';
import { formatDateTime } from '@/lib/utils/formatters';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
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

function ProfileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl glass-card border border-border/50 p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 text-sm font-medium break-words text-foreground">{value || 'None'}</div>
    </div>
  );
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasRole, hasPermission } = useAuth();
  const { addToast } = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBackdate, setShowBackdate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matricLink, setMatricLink] = useState<{
    token: string;
    system_id: string;
    expires_in_hours: number;
  } | null>(null);
  const [form, setForm] = useState<Partial<Student>>({});
  const [backdateForm, setBackdateForm] = useState({
    service_ids: [] as string[],
    backdate_type: 'valid' as 'valid' | 'excused',
    reason_note: '',
  });

  useEffect(() => {
    Promise.all([
      adminService.getStudent(id),
      serviceService.listServices({ is_cancelled: 'false' }),
    ]).then(([studentData, serviceData]) => {
      const list = Array.isArray(serviceData) ? serviceData : serviceData.results || [];
      setStudent(studentData);
      setForm(studentData);
      setServices(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const canEdit = hasRole(ROLES.SUPERADMIN) || hasPermission(ADMIN_PERMISSIONS.EDIT_STUDENTS);

  async function handleDelete() {
    setDeleting(true);
    try {
      await adminService.deleteStudent(id);
      addToast('Student deleted', 'success');
      window.location.href = '/admin/students';
    } catch {
      addToast('Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<Student> = {
        full_name: form.full_name,
        phone_number: form.phone_number,
        department: form.department,
        level: form.level,
        gender: form.gender,
        service_group: form.service_group,
      };
      const updated = await adminService.updateStudent(id, payload);
      setStudent(updated);
      setForm(updated);
      setShowEdit(false);
      addToast('Student updated', 'success');
    } catch {
      addToast('Update failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleMatricLink() {
    try {
      const link = await adminService.generateMatricLink(id);
      setMatricLink(link);
      addToast('Matric update link generated', 'success');
    } catch {
      addToast('Failed to generate link', 'error');
    }
  }

  async function handleManualCheckIn(serviceId: string) {
    try {
      await adminService.backdateAttendance({
        student_id: id,
        service_ids: [serviceId],
        backdate_type: 'valid',
        reason_note: 'Manual Admin Check-in (Device Override)',
      });
      addToast('Student manually checked in', 'success');
    } catch {
      addToast('Failed to check in manually', 'error');
    }
  }

  async function handleBackdate() {
    if (backdateForm.service_ids.length === 0 || backdateForm.reason_note.trim().length < 10) {
      addToast('Select services and enter a reason of at least 10 characters', 'warning');
      return;
    }
    try {
      await adminService.backdateAttendance({
        student_id: id,
        service_ids: backdateForm.service_ids,
        backdate_type: backdateForm.backdate_type,
        reason_note: backdateForm.reason_note.trim(),
      });
      setShowBackdate(false);
      setBackdateForm({ service_ids: [], backdate_type: 'valid', reason_note: '' });
      addToast('Backdating saved', 'success');
    } catch {
      addToast('Backdating failed', 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!student) return <p className="text-center py-20 text-muted">Student not found</p>;

  const photoUrl = getProfilePhotoUrl(student.profile_photo);
  const now = new Date().toISOString();
  const liveServices = services.filter((s) => s.window_open_time <= now && s.window_close_time >= now);

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <section className="overflow-hidden rounded-[2rem] glass-panel border border-white/40 shadow-[var(--shadow-premium)]">
        <div className="h-36 sm:h-44 bg-mesh-purple" />
        <div className="px-5 sm:px-8 pb-6">
          <div className="-mt-16 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="h-32 w-32 rounded-2xl border-4 border-surface bg-surface-2 overflow-hidden shadow-xl flex items-center justify-center">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt={`${student.full_name} profile photo`} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-muted">{initials(student.full_name) || 'ST'}</span>
                )}
              </div>
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant={student.is_active ? 'success' : 'warning'}>{student.is_active ? 'Active' : 'Inactive'}</Badge>
                  <Badge variant={student.face_registered ? 'success' : 'warning'}>{student.face_registered ? 'Face Registered' : 'Face Pending'}</Badge>
                  {student.duplicate_flag && <Badge variant="danger">Duplicate Review</Badge>}
                  <Badge variant="info">{student.student_type === 'old' ? 'Old Student' : 'New Student'}</Badge>
                </div>
                <h1 className="text-3xl font-bold">{student.full_name}</h1>
                <p className="text-sm text-muted mt-1">{student.matric_number || student.system_id}</p>
                <p className="text-sm text-muted">{student.department} · {student.level} Level · {student.service_group || 'No service group'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => window.location.href = `/registration/face-capture?student=${student.id}&semester=${student.semester}`}>Assist Capture</Button>
              {liveServices.length > 0 && (
                <Button variant="success" size="sm" onClick={() => void handleManualCheckIn(liveServices[0].id)}>Manual Check-in</Button>
              )}
              {canEdit && <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>Edit Profile</Button>}
              {hasRole(ROLES.SUPERADMIN) && student.student_type === 'new' && (
                <Button variant="secondary" size="sm" onClick={() => void handleMatricLink()}>Matric Link</Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {matricLink && (
        <Card className="border-success/40">
          <p className="text-sm font-medium text-success">Matric update link</p>
          <p className="text-xs text-muted mt-1">System ID: {matricLink.system_id}</p>
          <p className="text-xs text-muted mt-1 break-all">Token: {matricLink.token}</p>
          <p className="text-xs text-muted mt-1">Expires in {matricLink.expires_in_hours} hours</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-6">
        <div className="space-y-6">
          <Card variant="glass">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Student Information</h2>
              <Badge variant={student.service_group ? 'info' : 'warning'}>{student.service_group || 'Unassigned'}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProfileField label="Full Name" value={student.full_name} />
              <ProfileField label="Phone Number" value={student.phone_number} />
              <ProfileField label="Matric Number" value={student.matric_number || 'Not assigned'} />
              <ProfileField label="System ID" value={student.system_id} />
              <ProfileField label="Department" value={student.department} />
              <ProfileField label="Level" value={`${student.level} Level`} />
              <ProfileField label="Gender" value={<span className="capitalize">{student.gender}</span>} />
              <ProfileField label="Student Type" value={<span className="capitalize">{student.student_type}</span>} />
            </div>
          </Card>

          <Card variant="glass">
            <h2 className="text-lg font-semibold mb-4">Registration & Verification</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl glass-card border border-border/50 p-4">
                <p className="text-xs text-muted">Account Status</p>
                <p className={`text-lg font-bold mt-1 ${student.is_active ? 'text-success' : 'text-warning'}`}>
                  {student.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>
              <div className="rounded-xl glass-card border border-border/50 p-4">
                <p className="text-xs text-muted">Face Samples</p>
                <p className={`text-lg font-bold mt-1 ${student.face_registered ? 'text-success' : 'text-warning'}`}>
                  {student.approved_face_samples ?? 0}/5
                </p>
              </div>
              <div className="rounded-xl glass-card border border-border/50 p-4">
                <p className="text-xs text-muted">Duplicate Flag</p>
                <p className={`text-lg font-bold mt-1 ${student.duplicate_flag ? 'text-danger' : 'text-success'}`}>
                  {student.duplicate_flag ? 'Needs Review' : 'Clear'}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProfileField label="Semester" value={student.semester_name || student.semester} />
              <ProfileField label="Registered" value={formatDateTime(student.created_at)} />
            </div>
          </Card>

          <Card variant="glass">
            <h2 className="text-lg font-semibold mb-2">Attendance History</h2>
            <p className="text-sm text-muted">
              A student-scoped attendance endpoint is needed to render complete history here without over-fetching every service.
            </p>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card variant="glass">
            <h2 className="text-lg font-semibold mb-4">Profile Photo</h2>
            <div className="aspect-square rounded-2xl overflow-hidden bg-surface-2 border border-border flex items-center justify-center">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={`${student.full_name} profile photo`} className="h-full w-full object-cover" />
              ) : (
                <div className="text-center">
                  <div className="mx-auto h-24 w-24 rounded-full bg-surface-3 flex items-center justify-center text-3xl font-bold text-muted">
                    {initials(student.full_name) || 'ST'}
                  </div>
                  <p className="text-sm text-muted mt-3">No profile photo uploaded</p>
                </div>
              )}
            </div>
          </Card>

          <Card variant="glass">
            <h2 className="text-lg font-semibold mb-4">Service Assignment</h2>
            <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5 text-center">
              <p className="text-xs text-muted">Current Group</p>
              <p className="text-4xl font-bold text-primary mt-1">{student.service_group || 'None'}</p>
              <p className="text-xs text-muted mt-2">Applies to both midweek and Sunday services.</p>
            </div>
          </Card>

          <Card variant="glass">
            <h2 className="text-lg font-semibold mb-4">Quick Facts</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted">Student ID</span><span className="text-right break-all">{student.id}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted">Created By</span><span>{student.created_by || 'Self registration'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted">Photo</span><span>{photoUrl ? 'Uploaded' : 'Missing'}</span></div>
            </div>
          </Card>
        </aside>
      </div>

      {/* Advanced Operations / Danger Zone */}
      {(hasRole(ROLES.SUPERADMIN) || canEdit) && (
        <Card className="mt-8 border-danger/20 bg-danger/5">
          <h2 className="text-lg font-bold text-danger mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Advanced Operations
          </h2>
          <p className="text-sm text-danger/80 mb-5">
            These actions can modify critical records or permanently delete data.
          </p>
          <div className="flex flex-wrap gap-3">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                Change Service Group
              </Button>
            )}
            {hasRole(ROLES.SUPERADMIN) && (
              <Button variant="outline" size="sm" onClick={() => setShowBackdate(true)}>
                Backdate Attendance
              </Button>
            )}
            {hasRole(ROLES.SUPERADMIN) && (
              <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
                Delete Student Profile
              </Button>
            )}
          </div>
        </Card>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Student" className="glass-panel backdrop-blur-md">
        <div className="space-y-4">
          <Input id="edit-name" label="Full Name" value={form.full_name || ''} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          <Input id="edit-phone" label="Phone" value={form.phone_number || ''} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
          <Input id="edit-dept" label="Department" value={form.department || ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select id="edit-level" label="Level" options={LEVELS.map((level) => ({ value: level, label: `${level} Level` }))} value={form.level || ''} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as typeof LEVELS[number] }))} />
            <Select id="edit-gender" label="Gender" options={GENDERS.map((gender) => ({ value: gender, label: gender.charAt(0).toUpperCase() + gender.slice(1) }))} value={form.gender || ''} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as typeof GENDERS[number] }))} />
          </div>
          {(hasRole(ROLES.SUPERADMIN) || hasPermission(ADMIN_PERMISSIONS.CHANGE_SERVICE_ASSIGNMENT)) && (
            <Select
              id="edit-service-group"
              label="Service Group"
              options={Object.values(SERVICE_GROUPS).filter((group) => group !== 'all').map((group) => ({ value: group, label: group }))}
              value={form.service_group || ''}
              onChange={(e) => setForm((f) => ({ ...f, service_group: e.target.value }))}
            />
          )}
          <Button onClick={() => void handleSave()} loading={saving} className="w-full">Save Changes</Button>
        </div>
      </Modal>

      <Modal open={showBackdate} onClose={() => setShowBackdate(false)} title="Late Resumption Backdating" className="glass-panel backdrop-blur-md">
        <div className="space-y-4">
          <Select
            id="backdate-type"
            label="Backdate Type"
            options={[
              { value: 'valid', label: 'Valid - counts as attended' },
              { value: 'excused', label: 'Excused - removed from required total' },
            ]}
            value={backdateForm.backdate_type}
            onChange={(e) => setBackdateForm((f) => ({ ...f, backdate_type: e.target.value as 'valid' | 'excused' }))}
          />
          <div className="rounded-xl border border-border bg-surface-2 p-3 max-h-56 overflow-auto space-y-2">
            {services.map((service) => (
              <label key={service.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={backdateForm.service_ids.includes(service.id)}
                  onChange={(e) => setBackdateForm((f) => ({
                    ...f,
                    service_ids: e.target.checked
                      ? [...f.service_ids, service.id]
                      : f.service_ids.filter((id) => id !== service.id),
                  }))}
                />
                {service.name || `${service.service_type} ${service.service_group}`} ({service.scheduled_date})
              </label>
            ))}
          </div>
          <Input id="backdate-reason" label="Reason Note" value={backdateForm.reason_note} onChange={(e) => setBackdateForm((f) => ({ ...f, reason_note: e.target.value }))} />
          <Button onClick={() => void handleBackdate()} className="w-full">Save Backdating</Button>
        </div>
      </Modal>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Student" className="glass-panel backdrop-blur-md">
        <p className="text-sm text-muted mb-4">
          This will permanently delete <strong>{student.full_name}</strong> and all their records. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowDelete(false)}>Cancel</Button>
          <Button variant="danger" className="flex-1" loading={deleting} onClick={() => void handleDelete()}>Delete Permanently</Button>
        </div>
      </Modal>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  serviceService,
  type Service,
  type CreateServiceRequest,
  type Semester,
  type GroupStat,
} from '@/lib/api/serviceService';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { ROLES, SERVICE_TYPES, SERVICE_GROUPS } from '@/lib/utils/constants';
import { formatDate, formatTime } from '@/lib/utils/formatters';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import MultiDateCalendar from '@/components/ui/MultiDateCalendar';

// ============================================================================
// Tab type
// ============================================================================

type Tab = 'groups' | 'schedule';

const GROUP_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  S1: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', glow: 'shadow-[0_0_20px_rgba(99,102,241,0.15)]' },
  S2: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]' },
  S3: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]' },
};

const GROUP_ICONS: Record<string, string> = { S1: '1️⃣', S2: '2️⃣', S3: '3️⃣' };
const GROUP_ACCENT: Record<string, 'indigo' | 'emerald' | 'amber'> = { S1: 'indigo', S2: 'emerald', S3: 'amber' };

// ============================================================================
// Datetime helpers
// ============================================================================

/**
 * Convert a UTC ISO string (from the backend) to a value suitable for
 * <input type="datetime-local"> — which expects LOCAL time in YYYY-MM-DDTHH:MM.
 */
function toLocalDT(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Convert a datetime-local string (LOCAL time, no TZ) to a UTC ISO string
 * for sending to the backend.  new Date("YYYY-MM-DDTHH:MM") is parsed as
 * local time by the browser, so .toISOString() gives the correct UTC value.
 */
function toUTC(localDT: string | undefined): string | undefined {
  if (!localDT) return undefined;
  return new Date(localDT).toISOString();
}

/**
 * Combine a date string ("YYYY-MM-DD") with a time string ("HH:MM") into a
 * UTC ISO string, treating the input as local time.
 */
function dateTimeToUTC(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

// ============================================================================
// Empty service form
// ============================================================================

const emptyForm: Partial<CreateServiceRequest> = {
  signout_required: false,
};

// ============================================================================
// Main Component
// ============================================================================

export default function ServicesPage() {
  const { hasRole } = useAuth();
  const { addToast } = useToast();
  const isSuperadmin = hasRole(ROLES.SUPERADMIN);

  // Data
  const [services, setServices] = useState<Service[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [loading, setLoading] = useState(true);

  // UI State
  const [tab, setTab] = useState<Tab>('groups');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<Partial<CreateServiceRequest>>(emptyForm);
  const [cancelTarget, setCancelTarget] = useState<Service | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Capacity editing
  const [editingCapacities, setEditingCapacities] = useState(false);
  const [capacities, setCapacities] = useState<Record<string, number>>({
    S1: 500, S2: 500, S3: 500,
  });

  // Bulk wizard state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStep, setBulkStep] = useState(1);
  const [bulkType, setBulkType] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');
  const [bulkDates, setBulkDates] = useState<string[]>([]);
  const [bulkOpenTime, setBulkOpenTime] = useState(''); // HH:MM
  const [bulkCloseTime, setBulkCloseTime] = useState('');
  const [bulkSignout, setBulkSignout] = useState(false);
  const [bulkName, setBulkName] = useState('');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, failed: 0 });

  // ============================================================================
  // Data loading
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      const [svcData, semData] = await Promise.all([
        serviceService.listServices(),
        serviceService.listSemesters(),
      ]);
      const svcs = Array.isArray(svcData) ? svcData : svcData.results || [];
      const sems = Array.isArray(semData) ? semData : semData.results || [];
      setServices(svcs);
      setSemesters(sems);

      const active = sems.find((s) => s.is_active) || sems[0] || null;
      setActiveSemester(active);
      if (active?.service_group_capacities) {
        setCapacities({
          S1: active.service_group_capacities.S1 ?? 500,
          S2: active.service_group_capacities.S2 ?? 500,
          S3: active.service_group_capacities.S3 ?? 500,
        });
      }
    } catch {
      addToast('Failed to load services', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ============================================================================
  // Capacity save
  // ============================================================================

  async function handleSaveCapacities() {
    if (!activeSemester) return;
    setSaving(true);
    try {
      const updated = await serviceService.updateSemester(activeSemester.id, {
        service_group_capacities: capacities,
      });
      setActiveSemester(updated);
      setEditingCapacities(false);
      addToast('Service group capacities updated', 'success');
    } catch {
      addToast('Failed to update capacities', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ============================================================================
  // Service CRUD
  // ============================================================================

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, semester: activeSemester?.id || '' });
    setShowForm(true);
  }

  function openBulkWizard() {
    setBulkStep(1);
    setBulkType('');
    setBulkGroup('');
    setBulkDates([]);
    setBulkOpenTime('');
    setBulkCloseTime('');
    setBulkSignout(false);
    setBulkName('');
    setBulkProgress({ done: 0, total: 0, failed: 0 });
    setShowBulk(true);
  }

  async function handleBulkCreate() {
    if (!activeSemester || bulkDates.length === 0 || !bulkOpenTime || !bulkCloseTime) return;
    setBulkCreating(true);
    const total = bulkDates.length;
    setBulkProgress({ done: 0, total, failed: 0 });
    setBulkStep(4);

    let done = 0;
    let failed = 0;
    const created: Service[] = [];

    for (const date of bulkDates) {
      try {
        const openDT  = dateTimeToUTC(date, bulkOpenTime);
        const closeDT = dateTimeToUTC(date, bulkCloseTime);
        const svc = await serviceService.createService({
          semester: activeSemester.id,
          service_type: bulkType as CreateServiceRequest['service_type'],
          service_group: (bulkType === 'special' ? 'all' : bulkGroup) as CreateServiceRequest['service_group'],
          name: bulkName || '',
          scheduled_date: date,
          window_open_time: openDT,
          window_close_time: closeDT,
          signout_required: bulkSignout,
        });
        created.push(svc);
        done++;
      } catch {
        failed++;
        done++;
      }
      setBulkProgress({ done, total, failed });
    }

    setServices((prev) => [...created, ...prev]);
    setBulkCreating(false);
    addToast(`${created.length} services created` + (failed > 0 ? `, ${failed} failed` : ''), failed > 0 ? 'warning' : 'success');
  }

  function openEdit(service: Service) {
    setEditing(service);
    setForm({
      semester: service.semester,
      service_type: service.service_type,
      service_group: service.service_group,
      name: service.name || '',
      scheduled_date: service.scheduled_date,
      // Convert stored UTC times → local datetime-local values
      window_open_time:   toLocalDT(service.window_open_time),
      window_close_time:  toLocalDT(service.window_close_time),
      signout_required:   service.signout_required,
      signout_open_time:  service.signout_open_time  ? toLocalDT(service.signout_open_time)  : '',
      signout_close_time: service.signout_close_time ? toLocalDT(service.signout_close_time) : '',
      capacity_cap: service.capacity_cap,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.semester || !form.service_type || !form.service_group || !form.scheduled_date || !form.window_open_time || !form.window_close_time) {
      addToast('Please fill all required fields', 'warning');
      return;
    }
    setSaving(true);
    try {
      // Convert all datetime-local values (local time) to UTC ISO strings
      const payload: Partial<CreateServiceRequest> = {
        ...form,
        window_open_time:   toUTC(form.window_open_time),
        window_close_time:  toUTC(form.window_close_time),
        signout_open_time:  form.signout_required && form.signout_open_time  ? toUTC(form.signout_open_time)  : null,
        signout_close_time: form.signout_required && form.signout_close_time ? toUTC(form.signout_close_time) : null,
      };
      if (editing) {
        const updated = await serviceService.updateService(editing.id, payload);
        setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        addToast('Service updated', 'success');
      } else {
        const created = await serviceService.createService(payload as CreateServiceRequest);
        setServices((prev) => [created, ...prev]);
        addToast('Service created', 'success');
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save service';
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 5) {
      addToast('Enter a cancellation reason (at least 5 characters)', 'warning');
      return;
    }
    try {
      await serviceService.cancelService(cancelTarget.id, cancelReason.trim());
      setServices((prev) => prev.map((s) => s.id === cancelTarget.id ? { ...s, is_cancelled: true } : s));
      setCancelTarget(null);
      setCancelReason('');
      addToast('Service cancelled', 'success');
    } catch {
      addToast('Failed to cancel service', 'error');
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  const groupStats: Record<string, GroupStat> = activeSemester?.group_stats || {
    S1: { count: 0, capacity: 500, percentage: 0 },
    S2: { count: 0, capacity: 500, percentage: 0 },
    S3: { count: 0, capacity: 500, percentage: 0 },
  };

  const getServicesByType = (type: string) =>
    services.filter((s) => s.service_type === type && !s.is_cancelled).sort(
      (a, b) => a.scheduled_date.localeCompare(b.scheduled_date)
    );

  // When service type changes, auto-set group for special
  const handleTypeChange = (type: string) => {
    setForm((f) => ({
      ...f,
      service_type: type as typeof SERVICE_TYPES[keyof typeof SERVICE_TYPES],
      service_group: type === 'special' ? 'all' as typeof SERVICE_GROUPS[keyof typeof SERVICE_GROUPS] : f.service_group,
    }));
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Management</h1>
          {activeSemester && (
            <p className="text-sm text-muted mt-0.5">{activeSemester.name}</p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-border">
        {([
          { key: 'groups' as Tab, label: 'Service Groups', icon: '👥' },
          { key: 'schedule' as Tab, label: 'Service Schedule', icon: '📅' },
        ]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-primary text-white shadow-md'
                : 'text-muted hover:text-foreground hover:bg-surface-3'
            }`}
          >
            <span className="mr-1.5">{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* TAB 1: SERVICE GROUPS                                               */}
      {/* ================================================================== */}

      {tab === 'groups' && (
        <div className="space-y-4">
          {/* Info banner */}
          <div className="bg-primary-muted border border-primary/20 rounded-xl p-3 text-sm flex items-start gap-2.5">
            <span className="text-lg">ℹ️</span>
            <div>
              <p className="font-medium text-foreground">Service group capacities</p>
              <p className="text-muted mt-0.5">
                Set the maximum number of students per service group. Students are
                auto-assigned to groups with available capacity during registration.
              </p>
            </div>
          </div>

          {/* Group cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {(['S1', 'S2', 'S3'] as const).map((group) => {
              const stats = groupStats[group];
              const colors = GROUP_COLORS[group];
              const pct = stats.percentage;
              const isNearFull = pct >= 80;
              const isFull = pct >= 100;

              return (
                <div
                  key={group}
                  className={`rounded-[2rem] glass-card card-lift border p-5 transition-all ${colors.border} ${colors.glow}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{GROUP_ICONS[group]}</span>
                      <h3 className={`text-lg font-bold ${colors.text}`}>
                        Service {group.replace('S', '')}
                      </h3>
                    </div>
                    <Badge
                      variant={isFull ? 'danger' : isNearFull ? 'warning' : 'success'}
                    >
                      {isFull ? 'Full' : isNearFull ? 'Near full' : 'Available'}
                    </Badge>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>{stats.count} students</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isFull ? 'bg-danger' : isNearFull ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Capacity */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">Capacity</span>
                    {editingCapacities ? (
                      <input
                        type="number"
                        min="1"
                        max="9999"
                        value={capacities[group]}
                        onChange={(e) => setCapacities((c) => ({
                          ...c,
                          [group]: parseInt(e.target.value || '0', 10),
                        }))}
                        className="w-20 text-right text-sm font-bold bg-surface-2 border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
                      />
                    ) : (
                      <span className="text-sm font-bold">{stats.capacity}</span>
                    )}
                  </div>

                  {/* Service count for this group */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <span className="text-xs text-muted">Scheduled services</span>
                    <span className="text-xs font-medium">
                      {services.filter((s) => s.service_group === group && !s.is_cancelled).length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Capacity edit buttons */}
          {isSuperadmin && (
            <div className="flex gap-3 justify-end">
              {editingCapacities ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingCapacities(false);
                      // Reset to saved values
                      if (activeSemester?.service_group_capacities) {
                        setCapacities({
                          S1: activeSemester.service_group_capacities.S1 ?? 500,
                          S2: activeSemester.service_group_capacities.S2 ?? 500,
                          S3: activeSemester.service_group_capacities.S3 ?? 500,
                        });
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" loading={saving} onClick={() => void handleSaveCapacities()}>
                    Save Capacities
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setEditingCapacities(true)}>
                  ✏️ Edit Capacities
                </Button>
              )}
            </div>
          )}

          {/* Total summary */}
          <Card variant="glass" className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Total Students</p>
              <p className="text-xs text-muted">Across all service groups</p>
            </div>
            <p className="text-2xl font-bold gradient-text">
              {Object.values(groupStats).reduce((sum, g) => sum + g.count, 0)}
            </p>
          </Card>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: SERVICE SCHEDULE                                             */}
      {/* ================================================================== */}

      {tab === 'schedule' && (
        <div className="space-y-4">
          {/* Create buttons */}
          {isSuperadmin && (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={openCreate}>+ Single Service</Button>
              <Button onClick={openBulkWizard}>📅 Schedule Services</Button>
            </div>
          )}

          {/* Group by service type */}
          {['midweek', 'sunday', 'special'].map((type) => {
            const typeServices = getServicesByType(type);
            if (typeServices.length === 0 && type !== 'special') return null;

            return (
              <div key={type} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
                  <span>{type === 'midweek' ? '📖' : type === 'sunday' ? '⛪' : '🌟'}</span>
                  {type.charAt(0).toUpperCase() + type.slice(1)} Services
                  <Badge variant="info">{typeServices.length}</Badge>
                </h3>

                {typeServices.length === 0 ? (
                  <p className="text-xs text-muted py-4 text-center">No {type} services scheduled yet</p>
                ) : (
                  <div className="space-y-2">
                    {typeServices.map((service) => (
                      <Card key={service.id} variant="glass" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between card-lift">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">
                              {service.name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${service.service_group}`}
                            </p>
                            <Badge variant={service.is_cancelled ? 'danger' : service.is_window_open ? 'success' : 'info'}>
                              {service.is_cancelled ? 'Cancelled' : service.is_window_open ? 'Window Open' : service.service_group}
                            </Badge>
                            {service.signout_required && <Badge variant="warning">Sign-out</Badge>}
                          </div>
                          <p className="text-xs text-muted mt-1">
                            📅 {formatDate(service.scheduled_date)} · 🕐 {formatTime(service.window_open_time)} → {formatTime(service.window_close_time)}
                            {service.signout_required && service.signout_open_time && service.signout_close_time && (
                              <span className="ml-2 text-warning">· Sign-out: {formatTime(service.signout_open_time)} → {formatTime(service.signout_close_time)}</span>
                            )}
                          </p>
                        </div>
                        {isSuperadmin && (
                          <div className="flex gap-2 shrink-0">
                            <Button variant="secondary" size="sm" onClick={() => openEdit(service)}>Edit</Button>
                            {!service.is_cancelled && (
                              <Button variant="ghost" size="sm" onClick={() => setCancelTarget(service)}>Cancel</Button>
                            )}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {services.length === 0 && (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">📅</p>
              <p className="text-muted">No services scheduled yet</p>
              {isSuperadmin && (
                <Button className="mt-4" onClick={openCreate}>Create First Service</Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SINGLE CREATE/EDIT SERVICE MODAL                                    */}
      {/* ================================================================== */}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Service' : 'Create Single Service'} className="glass-panel backdrop-blur-md">
        <div className="space-y-4">
          <Select id="svc-type" label="Service Type" options={[{ value: 'midweek', label: '📖 Midweek' }, { value: 'sunday', label: '⛪ Sunday' }, { value: 'special', label: '🌟 Special' }]} value={form.service_type || ''} onChange={(e) => handleTypeChange(e.target.value)} />
          {form.service_type !== 'special' ? (
            <Select id="svc-group" label="Group" options={[{ value: 'S1', label: 'S1' }, { value: 'S2', label: 'S2' }, { value: 'S3', label: 'S3' }]} value={form.service_group || ''} onChange={(e) => setForm((f) => ({ ...f, service_group: e.target.value as typeof SERVICE_GROUPS[keyof typeof SERVICE_GROUPS] }))} />
          ) : (
            <div className="bg-surface-2 border border-border rounded-xl p-3 text-sm text-muted">🌟 All students</div>
          )}
          <Input id="svc-name" label="Name (optional)" value={form.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input id="svc-date" label="Date" type="date" value={form.scheduled_date || ''} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input id="svc-open" label="Window Opens" type="datetime-local" value={form.window_open_time || ''} onChange={(e) => setForm((f) => ({ ...f, window_open_time: e.target.value }))} />
            <Input id="svc-close" label="Window Closes" type="datetime-local" value={form.window_close_time || ''} onChange={(e) => setForm((f) => ({ ...f, window_close_time: e.target.value }))} />
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-surface-2 border border-border px-4 py-3 text-sm cursor-pointer">
            <input type="checkbox" checked={!!form.signout_required} onChange={(e) => setForm((f) => ({ ...f, signout_required: e.target.checked, signout_open_time: e.target.checked ? f.signout_open_time : '', signout_close_time: e.target.checked ? f.signout_close_time : '' }))} className="rounded" />
            <div><p className="font-medium">Require Sign-out</p><p className="text-xs text-muted">Both sign-in and sign-out needed for valid attendance</p></div>
          </label>
          {form.signout_required && (
            <div className="space-y-2 pl-3 border-l-2 border-primary/20">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Sign-out Window (optional)</p>
              <p className="text-xs text-muted">Leave blank to use the same window as sign-in.</p>
              <div className="grid grid-cols-2 gap-4">
                <Input id="svc-sout-open"  label="Sign-out Opens"  type="datetime-local" value={form.signout_open_time  || ''} onChange={(e) => setForm((f) => ({ ...f, signout_open_time:  e.target.value }))} />
                <Input id="svc-sout-close" label="Sign-out Closes" type="datetime-local" value={form.signout_close_time || ''} onChange={(e) => setForm((f) => ({ ...f, signout_close_time: e.target.value }))} />
              </div>
            </div>
          )}
          <Button onClick={() => void handleSave()} loading={saving} className="w-full">{editing ? 'Save Changes' : 'Create Service'}</Button>
        </div>
      </Modal>

      {/* ================================================================== */}
      {/* BULK SCHEDULING WIZARD                                              */}
      {/* ================================================================== */}

      <Modal open={showBulk} onClose={() => { if (!bulkCreating) setShowBulk(false); }} title={`Schedule Services — Step ${bulkStep} of 4`} className="glass-panel backdrop-blur-md">
        <div className="space-y-4">
          {/* Step indicator */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= bulkStep ? 'bg-primary' : 'bg-surface-2'}`} />
            ))}
          </div>

          {/* STEP 1: Type + Group */}
          {bulkStep === 1 && (
            <>
              <Select id="bulk-type" label="Service Type" options={[{ value: 'midweek', label: '📖 Midweek Service' }, { value: 'sunday', label: '⛪ Sunday Service' }, { value: 'special', label: '🌟 Special Service' }]} value={bulkType} onChange={(e) => { setBulkType(e.target.value); if (e.target.value === 'special') setBulkGroup('all'); }} />
              {bulkType && bulkType !== 'special' && (
                <Select id="bulk-group" label="Service Group" options={[{ value: 'S1', label: '1️⃣ Service 1 (S1)' }, { value: 'S2', label: '2️⃣ Service 2 (S2)' }, { value: 'S3', label: '3️⃣ Service 3 (S3)' }]} value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} />
              )}
              {bulkType === 'special' && (
                <div className="bg-surface-2 border border-border rounded-xl p-3 text-sm text-muted">🌟 Special services include <strong>all students</strong>.</div>
              )}
              <Button className="w-full" disabled={!bulkType || (!bulkGroup && bulkType !== 'special')} onClick={() => setBulkStep(2)}>Next — Pick Dates →</Button>
            </>
          )}

          {/* STEP 2: Multi-date calendar */}
          {bulkStep === 2 && (
            <>
              <div className="text-sm text-muted text-center">
                Selecting dates for <Badge variant="info">{bulkType === 'special' ? '🌟 Special' : `${bulkType} ${bulkGroup}`}</Badge>
              </div>
              <MultiDateCalendar
                selectedDates={bulkDates}
                onChange={setBulkDates}
                accentColor={bulkGroup ? (GROUP_ACCENT[bulkGroup] || 'primary') : 'primary'}
              />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setBulkStep(1)}>← Back</Button>
                <Button className="flex-1" disabled={bulkDates.length === 0} onClick={() => setBulkStep(3)}>Next — Set Times →</Button>
              </div>
            </>
          )}

          {/* STEP 3: Time window */}
          {bulkStep === 3 && (
            <>
              <div className="text-sm text-muted text-center">
                Setting time for <strong>{bulkDates.length}</strong> {bulkType} service{bulkDates.length > 1 ? 's' : ''}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input id="bulk-open" label="Window Opens" type="time" value={bulkOpenTime} onChange={(e) => setBulkOpenTime(e.target.value)} />
                <Input id="bulk-close" label="Window Closes" type="time" value={bulkCloseTime} onChange={(e) => setBulkCloseTime(e.target.value)} />
              </div>
              <Input id="bulk-name" label="Service Name (optional)" placeholder="e.g., Midweek Service" value={bulkName} onChange={(e) => setBulkName(e.target.value)} />
              <label className="flex items-center gap-3 rounded-xl bg-surface-2 border border-border px-4 py-3 text-sm cursor-pointer">
                <input type="checkbox" checked={bulkSignout} onChange={(e) => setBulkSignout(e.target.checked)} className="rounded" />
                <div><p className="font-medium">Require Sign-out</p><p className="text-xs text-muted">Both sign-in and sign-out needed</p></div>
              </label>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setBulkStep(2)}>← Back</Button>
                <Button className="flex-1" disabled={!bulkOpenTime || !bulkCloseTime} onClick={() => void handleBulkCreate()}>Create {bulkDates.length} Services</Button>
              </div>
            </>
          )}

          {/* STEP 4: Progress / Result */}
          {bulkStep === 4 && (
            <>
              <div className="text-center py-4">
                {bulkCreating ? (
                  <>
                    <Spinner />
                    <p className="text-sm text-muted mt-3">Creating services... {bulkProgress.done}/{bulkProgress.total}</p>
                    <div className="h-2 bg-surface-2 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-4xl mb-3">✅</p>
                    <p className="text-lg font-bold">{bulkProgress.total - bulkProgress.failed} services created</p>
                    {bulkProgress.failed > 0 && <p className="text-sm text-warning mt-1">⚠️ {bulkProgress.failed} failed (possible conflicts)</p>}
                  </>
                )}
              </div>
              {!bulkCreating && (
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setShowBulk(false)}>View Schedule</Button>
                  <Button className="flex-1" onClick={openBulkWizard}>Create More</Button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* Cancel confirmation modal */}
      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel Service" className="glass-panel backdrop-blur-md">
        <div className="space-y-4">
          <div className="bg-warning-muted border border-warning/20 rounded-xl p-3 text-sm">
            <p className="font-medium text-warning mb-1">⚠️ This action affects attendance</p>
            <p className="text-muted">Cancelled services are excluded from the total required count. Student attendance percentages will recalculate.</p>
          </div>
          <Input id="cancel-reason" label="Reason for cancellation" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelTarget(null)}>Keep Service</Button>
            <Button variant="danger" className="flex-1" onClick={() => void handleCancel()}>Cancel Service</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

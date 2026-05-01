'use client';

import { useState, useEffect } from 'react';
import {
  authService,
  type AdminUser,
  type CreateAdminRequest,
} from '@/lib/api/authService';
import { useToast } from '@/providers/ToastProvider';
import {
  ADMIN_PERMISSION_LABELS,
  ADMIN_PERMISSIONS,
  ROLES,
  type AdminPermission,
} from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';

const permissionKeys = Object.values(ADMIN_PERMISSIONS);

export default function UsersPage() {
  const { addToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<Partial<CreateAdminRequest>>({});
  const [bindTarget, setBindTarget] = useState<AdminUser | null>(null);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    authService.listUsers().then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      setUsers(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ admin_permissions: {} });
    setShowForm(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm({
      email: user.email,
      full_name: user.full_name,
      phone_number: user.phone_number || '',
      role: user.role,
      admin_permissions: user.admin_permissions || {},
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.email || !form.full_name || !form.role || (!editing && !form.password)) {
      addToast('Fill all required fields', 'warning');
      return;
    }
    setSaving(true);
    try {
      // Clean form data: only send relevant fields for the role
      const payload: Partial<CreateAdminRequest> = {
        email: form.email,
        full_name: form.full_name,
        phone_number: form.phone_number || '',
        role: form.role,
      };
      if (form.password) payload.password = form.password;
      if (form.role === ROLES.ADMIN) {
        payload.admin_permissions = form.admin_permissions || {};
      }
      // Never send bound_device_id during create/edit — it's managed via Bind Device

      if (editing) {
        const updated = await authService.updateUser(editing.id, payload);
        setUsers((prev) => prev.map((user) => user.id === updated.id ? updated : user));
        addToast('User updated', 'success');
      } else {
        const created = await authService.createUser(payload as CreateAdminRequest);
        setUsers((prev) => [created, ...prev]);
        addToast('User created', 'success');
      }
      setShowForm(false);
      setEditing(null);
      setForm({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save user';
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(user: AdminUser) {
    try {
      await authService.deleteUser(user.id);
      setUsers((prev) => prev.map((item) => item.id === user.id ? { ...item, is_active: false } : item));
      addToast('User deactivated', 'success');
    } catch {
      addToast('Failed to deactivate user', 'error');
    }
  }

  async function handleResetDevice() {
    if (!bindTarget) return;
    try {
      await authService.bindDevice({ protocol_member_id: bindTarget.id, device_id: '' });
      setUsers((prev) => prev.map((user) => user.id === bindTarget.id ? { ...user, bound_device_id: null } : user));
      setBindTarget(null);
      addToast('Device binding reset successfully', 'success');
    } catch {
      addToast('Failed to reset device binding', 'error');
    }
  }

  const roleOptions = [
    { value: ROLES.ADMIN, label: 'Admin' },
    { value: ROLES.PROTOCOL_ADMIN, label: 'Protocol Admin' },
    { value: ROLES.PROTOCOL_MEMBER, label: 'Protocol Member' },
  ];

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Users</h1>
        <Button onClick={openCreate}>Create User</Button>
      </div>

      <div className="space-y-2">
        {users.map((user) => (
          <Card key={user.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{user.full_name}</p>
                <Badge variant="info">{user.role.replace('_', ' ')}</Badge>
                <Badge variant={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-xs text-muted mt-1">{user.email}</p>
              {user.role === ROLES.PROTOCOL_MEMBER && (
                <p className="text-xs text-muted mt-1">Device: {user.bound_device_id || 'Not bound'}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {user.role === ROLES.PROTOCOL_MEMBER && (
                <Button variant="secondary" size="sm" onClick={() => setBindTarget(user)}>
                  {user.bound_device_id ? 'Reset Device' : 'Bind Info'}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>Edit</Button>
              {user.is_active && (
                <Button variant="ghost" size="sm" onClick={() => void handleDeactivate(user)}>Deactivate</Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit User' : 'Create User'}>
        <div className="space-y-4">
          <Input id="usr-email" label="Email" type="email" value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input id="usr-name" label="Full Name" value={form.full_name || ''} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          <Input id="usr-phone" label="Phone" value={form.phone_number || ''} onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
          <Select id="usr-role" label="Role" options={roleOptions} value={form.role || ''} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof ROLES[keyof typeof ROLES] }))} />
          <Input id="usr-pass" label={editing ? 'New Password (optional)' : 'Password'} type="password" value={form.password || ''} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />


          {form.role === ROLES.PROTOCOL_MEMBER && (
            <div className="bg-surface-2 border border-border rounded-xl p-3 text-sm text-muted flex items-start gap-2.5">
              <span className="text-lg">📱</span>
              <div>
                <p className="font-medium text-foreground">Device binding required</p>
                <p className="mt-0.5">After creating this account, the protocol member must log in from their device. Their device will be <strong>automatically bound</strong> on their first login.</p>
              </div>
            </div>
          )}

          {form.role === ROLES.ADMIN && (
            <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-3">
              <p className="text-sm font-medium">Admin Permissions</p>
              {permissionKeys.map((permission) => (
                <label key={permission} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.admin_permissions?.[permission as AdminPermission] === true}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      admin_permissions: {
                        ...(current.admin_permissions || {}),
                        [permission]: e.target.checked,
                      },
                    }))}
                  />
                  {ADMIN_PERMISSION_LABELS[permission as AdminPermission]}
                </label>
              ))}
            </div>
          )}

          <Button onClick={() => void handleSave()} loading={saving} className="w-full">
            {editing ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!bindTarget} onClose={() => setBindTarget(null)} title="Reset Device Binding">
        <div className="space-y-4">
          <div className="bg-surface-2 border border-border rounded-xl p-3 text-sm text-muted">
            <p className="font-medium text-foreground mb-1">ℹ️ How device binding works</p>
            <p>Devices are <strong>automatically bound</strong> when a Protocol Member logs in for the first time. Resetting the binding allows the member to bind a new device on their next login.</p>
          </div>
          {bindTarget?.bound_device_id ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Current device:</span>
                <code className="bg-surface-2 px-2 py-1 rounded text-xs font-mono">{bindTarget.bound_device_id}</code>
              </div>
              <p className="text-sm text-muted">Resetting will clear the current device binding for {bindTarget?.full_name}. They will be forced to log in again on their new device.</p>
              <Button className="w-full" variant="danger" onClick={() => void handleResetDevice()}>Reset Device Binding</Button>
            </>
          ) : (
             <p className="text-sm text-muted text-center py-4">No device bound yet. {bindTarget?.full_name} will bind their device automatically upon first login.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

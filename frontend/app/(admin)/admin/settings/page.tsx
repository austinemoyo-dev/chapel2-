'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { serviceService } from '@/lib/api/serviceService';
import type { Semester } from '@/lib/api/serviceService';
import { adminService } from '@/lib/api/adminService';
import { registrationService } from '@/lib/api/registrationService';
import { useToast } from '@/providers/ToastProvider';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';

// Leaflet requires window — load client-side only
const GeoFenceMap = dynamic(() => import('@/components/ui/GeoFenceMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[350px] bg-surface-2 rounded-2xl flex items-center justify-center border border-border">
      <Spinner />
    </div>
  ),
});

export default function SettingsPage() {
  const { addToast } = useToast();
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [radius, setRadius] = useState(200);
  const [regOpen, setRegOpen] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [resetting, setResetting]     = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [hasChanges, setHasChanges]   = useState(false);

  // Semesters state
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [showSemesterForm, setShowSemesterForm] = useState(false);
  const [newSemester, setNewSemester] = useState({ name: '', start_date: '', end_date: '', is_active: true });
  const [creatingSemester, setCreatingSemester] = useState(false);

  // Original values for change detection
  const [original, setOriginal] = useState({ lat: 0, lng: 0, radius: 200 });

  useEffect(() => {
    Promise.all([
      serviceService.getGeoFence().catch(() => ({ latitude: 0, longitude: 0, radius_meters: 200 })),
      registrationService.getStatus().catch(() => ({ registration_open: false })),
      serviceService.listSemesters().catch(() => ({ results: [] })),
    ]).then(([geo, reg, sems]) => {
      const lat = Number(geo.latitude) || 0;
      const lng = Number(geo.longitude) || 0;
      const r = Number(geo.radius_meters) || 200;
      setLatitude(lat);
      setLongitude(lng);
      setRadius(r);
      setOriginal({ lat, lng, radius: r });
      setRegOpen((reg as { registration_open: boolean }).registration_open);
      
      const sList = Array.isArray(sems) ? sems : (sems as any).results || [];
      setSemesters(sList);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Track changes
  useEffect(() => {
    setHasChanges(
      latitude !== original.lat ||
      longitude !== original.lng ||
      radius !== original.radius
    );
  }, [latitude, longitude, radius, original]);

  const saveGeoFence = async () => {
    setSaving(true);
    try {
      await serviceService.updateGeoFence({
        latitude: parseFloat(latitude.toFixed(7)),
        longitude: parseFloat(longitude.toFixed(7)),
        radius_meters: radius,
      });
      setOriginal({ lat: latitude, lng: longitude, radius });
      setHasChanges(false);
      addToast('Geo-fence updated successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update geo-fence', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetGeoFence = async () => {
    setResetting(true);
    try {
      await serviceService.resetGeoFence();
      setLatitude(0);
      setLongitude(0);
      setRadius(200);
      setOriginal({ lat: 0, lng: 0, radius: 200 });
      setHasChanges(false);
      setConfirmReset(false);
      addToast(
        'Geo-fence reset. Attendance marking is blocked until you set a new location.',
        'warning',
      );
    } catch (err: any) {
      addToast(err.message || 'Failed to reset geo-fence', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleCreateSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingSemester(true);
    try {
      const created = await serviceService.createSemester(newSemester);
      
      // If the new semester is active, we should mark other semesters as inactive in the UI
      let updatedSems = semesters;
      if (created.is_active) {
        updatedSems = semesters.map(s => ({ ...s, is_active: false }));
      }
      
      setSemesters([created, ...updatedSems]);
      setShowSemesterForm(false);
      setNewSemester({ name: '', start_date: '', end_date: '', is_active: true });
      addToast('Semester created successfully', 'success');
      
      // Refresh reg status
      const reg = await registrationService.getStatus().catch(() => ({ registration_open: false }));
      setRegOpen(reg.registration_open);
    } catch (err: any) {
      addToast(err.message || 'Failed to create semester', 'error');
    } finally {
      setCreatingSemester(false);
    }
  };

  const toggleRegistration = async (open: boolean) => {
    if (!semesters.some(s => s.is_active)) {
      addToast('Cannot open registration: No active semester exists.', 'error');
      return;
    }
    try {
      await adminService.toggleRegistration(open);
      setRegOpen(open);
      
      // Update the active semester's registration_open flag in the local state
      setSemesters(sems => sems.map(s => s.is_active ? { ...s, registration_open: open } : s));
      addToast(`Registration ${open ? 'opened' : 'closed'}`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update registration', 'error');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Semesters Management */}
      <Card variant="glass">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <h2 className="text-lg font-semibold">Semesters</h2>
              <p className="text-sm text-muted">Manage academic semesters</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowSemesterForm(!showSemesterForm)} variant={showSemesterForm ? 'secondary' : 'primary'}>
            {showSemesterForm ? 'Cancel' : '+ Add Semester'}
          </Button>
        </div>

        {showSemesterForm && (
          <form onSubmit={handleCreateSemester} className="glass-card p-5 rounded-xl border border-border/50 mb-4 grid gap-4 grid-cols-1 md:grid-cols-2 animate-slide-up">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Name</label>
              <input required value={newSemester.name} onChange={e => setNewSemester({...newSemester, name: e.target.value})} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" placeholder="e.g. 2025/2026 Alpha Semester" />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted mb-1">Start Date</label>
                <input required type="date" value={newSemester.start_date} onChange={e => setNewSemester({...newSemester, start_date: e.target.value})} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 outline-none" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted mb-1">End Date</label>
                <input required type="date" value={newSemester.end_date} onChange={e => setNewSemester({...newSemester, end_date: e.target.value})} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 outline-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 md:col-span-2 pt-2">
              <input type="checkbox" id="isActive" checked={newSemester.is_active} onChange={e => setNewSemester({...newSemester, is_active: e.target.checked})} className="rounded border-border bg-surface text-primary w-4 h-4" />
              <label htmlFor="isActive" className="text-sm font-medium cursor-pointer select-none">Set as active semester</label>
            </div>
            <div className="md:col-span-2 flex justify-end mt-2">
              <Button type="submit" loading={creatingSemester}>Save Semester</Button>
            </div>
          </form>
        )}

        {semesters.length === 0 ? (
          <div className="py-8 text-center glass-card rounded-xl border border-dashed border-border/50">
            <p className="text-sm text-muted">No semesters found. Create one to enable registration.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {semesters.map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 glass-card hover:border-primary/40 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{s.name}</p>
                    {s.is_active && <span className="bg-success-muted text-success text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">Active</span>}
                  </div>
                  <p className="text-xs text-muted mt-1">{new Date(s.start_date).toLocaleDateString()} to {new Date(s.end_date).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  {s.registration_open && <span className="bg-primary/10 border border-primary/20 text-primary text-xs font-medium px-2 py-1 rounded-lg">Registration Open</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Registration Window */}
      <Card variant="glass">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">📋</span>
          <h2 className="text-lg font-semibold">Registration Window</h2>
        </div>
        <div className="flex items-center justify-between glass-card rounded-xl px-4 py-3 border border-border/50">
          <div>
            <p className="text-sm font-medium">Student Self-Registration</p>
            <p className="text-xs text-muted">Allow students to register for the active semester</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-1 rounded-lg ${regOpen ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
              {regOpen ? '● Open' : '● Closed'}
            </span>
            <Button
              variant={regOpen ? 'danger' : 'success'}
              size="sm"
              onClick={() => toggleRegistration(!regOpen)}
            >
              {regOpen ? 'Close Registration' : 'Open Registration'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Geo-fence */}
      <Card variant="glass">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📍</span>
            <div>
              <h2 className="text-lg font-semibold">Geo-Fence Configuration</h2>
              <p className="text-sm text-muted">Click the map or search to set the chapel location</p>
            </div>
          </div>
          {hasChanges && (
            <span className="text-xs bg-warning/15 text-warning px-2.5 py-1 rounded-lg animate-pulse">
              Unsaved changes
            </span>
          )}
        </div>

        <GeoFenceMap
          latitude={latitude}
          longitude={longitude}
          radius={radius}
          onLocationChange={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
          onRadiusChange={setRadius}
        />

        <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
          {/* Reset / danger side */}
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-danger font-semibold">
                This blocks all attendance marking. Confirm?
              </p>
              <Button
                variant="danger"
                size="sm"
                loading={resetting}
                onClick={resetGeoFence}
              >
                Yes, Reset
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmReset(true)}
            >
              🗑️ Reset Geo-Fence
            </Button>
          )}

          {/* Save side */}
          <Button
            onClick={saveGeoFence}
            loading={saving}
            disabled={!hasChanges}
          >
            💾 Save Geo-Fence
          </Button>
        </div>
      </Card>
    </div>
  );
}


'use client';

import { useState, useEffect } from 'react';
import { portalService, type PortalProfile } from '@/lib/api/portalService';
import { usePortalAuth } from '../../layout';

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold text-foreground text-right">{value || '—'}</p>
    </div>
  );
}

export default function StudentProfilePage() {
  const { logout } = usePortalAuth();
  const [profile, setProfile] = useState<PortalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalService.getMe().then(setProfile).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const initials = profile?.full_name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('') ?? '';

  const formatLogin = (iso: string | null) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="min-h-dvh bg-background px-4 py-6 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Profile</h1>
        <p className="text-xs text-muted mt-0.5">Your student information</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-surface-2 animate-pulse" />)}</div>
      ) : !profile ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <p className="text-sm text-muted">Could not load profile.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-5 border border-border flex items-center gap-4">
            {profile.profile_photo ? (
              <img src={profile.profile_photo} alt="profile" className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                {initials}
              </div>
            )}
            <div>
              <p className="text-base font-bold text-foreground">{profile.full_name}</p>
              <p className="text-xs text-muted">{profile.system_id}</p>
              <p className="text-xs text-muted mt-0.5">{profile.semester}</p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4 border border-border">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Academic</p>
            <InfoRow label="Department"    value={profile.department} />
            <InfoRow label="Faculty"       value={profile.faculty} />
            <InfoRow label="Level"         value={`${profile.level} Level`} />
            <InfoRow label="Student Type"  value={profile.student_type === 'old' ? 'Old Student' : 'New Student'} />
            <InfoRow label="Service Group" value={profile.service_group} />
          </div>

          <div className="glass-panel rounded-2xl p-4 border border-border">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Contact</p>
            <InfoRow label="Phone"  value={profile.phone_number} />
            {profile.matric_number && <InfoRow label="Matric" value={profile.matric_number} />}
            <InfoRow label="Gender" value={profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null} />
          </div>

          <div className="glass-panel rounded-2xl p-4 border border-border">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Portal</p>
            <InfoRow label="Last login"   value={formatLogin(profile.last_login)} />
            <InfoRow label="Face status"  value={profile.face_registered ? 'Registered ✓' : 'Incomplete ✗'} />
          </div>

          <button
            onClick={() => { localStorage.removeItem('portal_token'); localStorage.removeItem('portal_student'); window.location.href = '/student/login'; }}
            className="w-full glass-panel rounded-2xl p-4 border border-border text-center text-xs text-muted"
          >
            Reset password via face verification →
          </button>

          <button onClick={logout}
            className="w-full h-12 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 font-semibold text-sm">
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

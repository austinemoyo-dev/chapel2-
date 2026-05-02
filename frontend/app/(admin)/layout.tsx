'use client';

import { useAuth } from '@/providers/AuthProvider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ADMIN_PERMISSIONS,
  ROLES,
  type AdminPermission,
} from '@/lib/utils/constants';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';

/* ─── Nav icon map using proper SVGs ─── */
const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={1.6}/>
      <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={1.6}/>
      <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={1.6}/>
      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth={1.6}/>
    </svg>
  ),
  students: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>
  ),
  services: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
  ),
  users: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>
  ),
  duplicates: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
    </svg>
  ),
  reports: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
    </svg>
  ),
  settings: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>
  ),
  audit: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
  ),
  events: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 12.75l1.5 1.5 3-3"/>
    </svg>
  ),
  sermons: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
    </svg>
  ),
};

const navItems: {
  href: string;
  label: string;
  iconKey: string;
  permission?: AdminPermission;
  superadminOnly?: boolean;
}[] = [
  { href: '/admin/dashboard',  label: 'Dashboard',  iconKey: 'dashboard' },
  { href: '/admin/students',   label: 'Students',   iconKey: 'students',   permission: ADMIN_PERMISSIONS.VIEW_STUDENTS },
  { href: '/admin/services',   label: 'Services',   iconKey: 'services',   superadminOnly: true },
  { href: '/admin/events',     label: 'Events',     iconKey: 'events',     superadminOnly: true },
  { href: '/admin/sermons',    label: 'Sermons',    iconKey: 'sermons',    superadminOnly: true },
  { href: '/admin/users',      label: 'Users',      iconKey: 'users',      superadminOnly: true },
  { href: '/admin/duplicates', label: 'Duplicates', iconKey: 'duplicates', superadminOnly: true },
  { href: '/admin/reports',    label: 'Reports',    iconKey: 'reports',    permission: ADMIN_PERMISSIONS.VIEW_REPORTS },
  { href: '/admin/settings',   label: 'Settings',   iconKey: 'settings',   superadminOnly: true },
  { href: '/admin/audit',      label: 'Audit Log',  iconKey: 'audit',      superadminOnly: true },
];

function UserAvatar({ name, role }: { name: string; role: string }) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const isSuperadmin = role === ROLES.SUPERADMIN;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold
                       text-white shrink-0 shadow-sm
                       ${isSuperadmin ? 'bg-mesh-purple' : 'bg-primary/80'}`}>
        {initials}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">{name}</p>
        <span className={`inline-flex items-center text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md
                          ${isSuperadmin
                            ? 'bg-primary/10 text-primary'
                            : 'bg-surface-3 text-muted'}`}>
          {role.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, hasRole, hasPermission, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isOnline = useOnlineStatus();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !hasRole(ROLES.SUPERADMIN, ROLES.ADMIN)) {
      router.replace('/admin/login');
    }
  }, [isLoading, hasRole, router]);

  if (isLoading || !user) return null;

  const visibleNav = navItems.filter((item) => {
    if (hasRole(ROLES.SUPERADMIN)) return true;
    if (item.superadminOnly) return false;
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

  const renderNav = (onNavigate?: () => void) => (
    <nav className="py-3 px-3 space-y-0.5">
      {visibleNav.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                        transition-all duration-300 group
                        ${active
                          ? 'nav-pill-active shadow-[0_4px_16px_rgba(124,58,237,0.15)]'
                          : 'text-muted hover:text-foreground hover:bg-surface-2'}`}
          >
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                              transition-colors duration-300
                              ${active
                                ? 'bg-primary/20 text-primary'
                                : 'bg-surface-2 text-muted group-hover:bg-primary/10 group-hover:text-primary'}`}>
              {NAV_ICONS[item.iconKey]}
            </span>
            <span className="truncate">{item.label}</span>
            {active && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0"/>
            )}
          </a>
        );
      })}
    </nav>
  );

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5 group cursor-pointer">
          <div className="w-8 h-8 rounded-xl bg-white shadow-[0_4px_12px_rgba(124,58,237,0.4)]
                          flex items-center justify-center animate-float-subtle overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Veritas Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-tight">Chapel Admin</p>
            <p className="text-[10px] text-muted font-medium tracking-wide">Management Console</p>
          </div>
        </div>
      </div>

      {/* Online indicator strip */}
      <div className={`mx-3 mb-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2
                        ${isOnline
                          ? 'bg-success-muted text-success'
                          : 'bg-warning-muted text-warning'}`}>
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-warning'} shrink-0`}/>
        {isOnline ? 'Connected' : 'Offline Mode'}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        {renderNav(onNavigate)}
      </div>

      {/* User + Logout */}
      <div className="p-4 border-t border-border space-y-3">
        <UserAvatar name={user.full_name} role={user.role} />
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium
                     text-muted hover:text-danger hover:bg-danger-muted transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh flex bg-background">

      {/* ── Desktop Sidebar — liquid glass ── */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col glass-panel border-l-0 border-y-0 rounded-none z-10">
        <SidebarContent />
      </aside>

      {/* ── Mobile Full-Screen Drawer (for "More") ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"/>
          <div
            className="absolute left-0 top-0 bottom-0 w-72 glass-panel border-l-0 rounded-none
                       shadow-[4px_0_40px_rgba(0,0,0,0.18)] animate-slide-in-left"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile compact top bar */}
        <header className="lg:hidden sticky top-0 z-40 glass-panel border-t-0 border-x-0 rounded-none">
          <div className="flex items-center justify-between px-4 py-2.5"
               style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-white flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Veritas Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-sm font-black text-foreground">Chapel Admin</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold
                               ${isOnline ? 'bg-success-muted text-success' : 'bg-warning-muted text-warning'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-success' : 'bg-warning'}`}/>
                {isOnline ? 'Live' : 'Offline'}
              </div>
            </div>
          </div>
        </header>

        {/* Main content — extra bottom padding on mobile for bottom nav */}
        <main className="flex-1 p-4 lg:p-8 overflow-auto pb-24 lg:pb-8">
          {children}
        </main>

        {/* ── Mobile Bottom Pill Navigation Bar ── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40"
             style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-3 mb-2 animate-slide-up-spring">
            <div className="flex items-center justify-around glass-panel rounded-[2rem] px-2 py-2">
              {/* First 4 visible nav items */}
              {visibleNav.slice(0, 4).map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <a key={item.href} href={item.href}
                     className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl
                                 transition-all duration-200 min-w-[52px]
                                 ${active
                                   ? 'bg-primary text-white shadow-[0_4px_12px_rgba(139,0,255,0.35)]'
                                   : 'text-muted hover:text-foreground'}`}>
                    <span className={`transition-transform ${active ? 'scale-110' : 'scale-100'}`}>
                      {NAV_ICONS[item.iconKey]}
                    </span>
                    <span className={`text-[9px] font-bold tracking-wide truncate max-w-[48px]
                                      ${active ? 'text-white' : 'text-muted'}`}>
                      {item.label}
                    </span>
                  </a>
                );
              })}
              {/* "More" opens full drawer */}
              {visibleNav.length > 4 && (
                <button
                  onClick={() => setMobileOpen(true)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl
                               transition-all duration-200 min-w-[52px]
                               ${mobileOpen
                                 ? 'bg-primary text-white shadow-[0_4px_12px_rgba(139,0,255,0.35)]'
                                 : 'text-muted'}`}
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="5"  cy="12" r="1.5" fill="currentColor" stroke="none"/>
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                    <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                  </svg>
                  <span className="text-[9px] font-bold tracking-wide">More</span>
                </button>
              )}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/api/client';

// ─────────────────────────────────────────────
// Portal Auth Context
// ─────────────────────────────────────────────

interface PortalStudent {
  id: string;
  full_name: string;
  student_type: string;
  service_group: string;
  department: string;
  faculty: string;
  level: string;
  face_registered: boolean;
  system_id: string;
}

interface PortalAuthCtx {
  student: PortalStudent | null;
  token: string | null;
  login: (token: string, student: PortalStudent) => void;
  logout: () => void;
  isLoading: boolean;
}

const PortalAuthContext = createContext<PortalAuthCtx>({
  student: null, token: null,
  login: () => {}, logout: () => {}, isLoading: true,
});

export function usePortalAuth() { return useContext(PortalAuthContext); }

const TOKEN_KEY = 'portal_token';
const STUDENT_KEY = 'portal_student';

// ─────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────

export default function PortalLayout({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<PortalStudent | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router   = useRouter();
  const pathname = usePathname();

  // Restore session from localStorage
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const s = localStorage.getItem(STUDENT_KEY);
    if (t && s) {
      try {
        setToken(t);
        setStudent(JSON.parse(s));
      } catch { /* corrupt */ }
    }
    setIsLoading(false);
  }, []);

  // Guard — redirect to login if not authenticated (except on auth pages)
  const isAuthPage = pathname === '/student/login' || pathname === '/student/setup'
    || pathname === '/portal/login' || pathname === '/portal';
  useEffect(() => {
    if (!isLoading && !student && !isAuthPage) {
      router.replace('/student/login');
    }
  }, [isLoading, student, isAuthPage, router]);

  const login = useCallback((t: string, s: PortalStudent) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(STUDENT_KEY, JSON.stringify(s));
    setToken(t);
    setStudent(s);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STUDENT_KEY);
    setToken(null);
    setStudent(null);
    router.push('/portal/login');
  }, [router]);

  if (isLoading) return null;
  if (!student && !isAuthPage) return null;

  return (
    <PortalAuthContext.Provider value={{ student, token, login, logout, isLoading }}>
      {student && !isAuthPage && <PortalNav student={student} onLogout={logout} />}
      <div className={student && !isAuthPage ? 'pb-20' : ''}>
        {children}
      </div>
    </PortalAuthContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Bottom Navigation
// ─────────────────────────────────────────────

function PortalNav({ student, onLogout }: { student: PortalStudent; onLogout: () => void }) {
  const pathname = usePathname();
  const router   = useRouter();

  const tabs = [
    { href: '/student',            icon: '🏠', label: 'Home'       },
    { href: '/student/attendance', icon: '📋', label: 'Attendance' },
    { href: '/student/face',       icon: '📸', label: 'Face'       },
    { href: '/student/profile',    icon: '👤', label: 'Profile'    },
  ];
  const isActive = (href: string) =>
    href === '/student' ? pathname === '/student' : pathname.startsWith(href);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-surface-1 border-t border-border">
      <div className="flex items-center justify-around py-2 max-w-lg mx-auto">
        {tabs.map(tab => {
          const active = isActive(tab.href);
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors ${
                active ? 'text-primary' : 'text-muted'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

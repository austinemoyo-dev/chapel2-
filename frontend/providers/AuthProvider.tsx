'use client';
// ============================================================================
// Auth Provider — Global auth context with JWT management and role access.
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authService, type LoginResponse } from '@/lib/api/authService';
import { decodeJWT } from '@/lib/utils/jwt';
import {
  ADMIN_PERMISSIONS,
  STORAGE_KEYS,
  ROLE_REDIRECTS,
  ROLES,
  type AdminPermission,
  type UserRole,
} from '@/lib/utils/constants';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  admin_permissions?: Partial<Record<AdminPermission, boolean>>;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    options?: { allowedRoles?: UserRole[]; redirectTo?: string }
  ) => Promise<User>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: AdminPermission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // SSR-safe one-shot hydration from localStorage on mount.
  // setState-in-effect is intentional here — there's no external store to
  // subscribe to and the value can only be read on the client.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.USER);
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (stored && token) {
        const payload = decodeJWT(token);
        if (payload && payload.exp > Date.now() / 1000) {
          setUser(JSON.parse(stored));
        } else {
          localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
        }
      }
    } catch {
      // Ignore parse errors
    }
    setIsLoading(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const login = useCallback(async (
    email: string,
    password: string,
    options: { allowedRoles?: UserRole[]; redirectTo?: string } = {}
  ) => {
    // Generate device fingerprint for auto-binding
    let deviceId: string | undefined;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (stored) {
        deviceId = stored;
      } else {
        // Generate and store device fingerprint
        const nav = navigator;
        const scr = window.screen;
        const raw = [nav.userAgent, nav.language, scr.width, scr.height, scr.colorDepth, new Date().getTimezoneOffset()].join('|');
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
          hash = ((hash << 5) - hash) + raw.charCodeAt(i);
          hash |= 0;
        }
        deviceId = `DEV-${Math.abs(hash).toString(36).toUpperCase()}`;
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
    }

    const data: LoginResponse = await authService.login({ email, password, device_id: deviceId });

    if (options.allowedRoles && !options.allowedRoles.includes(data.user.role)) {
      throw new Error('This account is not allowed to use this login page.');
    }

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
    setUser(data.user);
    // Redirect based on role
    const redirect = options.redirectTo || ROLE_REDIRECTS[data.user.role] || '/';
    router.push(redirect);
    return data.user;
  }, [router]);

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (refresh) await authService.logout(refresh);
    } catch {
      // Ignore logout errors — still clear local state
    }
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setUser(null);
    router.push('/');
  }, [router]);

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  const hasPermission = useCallback((permission: AdminPermission) => {
    if (!user) return false;
    if (user.role === ROLES.SUPERADMIN) return true;
    if (user.role !== ROLES.ADMIN) return false;

    // Backward-compatible default: older login payloads may not include the
    // permission JSON yet, so let Admins keep legacy broad access until the
    // backend returns explicit permissions.
    if (!user.admin_permissions) {
      return Object.values(ADMIN_PERMISSIONS).includes(permission);
    }

    return user.admin_permissions[permission] === true;
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      hasRole,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

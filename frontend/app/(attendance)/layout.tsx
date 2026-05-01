'use client';

import { useAuth } from '@/providers/AuthProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { ROLES } from '@/lib/utils/constants';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, hasRole } = useAuth();
  const isOnline = useOnlineStatus();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !hasRole(ROLES.PROTOCOL_MEMBER)) {
      router.replace('/protocol-member/login');
    }
  }, [isLoading, hasRole, router]);

  if (isLoading || !user) return null;

  return (
    <div className="min-h-dvh bg-background relative">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="sticky top-0 z-50 bg-warning-muted border-b border-warning/30 px-4 py-2 text-center">
          <span className="text-sm font-medium text-warning">⚡ Offline Mode Active</span>
        </div>
      )}
      {children}
    </div>
  );
}

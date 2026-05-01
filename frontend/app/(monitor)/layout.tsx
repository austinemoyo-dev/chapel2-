'use client';

import { useAuth } from '@/providers/AuthProvider';
import { ROLES } from '@/lib/utils/constants';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !hasRole(ROLES.SUPERADMIN, ROLES.PROTOCOL_ADMIN)) {
      router.replace('/protocol-admin/login');
    }
  }, [isLoading, hasRole, router]);

  return <div className="min-h-dvh bg-background">{children}</div>;
}

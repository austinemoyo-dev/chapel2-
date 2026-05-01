'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js once the app boots in the browser.
 * Listens for SYNC_ATTENDANCE messages from the service worker's
 * background-sync handler and triggers a foreground sync.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const onMessage = async (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_ATTENDANCE') {
        const { syncOfflineRecords } = await import('@/lib/offline/syncManager');
        try { await syncOfflineRecords(); } catch { /* swallow — retried on next online event */ }
      }
    };

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failed (private mode, blocked by extension, etc.) — non-fatal
    });
    navigator.serviceWorker.addEventListener('message', onMessage);

    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}

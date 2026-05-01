'use client';
// ============================================================================
// useDeviceId — Generate/retrieve persistent device fingerprint.
// ============================================================================

import { useState, useEffect } from 'react';
import { STORAGE_KEYS } from '@/lib/utils/constants';

function generateDeviceId(): string {
  const nav = navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join('|');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `DEV-${Math.abs(hash).toString(36).toUpperCase()}`;
}

export function useDeviceId() {
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    let stored = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!stored) {
      stored = generateDeviceId();
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, stored);
    }
    // SSR-safe one-shot hydration from localStorage. The lint rule complains
    // about setState-in-effect, but there's no external store to subscribe to —
    // the value is owned by this hook for the rest of the session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceId(stored);
  }, []);

  return deviceId;
}

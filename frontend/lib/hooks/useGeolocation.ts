'use client';
// ============================================================================
// useGeolocation — GPS permission, watch position, attach to attendance.
// ============================================================================

import { useState, useEffect } from 'react';

interface GeoState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  permissionDenied: boolean;
}

const INITIAL: GeoState = {
  latitude: null,
  longitude: null,
  accuracy: null,
  error: null,
  loading: true,
  permissionDenied: false,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>(INITIAL);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ ...INITIAL, error: 'Geolocation not supported', loading: false });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          error: null,
          loading: false,
          permissionDenied: false,
        });
      },
      (err) => {
        setState((s) => ({
          ...s,
          error: err.message,
          loading: false,
          permissionDenied: err.code === err.PERMISSION_DENIED,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}

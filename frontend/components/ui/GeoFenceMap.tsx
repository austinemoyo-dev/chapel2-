'use client';

// ============================================================================
// GeoFenceMap — Interactive map for picking chapel location + radius.
// Features: My Location, layer switcher (Street/Satellite/Dark), search,
//           click-to-place, draggable marker, radius slider, GPS accuracy.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface GeoFenceMapProps {
  latitude: number;
  longitude: number;
  radius: number;
  onLocationChange: (lat: number, lng: number) => void;
  onRadiusChange: (radius: number) => void;
}

// Tile layers
const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
};

type LayerKey = keyof typeof TILE_LAYERS;

const MARKER_HTML = `<div style="
  width:28px;height:28px;
  background:linear-gradient(135deg,#6366f1,#8b5cf6);
  border-radius:50% 50% 50% 0;
  transform:rotate(-45deg);
  border:3px solid white;
  box-shadow:0 4px 12px rgba(99,102,241,0.5);
"></div>`;

const MY_LOC_HTML = `<div style="
  width:16px;height:16px;
  background:#3b82f6;
  border-radius:50%;
  border:3px solid white;
  box-shadow:0 0 0 4px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3);
  animation: pulse-blue 2s infinite;
"></div>
<style>
@keyframes pulse-blue {
  0%,100% { box-shadow:0 0 0 4px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3); }
  50% { box-shadow:0 0 0 10px rgba(59,130,246,0.1), 0 2px 8px rgba(0,0,0,0.3); }
}
</style>`;

export default function GeoFenceMap({
  latitude,
  longitude,
  radius,
  onLocationChange,
  onRadiusChange,
}: GeoFenceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const myLocMarkerRef = useRef<L.Marker | null>(null);
  const myLocCircleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerKey>('dark');

  const markerIcon = L.divIcon({
    className: '',
    html: MARKER_HTML,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

  // Place or move chapel marker + fence circle
  const placeMarker = useCallback((lat: number, lng: number, map: L.Map) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const m = L.marker([lat, lng], { icon: markerIcon, draggable: true }).addTo(map);
      m.on('dragend', () => {
        const p = m.getLatLng();
        onLocationChange(p.lat, p.lng);
        circleRef.current?.setLatLng(p);
      });
      markerRef.current = m;
    }

    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng]);
    } else {
      circleRef.current = L.circle([lat, lng], {
        radius,
        color: '#6366f1',
        fillColor: '#6366f1',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6 4',
      }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, onLocationChange]);

  // ── Initialize map ──
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const center: [number, number] = (latitude && longitude)
      ? [latitude, longitude]
      : [6.5244, 3.3792]; // Default: Lagos

    const map = L.map(mapRef.current, {
      center,
      zoom: latitude ? 16 : 12,
      zoomControl: false,
    });

    // Zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initial tile layer
    const tl = L.tileLayer(TILE_LAYERS.dark.url, {
      attribution: TILE_LAYERS.dark.attribution,
      maxZoom: 20,
    }).addTo(map);
    tileLayerRef.current = tl;

    // Place marker if we already have coordinates
    if (latitude && longitude) {
      placeMarker(latitude, longitude, map);
    }

    // Click to set location
    map.on('click', (e: L.LeafletMouseEvent) => {
      onLocationChange(e.latlng.lat, e.latlng.lng);
      placeMarker(e.latlng.lat, e.latlng.lng, map);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      tileLayerRef.current = null;
      myLocMarkerRef.current = null;
      myLocCircleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync radius ──
  useEffect(() => { circleRef.current?.setRadius(radius); }, [radius]);

  // ── Sync position ──
  useEffect(() => {
    if (!latitude || !longitude) return;
    markerRef.current?.setLatLng([latitude, longitude]);
    circleRef.current?.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  // ── Switch tile layer ──
  function switchLayer(key: LayerKey) {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const cfg = TILE_LAYERS[key];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: 20,
    }).addTo(map);
    setActiveLayer(key);
  }

  // ── My Location ──
  function handleMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const map = mapInstanceRef.current;
        if (!map) { setLocating(false); return; }

        // Fly to position
        map.flyTo([lat, lng], 17, { duration: 1.5 });

        // Show blue "my location" dot
        const myIcon = L.divIcon({
          className: '',
          html: MY_LOC_HTML,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        if (myLocMarkerRef.current) {
          myLocMarkerRef.current.setLatLng([lat, lng]);
        } else {
          myLocMarkerRef.current = L.marker([lat, lng], {
            icon: myIcon,
            interactive: false,
          }).addTo(map);
        }

        // GPS accuracy circle
        if (myLocCircleRef.current) {
          myLocCircleRef.current.setLatLng([lat, lng]);
          myLocCircleRef.current.setRadius(accuracy);
        } else {
          myLocCircleRef.current = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.08,
            weight: 1,
          }).addTo(map);
        }

        // Set as chapel location
        onLocationChange(lat, lng);
        placeMarker(lat, lng, map);
        setLocating(false);
      },
      () => { setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ── Search ──
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([lat, lng], 16, { duration: 1.2 });
          onLocationChange(lat, lng);
          placeMarker(lat, lng, map);
        }
      }
    } catch { /* silent */ }
    finally { setSearching(false); }
  }

  const LAYER_BUTTONS: { key: LayerKey; label: string; icon: string }[] = [
    { key: 'dark', label: 'Dark', icon: '🌙' },
    { key: 'street', label: 'Street', icon: '🗺️' },
    { key: 'satellite', label: 'Satellite', icon: '🛰️' },
  ];

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search location..."
            className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary transition-colors pr-10"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">🔍</span>
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2 bg-primary/90 text-white rounded-xl text-sm font-medium hover:bg-primary transition-colors disabled:opacity-50"
        >
          {searching ? '...' : 'Search'}
        </button>
      </div>

      {/* Map container */}
      <div className="relative rounded-2xl overflow-hidden border border-border shadow-lg">
        <div ref={mapRef} className="w-full h-[400px]" />

        {/* "My Location" floating button */}
        <button
          onClick={handleMyLocation}
          disabled={locating}
          className="absolute top-3 right-3 z-[1000] bg-surface/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 text-sm font-medium shadow-lg hover:bg-surface-2 transition-all flex items-center gap-1.5 disabled:opacity-50"
          title="Go to my current location"
        >
          {locating ? (
            <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-base">📍</span>
          )}
          <span className="hidden sm:inline">My Location</span>
        </button>

        {/* Layer switcher */}
        <div className="absolute bottom-3 left-3 z-[1000] flex gap-1 bg-surface/90 backdrop-blur-sm border border-border rounded-xl p-1 shadow-lg">
          {LAYER_BUTTONS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => switchLayer(key)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                activeLayer === key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-foreground hover:bg-surface-2'
              }`}
            >
              <span>{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Overlay hint when no location set */}
        {!latitude && !longitude && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-[999]">
            <div className="bg-surface/90 backdrop-blur-sm rounded-xl px-5 py-4 text-sm text-center max-w-xs">
              <p className="text-lg mb-1">📍</p>
              <p className="font-medium">Set Chapel Location</p>
              <p className="text-xs text-muted mt-1">Click &quot;My Location&quot; or tap the map to place a pin</p>
            </div>
          </div>
        )}
      </div>

      {/* Radius slider */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⭕</span>
            <label className="text-sm font-medium">Geo-fence Radius</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="50"
              max="1000"
              value={radius}
              onChange={(e) => onRadiusChange(Math.max(50, Math.min(1000, parseInt(e.target.value) || 50)))}
              className="w-16 text-right text-sm font-bold bg-surface border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-primary"
            />
            <span className="text-sm text-muted font-medium">meters</span>
          </div>
        </div>
        <input
          type="range"
          min="50"
          max="1000"
          step="10"
          value={radius}
          onChange={(e) => onRadiusChange(parseInt(e.target.value))}
          className="w-full h-2 bg-surface rounded-full appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>50m (tight)</span>
          <span>500m</span>
          <span>1000m (wide)</span>
        </div>
      </div>

      {/* Coordinates display */}
      {(latitude !== 0 || longitude !== 0) && (
        <div className="flex flex-wrap gap-3 text-xs text-muted bg-surface-2 rounded-xl px-4 py-2.5 border border-border">
          <span>📍 Lat: <code className="text-foreground font-mono">{latitude.toFixed(6)}</code></span>
          <span>Lng: <code className="text-foreground font-mono">{longitude.toFixed(6)}</code></span>
          <span>⭕ Radius: <code className="text-foreground font-mono">{radius}m</code></span>
        </div>
      )}
    </div>
  );
}

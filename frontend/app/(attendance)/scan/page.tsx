'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useCamera } from '@/lib/hooks/useCamera';
import { useGeolocation } from '@/lib/hooks/useGeolocation';
import { useDeviceId } from '@/lib/hooks/useDeviceId';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { attendanceService, type EmbeddingEntry } from '@/lib/api/attendanceService';
import { serviceService, type Service } from '@/lib/api/serviceService';
import { cacheEmbeddings, getCachedEmbeddings, getQueueCount, addToQueue } from '@/lib/offline/db';
import { syncOfflineRecords, registerBackgroundSync } from '@/lib/offline/syncManager';
import { downloadAndCacheModel, isModelReady, extractEmbedding } from '@/lib/offline/faceModel';
import { alignFace, imageDataToFloat32 } from '@/lib/offline/facePreprocess';
import { buildNormalisedPool, matchNormalised, matchOffline, type NormalisedPool } from '@/lib/offline/offlineMatcher';
import { LIVENESS_CHALLENGES } from '@/lib/utils/constants';
import { ApiError } from '@/lib/api/client';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';

type ScanPhase = 'select_service' | 'ready' | 'liveness' | 'scanning' | 'result';
type ResultType = 'success' | 'already_marked' | 'failed' | 'offline_unavailable';

export default function ScanPage() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const { videoRef, canvasRef, overlayRef, start, stop, captureFrame, isActive, error, analyzeFrame, modelsLoaded, availableCameras, activeCameraId, switchCamera } = useCamera({
    facingMode: 'environment',
    width: 1280,
    height: 720,
  });
  const geo = useGeolocation();
  const deviceId = useDeviceId();
  const isOnline = useOnlineStatus();

  const [phase, setPhase] = useState<ScanPhase>('select_service');
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [embeddings, setEmbeddings] = useState<EmbeddingEntry[]>([]);
  const [mode, setMode] = useState<'sign_in' | 'sign_out'>('sign_in');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ type: ResultType; name: string; message: string } | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);

  // Offline model state
  const [offlineReady, setOfflineReady]           = useState(false);
  const [modelDownloadPct, setModelDownloadPct]   = useState<number | null>(null);
  // Stores the most recent MediaPipe landmarks so handleCapture() can use
  // them for face alignment without re-running detection.
  const lastLandmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);

  // Pre-normalised embedding pool — rebuilt once when embeddings load, then
  // reused on every scan. Eliminates IndexedDB reads and per-scan normalisation.
  const normPoolRef = useRef<NormalisedPool[]>([]);
  useEffect(() => {
    normPoolRef.current = buildNormalisedPool(embeddings);
  }, [embeddings]);

  // Liveness
  const [livenessChallenge, setLivenessChallenge] = useState<typeof LIVENESS_CHALLENGES[number] | null>(null);
  const [livenessProgress, setLivenessProgress]   = useState(0); // 0–100
  const livenessDeadlineRef  = useRef<number | null>(null);
  const livenessPassRef      = useRef(false);
  const livenessChallengeRef = useRef<typeof LIVENESS_CHALLENGES[number] | null>(null); // readable inside interval

  const analysisLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef    = useRef<number | null>(null);
  const phaseRef        = useRef(phase);
  // Ref so handleSelectService can read the live value without being recreated
  // every time isOnline flips — which would re-trigger the services useEffect.
  const isOnlineRef = useRef(isOnline);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // Countdown timer for service window
  useEffect(() => {
    if (!selectedService) { setWindowCountdown(null); setWindowClosed(false); return; }
    const tick = () => {
      const now = Date.now();
      const closeMs = new Date(selectedService.window_close_time).getTime();
      const openMs  = new Date(selectedService.window_open_time).getTime();
      if (now >= closeMs) { setWindowClosed(true); setWindowCountdown(null); return; }
      setWindowClosed(false);
      const diffMs  = (now < openMs ? openMs : closeMs) - now;
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      const label = now < openMs ? 'Opens in' : 'Closes in';
      setWindowCountdown(`${label} ${h > 0 ? `${h}h ` : ''}${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [selectedService]);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState('Select a service to prepare attendance.');
  const [windowCountdown, setWindowCountdown] = useState<string | null>(null);
  const [windowClosed, setWindowClosed] = useState(false);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const syncResult = await syncOfflineRecords();
      setPendingSync(0);
      registerBackgroundSync();
      addToast(`Sync complete: ${syncResult.accepted} accepted, ${syncResult.rejected} rejected`, 'success');
      if (syncResult.errors.length > 0) {
        addToast(syncResult.errors.slice(0, 2).join('; '), 'warning');
      }
    } catch {
      addToast('Sync failed. It will retry when online.', 'error');
    } finally {
      setSyncing(false);
    }
  }, [addToast]);

  // Ref pointing to the latest handleSelectService — lets the services effect
  // call it without listing it as a dependency (which would cause the effect
  // to re-run every time addToast or isOnline changes reference).
  const handleSelectServiceRef = useRef<(svc: Service) => Promise<void>>(async () => {});

  const handleSelectService = useCallback(async (service: Service) => {
    setSelectedService(service);
    setPhase('ready');
    setEmbeddingLoading(true);
    setEmbeddingStatus('Downloading student face data...');

    try {
      if (isOnlineRef.current) {
        setEmbeddingStatus('Connecting to server...');
        const data = await attendanceService.getEmbeddings(service.id);
        setEmbeddingStatus(`Processing ${data.student_count} student embeddings...`);
        setEmbeddings(data.embeddings);
        await cacheEmbeddings({
          service_id: service.id,
          embeddings: data.embeddings,
          cached_at: new Date().toISOString(),
        });
        setEmbeddingStatus(`${data.student_count} embeddings ready.`);
        addToast(`Loaded ${data.student_count} student embeddings`, 'info');
      } else {
        setEmbeddingStatus('Loading cached data...');
        const cached = await getCachedEmbeddings(service.id);
        if (cached) {
          setEmbeddings(cached.embeddings);
          setEmbeddingStatus(`${cached.embeddings.length} cached student records found.`);
          addToast('Using cached embeddings for offline mode.', 'warning');
        } else {
          setEmbeddings([]);
          setEmbeddingStatus('No cached embeddings for this service.');
        }
      }
    } catch {
      setEmbeddingStatus('Could not load embeddings. Online scans may still work through the backend.');
      addToast('Failed to load embeddings', 'error');
    } finally {
      setEmbeddingLoading(false);
    }
  }, [addToast]); // isOnline read from ref — no re-creation on connectivity change

  // Keep the ref pointing at the latest version of the callback.
  useEffect(() => { handleSelectServiceRef.current = handleSelectService; }, [handleSelectService]);

  // Load services ONCE on mount. Uses the ref so stale-closure is never an issue.
  // Must NOT depend on handleSelectService — any change to that function would
  // re-run this effect, re-fetch services, and flash the loading overlay again.
  useEffect(() => {
    serviceService.listServices({ is_cancelled: 'false' }).then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      const now = new Date().toISOString();
      const open = list.filter((s) => {
        const signInOpen  = s.window_open_time <= now && s.window_close_time >= now;
        const signOutOpen = s.signout_open_time && s.signout_close_time
          ? s.signout_open_time <= now && s.signout_close_time >= now
          : false;
        return signInOpen || signOutOpen;
      });

      setServicesLoaded(true);
      if (open.length === 1) {
        setServices(open);
        void handleSelectServiceRef.current(open[0]);
      } else if (open.length > 1) {
        setServices(open);
      } else {
        setServices([]);
      }
    }).catch(() => {
      setServices([]);
      setServicesLoaded(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const updateCount = () => {
      getQueueCount().then(setPendingSync).catch(() => {});
    };
    updateCount();
    const interval = window.setInterval(updateCount, 5000);
    return () => window.clearInterval(interval);
  }, []);

  // Download the ArcFace ONNX model in the background as soon as the scanner
  // mounts (while the device is still online). This makes offline matching
  // available mid-service without any extra action from the protocol member.
  useEffect(() => {
    let cancelled = false;
    isModelReady().then((ready) => {
      if (cancelled) return;
      if (ready) {
        setOfflineReady(true);
        setModelDownloadPct(100);
        return;
      }
      // Not cached yet — download now (background, non-blocking)
      setModelDownloadPct(0);
      downloadAndCacheModel((pct) => {
        if (!cancelled) setModelDownloadPct(pct);
      })
        .then(() => {
          if (!cancelled) {
            setOfflineReady(true);
            setModelDownloadPct(100);
            attendanceService.reportModelReady().catch(() => {});
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('[OfflineModel] Download failed:', err);
            setModelDownloadPct(null); // hide progress bar on failure
          }
        });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isOnline && pendingSync > 0 && !syncing) {
      const timer = window.setTimeout(() => {
        void handleSync();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isOnline, pendingSync, syncing, handleSync]);

  // Silently refresh embeddings when the device comes back online.
  // Tracks the previous isOnline value so we only act on the false→true edge,
  // not on initial mount (where isOnline may already be true).
  const selectedServiceRef = useRef(selectedService);
  useEffect(() => { selectedServiceRef.current = selectedService; }, [selectedService]);
  const prevIsOnlineRef = useRef(isOnline);

  useEffect(() => {
    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;

    if (!isOnline || !wasOffline) return; // only act on the offline→online transition
    const svc = selectedServiceRef.current;
    if (!svc) return;

    attendanceService.getEmbeddings(svc.id)
      .then(async (data) => {
        setEmbeddings(data.embeddings);
        await cacheEmbeddings({
          service_id: svc.id,
          embeddings: data.embeddings,
          cached_at: new Date().toISOString(),
        });
      })
      .catch(() => {}); // silent — cached embeddings are still usable
  }, [isOnline]);

  // Start the camera AFTER the camera view is rendered so videoRef.current
  // is non-null when start() runs and can attach the stream to the <video>.
  useEffect(() => {
    if (phase === 'ready' && !isActive) {
      void start();
    }
    // Stop camera when leaving camera phases
    if (phase === 'select_service' && isActive) {
      stop();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps



  // ── Check if the liveness challenge blendshape condition is met ────────────
  const checkLivenessAction = useCallback((
    challenge: typeof LIVENESS_CHALLENGES[number],
    blendshapes: Record<string, number>,
    headYaw: number,
  ): boolean => {
    switch (challenge.id) {
      case 'blink':
        return Math.max(blendshapes['eyeBlinkLeft'] ?? 0, blendshapes['eyeBlinkRight'] ?? 0) > 0.65;
      case 'smile':
        return (blendshapes['mouthSmileLeft'] ?? 0) > 0.45 && (blendshapes['mouthSmileRight'] ?? 0) > 0.45;
      case 'turn_left':
        // Student turns left → nose moves right in image (positive yaw)
        return headYaw > 0.10;
      case 'turn_right':
        // Student turns right → nose moves left in image (negative yaw)
        return headYaw < -0.10;
      case 'nod':
        // Approximate nod via jaw opening
        return (blendshapes['jawOpen'] ?? 0) > 0.25;
      default:
        return false;
    }
  }, []);

  useEffect(() => {
    if (!isActive || phase === 'select_service' || !modelsLoaded || !selectedService) return;

    const LIVENESS_TIMEOUT_MS = 5000;
    let isAnalyzing = false;

    analysisLoopRef.current = setInterval(async () => {
      if (isAnalyzing) return;
      isAnalyzing = true;
      try {
        const currentPhase = phaseRef.current;
        if (currentPhase !== 'ready' && currentPhase !== 'liveness') return;

        const analysis = await analyzeFrame();
        if (!analysis) return;

        const { skinToneRatio, isStable, blendshapes, headYaw, landmarks } = analysis;
        // Always keep the latest landmarks so handleCapture() can use them
        // for face alignment during offline matching without re-running detection.
        if (landmarks) lastLandmarksRef.current = landmarks;
        const hasFace = skinToneRatio >= 0.5;
        setFaceDetected(hasFace);

        // ── READY: wait for a stable face, then auto-capture ────
        if (currentPhase === 'ready') {
          if (hasFace && isStable) {
            if (!holdStartRef.current) {
              holdStartRef.current = Date.now();
            } else if (Date.now() - holdStartRef.current >= 200) { // reduced from 400ms to 200ms
              holdStartRef.current = null;
              // Skip liveness challenge for protocol scanners to maximize speed
              setPhase('scanning');
              void handleCapture();
            }
          } else {
            holdStartRef.current = null;
          }
          return;
        }

        // ── LIVENESS: verify the challenge via blendshapes ───────────────────
        if (currentPhase === 'liveness') {
          const deadline = livenessDeadlineRef.current ?? 0;
          const remaining = deadline - Date.now();

          // Update progress bar (100 → 0 as time runs out)
          setLivenessProgress(Math.max(0, Math.round((remaining / LIVENESS_TIMEOUT_MS) * 100)));

          // Timeout — reset to ready
          if (remaining <= 0) {
            livenessDeadlineRef.current  = null;
            livenessChallengeRef.current = null;
            setLivenessChallenge(null);
            setLivenessProgress(0);
            setPhase('ready');
            holdStartRef.current = null;
            return;
          }

          if (!hasFace) return;
          if (livenessPassRef.current) return; // already passed, waiting for capture

          // Use the ref — state is stale inside setInterval closures
          const activeChallenge = livenessChallengeRef.current;
          if (!activeChallenge) return;

          const passed = checkLivenessAction(activeChallenge, blendshapes, headYaw);
          if (passed) {
            livenessPassRef.current      = true;
            livenessDeadlineRef.current  = null;
            livenessChallengeRef.current = null;
            setLivenessChallenge(null);
            setLivenessProgress(0);
            setPhase('scanning');
            void handleCapture();
          }
        }
      } finally {
        isAnalyzing = false;
      }
    }, 120);

    return () => {
      if (analysisLoopRef.current) clearInterval(analysisLoopRef.current);
    };
  }, [isActive, phase, modelsLoaded, selectedService, analyzeFrame, checkLivenessAction]);

  async function handleCapture() {
    if (!selectedService || scanning) return;
    setScanning(true);

    if (!isOnline) {
      // ── Offline face matching path ──────────────────────────────────────────
      if (!offlineReady) {
        setResult({
          type: 'failed',
          name: '',
          message: modelDownloadPct !== null
            ? `Offline model downloading… ${modelDownloadPct}%. Please wait or reconnect.`
            : 'Offline model not ready. Please reconnect to Wi-Fi.',
        });
        setScanning(false);
        setPhase('result');
        scheduleAutoReset('failed');
        return;
      }

      if (geo.latitude === null || geo.longitude === null || !deviceId) {
        setResult({ type: 'failed', name: '', message: 'GPS or device ID missing.' });
        setScanning(false);
        setPhase('result');
        scheduleAutoReset('failed');
        return;
      }

      let offlineSucceeded = false;
      try {
        const embedding = await extractCurrentFaceEmbedding();

        // Use pre-normalised in-memory pool when ready (fast path).
        // Fall back to IndexedDB read if the pool hasn't been built yet
        // (e.g. first scan fires before the useEffect has run).
        const normPool = normPoolRef.current;
        let match;
        if (normPool.length > 0) {
          match = matchNormalised(embedding, normPool);
        } else {
          const cached = await getCachedEmbeddings(selectedService.id);
          if (!cached || !cached.embeddings || cached.embeddings.length === 0) {
            setResult({ type: 'failed', name: '', message: 'No cached student embeddings. Select service again while online.' });
            setScanning(false);
            setPhase('result');
            scheduleAutoReset('failed');
            return;
          }
          match = matchOffline(embedding, cached);
        }
        if (!match.matched || !match.student_id) {
          setResult({ type: 'failed', name: '', message: 'Face not recognised offline. Please try again.' });
          setScanning(false);
          setPhase('result');
          scheduleAutoReset('failed');
          return;
        }

        // Queue the record for sync when back online
        await addToQueue({
          id:                 crypto.randomUUID(),
          student_id:         match.student_id,
          service_id:         selectedService.id,
          attendance_type:    mode,
          timestamp:          new Date().toISOString(),
          gps_lat:            parseFloat(geo.latitude.toFixed(7)),
          gps_lng:            parseFloat(geo.longitude.toFixed(7)),
          device_id:          deviceId,
          protocol_member_id: user?.id ?? '',
          created_at:         new Date().toISOString(),
        });

        setPendingSync((n) => n + 1);
        offlineSucceeded = true;
        setResult({
          type:    'success',
          name:    match.student_name ?? '',
          message: '📵 Offline — will sync when back online',
        });
      } catch (err) {
        console.error('[OfflineMatch]', err);
        setResult({
          type: 'failed',
          name: '',
          message: err instanceof Error ? err.message : 'Offline matching error. Please retry.',
        });
      }

      setScanning(false);
      setPhase('result');
      scheduleAutoReset(offlineSucceeded ? 'success' : 'failed');
      return;
    }

    if (geo.latitude === null || geo.longitude === null || !deviceId) {
      setResult({ type: 'failed', name: '', message: 'GPS and device identity are required before scanning.' });
      setScanning(false);
      setPhase('result');
      scheduleAutoReset('failed');
      return;
    }
    const gpsLat = parseFloat(geo.latitude.toFixed(7));
    const gpsLng = parseFloat(geo.longitude.toFixed(7));

    try {
      const endpoint = mode === 'sign_in' ? attendanceService.signIn : attendanceService.signOut;

      // Always upload the image when online so the server runs InsightFace on it.
      // The locally-extracted ONNX embedding uses MediaPipe alignment which differs
      // from InsightFace's internal alignment, causing all matches to fail.
      const file = captureFrame();
      if (!file) {
        setResult({ type: 'failed', name: '', message: 'Camera frame was not captured. Please retry.' });
        setPhase('result');
        scheduleAutoReset('failed');
        return;
      }

      const response = await endpoint({
        service_id: selectedService.id,
        face_image: file,
        device_id: deviceId,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
      });

      const r: typeof result = {
        type: 'success',
        name: response.student_name || '',
        message: response.message,
      };
      setResult(r);
      setPhase('result');
      scheduleAutoReset('success');
    } catch (err) {
      const type: ResultType = err instanceof ApiError && err.status === 409
        ? 'already_marked'
        : 'failed';
      setResult({
        type,
        name: err instanceof ApiError ? ((err.data.student_name as string) || '') : '',
        message: err instanceof ApiError ? err.message : 'Scan failed. Please retry.',
      });
      setPhase('result');
      scheduleAutoReset(type);
    } finally {
      setScanning(false);
    }
  }

  function resetScan() {
    setResult(null);
    setPhase('ready');
    holdStartRef.current = null;
  }

  // Auto-reset delays:
  //   1500ms on success — name flashes clearly, scanner resets quickly
  //   1500ms on warning/error — rejection reason visible before next scan
  function scheduleAutoReset(resultType: ResultType) {
    const delay = resultType === 'success' ? 1500 : 1500;
    setTimeout(() => {
      if (phaseRef.current === 'result') resetScan();
    }, delay);
  }

  async function extractCurrentFaceEmbedding(): Promise<Float32Array> {
    const video = videoRef.current;
    const landmarks = lastLandmarksRef.current;
    if (!video) {
      throw new Error('Camera video is not ready.');
    }
    if (!landmarks || landmarks.length < 400) {
      throw new Error('No face landmarks detected.');
    }

    const vw = video.videoWidth  || 640;
    const vh = video.videoHeight || 480;
    const aligned = alignFace(video, landmarks, vw, vh);
    if (!aligned) {
      throw new Error('Could not align face.');
    }

    const tensor = imageDataToFloat32(aligned);
    return extractEmbedding(tensor);
  }

  const gpsReady = geo.latitude !== null && geo.longitude !== null && !geo.permissionDenied;
  const canScan = isActive && gpsReady && !!deviceId && !!selectedService && !scanning && (isOnline || offlineReady);

  if (phase === 'select_service') {
    return (
      <div className="min-h-dvh flex flex-col p-6 animate-fade-in bg-background">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Protocol Scanner</h1>
            <p className="text-sm font-medium text-muted mt-1">{user?.full_name}</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingSync > 0 && (
              <button
                className="px-4 py-2 rounded-2xl bg-primary/10 text-primary border border-primary/20 text-sm font-bold shadow-sm"
                onClick={() => void handleSync()}
                disabled={syncing}
              >
                {syncing ? 'Syncing...' : `Sync (${pendingSync})`}
              </button>
            )}
            <button className="w-10 h-10 rounded-2xl bg-surface border border-border flex items-center justify-center text-muted hover:text-foreground transition-colors shadow-sm" onClick={logout}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>

        <div className="flex bg-surface-2 rounded-2xl p-1 mb-6 border border-border shadow-inner">
          <button
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              mode === 'sign_in' ? 'bg-white text-primary shadow-sm border border-border/50' : 'text-muted hover:text-foreground'
            }`}
            onClick={() => setMode('sign_in')}
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              mode === 'sign_out' ? 'bg-white text-primary shadow-sm border border-border/50' : 'text-muted hover:text-foreground'
            }`}
            onClick={() => setMode('sign_out')}
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="flex flex-col gap-1 p-4 rounded-3xl bg-surface border border-border shadow-sm relative overflow-hidden">
            <div className={`absolute -top-4 -right-4 w-12 h-12 rounded-full blur-xl ${isOnline ? 'bg-success/20' : 'bg-warning/20'}`} />
            <p className="text-xs font-bold text-muted uppercase tracking-widest">Network</p>
            <p className={`text-base font-black ${isOnline ? 'text-success' : 'text-warning'}`}>{isOnline ? 'Online' : 'Offline Mode'}</p>
          </div>
          <div className="flex flex-col gap-1 p-4 rounded-3xl bg-surface border border-border shadow-sm relative overflow-hidden">
            <div className={`absolute -top-4 -right-4 w-12 h-12 rounded-full blur-xl ${gpsReady ? 'bg-success/20' : 'bg-warning/20'}`} />
            <p className="text-xs font-bold text-muted uppercase tracking-widest">GPS Fix</p>
            <p className={`text-base font-black ${gpsReady ? 'text-success' : 'text-warning'}`}>
              {gpsReady ? `${Math.round(geo.accuracy || 0)}m Accuracy` : 'Locating...'}
            </p>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-muted uppercase tracking-wider">
              {services.length > 1 ? 'Available Services' : 'Active Service'}
            </h2>
            {services.length > 1 && (
              <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-bold border border-primary/20">
                {services.length} Open
              </span>
            )}
          </div>

          {!servicesLoaded ? (
            <div className="text-center py-12 flex flex-col items-center">
              <Spinner size="lg" />
              <p className="mt-4 text-sm font-medium text-muted">Scanning schedule...</p>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-12 px-6 rounded-[2rem] bg-surface border border-border shadow-sm">
              <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-base font-bold text-foreground">No active services right now</p>
              <p className="text-sm text-muted mt-2 leading-relaxed">Wait for a service window to open or contact the Superadmin.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {services.map((s) => {
                const signInOpen  = s.window_open_time <= new Date().toISOString() && s.window_close_time >= new Date().toISOString();
                const signOutOpen = s.signout_open_time && s.signout_close_time
                  ? (s.signout_open_time as string) <= new Date().toISOString() && (s.signout_close_time as string) >= new Date().toISOString()
                  : false;
                const windowLabel = signInOpen && signOutOpen
                  ? 'Sign-In & Sign-Out'
                  : signOutOpen
                  ? 'Sign-Out Only'
                  : 'Sign-In Active';

                return (
                  <button
                    key={s.id}
                    onClick={() => void handleSelectService(s)}
                    className="w-full text-left p-5 rounded-[2rem] bg-surface border border-border hover:border-primary/50 transition-all hover:shadow-md group relative overflow-hidden card-lift"
                  >
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors pointer-events-none" />
                    <div className="flex justify-between items-start mb-6 relative z-10">
                      <div>
                        <p className="text-lg font-black text-foreground">{s.name || `${s.service_type} ${s.service_group}`}</p>
                        <p className="text-sm font-medium text-muted mt-1">{s.scheduled_date} · Group {s.service_group}</p>
                      </div>
                      <span className="bg-success-muted text-success text-xs font-bold px-3 py-1.5 rounded-xl border border-success/20">
                        {windowLabel}
                      </span>
                    </div>
                    <div className="flex items-center text-primary font-bold text-sm group-hover:text-primary-hover transition-colors relative z-10">
                      Start Scanning
                      <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Corner bracket colour based on current phase
  const cornerColor = phase === 'scanning'
    ? 'bg-primary shadow-[0_0_10px_rgba(124,58,237,0.8)]'
    : faceDetected
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
    : 'bg-white/50';

  return (
    <div className="h-dvh flex flex-col relative bg-black overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Vignette — darkens edges, keeps face area bright */}
      <div className="absolute inset-0 z-10 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 62% 68% at 50% 38%, transparent 20%, rgba(0,0,0,0.72) 100%)'
      }} />

      {/* ── Error Overlay ── */}
      {error && !isActive && (
        <div className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-6">
          <div className="bg-surface rounded-3xl p-6 max-w-sm w-full text-center border border-warning/30 shadow-2xl">
            <div className="w-14 h-14 bg-warning/15 rounded-2xl flex items-center justify-center mx-auto mb-4 text-warning">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-foreground font-bold mb-1">Camera Error</p>
            <p className="text-muted text-sm mb-5">{error}</p>
            <Button onClick={() => window.location.reload()} variant="primary" className="w-full">
              Reload Scanner
            </Button>
          </div>
        </div>
      )}

      {/* ── Embedding Loading Overlay ── */}
      {embeddingLoading && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <div className="w-[82%] max-w-xs bg-white/96 rounded-3xl p-6 shadow-2xl border border-border/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Loading Face Data</p>
                <p className="text-xs text-muted truncate">{embeddingStatus}</p>
              </div>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent rounded-full animate-pulse w-full" />
            </div>
          </div>
        </div>
      )}

      {/* ── Window closed banner ── */}
      {windowClosed && (
        <div className="absolute top-20 inset-x-4 z-30 pointer-events-none">
          <div className="bg-red-500/20 border border-red-500/40 backdrop-blur-sm px-4 py-3 rounded-2xl text-center">
            <p className="text-red-300 font-bold text-sm">Attendance window has closed</p>
            <p className="text-white/50 text-xs mt-0.5">No more scans can be recorded for this service</p>
          </div>
        </div>
      )}

      {/* ── Countdown timer ── */}
      {windowCountdown && !windowClosed && !embeddingLoading && (
        <div className="absolute top-20 inset-x-4 z-30 pointer-events-none">
          <div className="bg-black/40 border border-white/10 backdrop-blur-sm px-4 py-2 rounded-2xl flex items-center justify-between">
            <span className="text-white/60 text-xs font-medium">Window</span>
            <span className="text-white font-bold text-sm tabular-nums">{windowCountdown}</span>
          </div>
        </div>
      )}

      {/* ── Model download warning banner ── */}
      {!embeddingLoading && modelDownloadPct !== null && modelDownloadPct < 100 && (
        <div className="absolute top-20 inset-x-4 z-30 pointer-events-none">
          <div className="bg-amber-500/20 border border-amber-500/40 backdrop-blur-sm px-4 py-3 rounded-2xl">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-amber-300">⚠️ Stay connected — downloading offline capability</span>
              <span className="text-amber-300 font-bold">{Math.round(modelDownloadPct)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-300"
                style={{ width: `${modelDownloadPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Face Frame ── */}
      <div className="absolute inset-0 z-20 pointer-events-none flex justify-center"
           style={{ paddingTop: '16%', paddingBottom: '30%' }}>
        <div
          style={{ width: '62%', maxWidth: '230px', aspectRatio: '3/4' }}
          className={`relative transition-all duration-500 ease-out ${
            phase === 'scanning' ? 'scale-[1.04]' : faceDetected ? 'scale-[1.01]' : 'scale-100'
          } ${!faceDetected && phase === 'ready' ? 'scan-frame-idle' : ''}`}
        >
          {/* Top-left corner */}
          <div className="absolute top-0 left-0">
            <div className={`absolute top-0 left-0 h-[3px] w-8 rounded-r-full transition-all duration-300 ${cornerColor}`} />
            <div className={`absolute top-0 left-0 w-[3px] h-8 rounded-b-full transition-all duration-300 ${cornerColor}`} />
          </div>
          {/* Top-right corner */}
          <div className="absolute top-0 right-0">
            <div className={`absolute top-0 right-0 h-[3px] w-8 rounded-l-full transition-all duration-300 ${cornerColor}`} />
            <div className={`absolute top-0 right-0 w-[3px] h-8 rounded-b-full transition-all duration-300 ${cornerColor}`} />
          </div>
          {/* Bottom-left corner */}
          <div className="absolute bottom-0 left-0">
            <div className={`absolute bottom-0 left-0 h-[3px] w-8 rounded-r-full transition-all duration-300 ${cornerColor}`} />
            <div className={`absolute bottom-0 left-0 w-[3px] h-8 rounded-t-full transition-all duration-300 ${cornerColor}`} />
          </div>
          {/* Bottom-right corner */}
          <div className="absolute bottom-0 right-0">
            <div className={`absolute bottom-0 right-0 h-[3px] w-8 rounded-l-full transition-all duration-300 ${cornerColor}`} />
            <div className={`absolute bottom-0 right-0 w-[3px] h-8 rounded-t-full transition-all duration-300 ${cornerColor}`} />
          </div>

          {/* Glow ring when face detected or scanning */}
          {(faceDetected || phase === 'scanning') && (
            <div className={`absolute inset-0 rounded-xl transition-all duration-500 ${
              phase === 'scanning'
                ? 'shadow-[0_0_0_1.5px_rgba(124,58,237,0.6),0_0_50px_rgba(124,58,237,0.2),inset_0_0_30px_rgba(124,58,237,0.05)]'
                : 'shadow-[0_0_0_1.5px_rgba(52,211,153,0.5),0_0_35px_rgba(52,211,153,0.12)]'
            }`} />
          )}

          {/* Sweep line when scanning */}
          {phase === 'scanning' && (
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <div
                className="absolute inset-x-0 h-[2px]"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.6) 15%, rgba(196,130,252,1) 50%, rgba(168,85,247,0.6) 85%, transparent 100%)',
                  boxShadow: '0 0 18px rgba(168,85,247,0.9), 0 0 36px rgba(124,58,237,0.4)',
                  animation: 'scan-sweep 1.5s ease-in-out infinite',
                }}
              />
            </div>
          )}

          {/* Mid-frame guide dots */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
            <div className={`w-1 h-1 rounded-full transition-colors duration-300 ${faceDetected ? 'bg-emerald-400/70' : 'bg-white/20'}`} />
            <div className={`w-1 h-1 rounded-full transition-colors duration-300 ${faceDetected ? 'bg-emerald-400/70' : 'bg-white/20'}`} />
          </div>

          {/* Status badge below frame */}
          <div className="absolute -bottom-11 inset-x-0 flex justify-center">
            <span className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[0.14em] transition-all duration-300 backdrop-blur-md border ${
              phase === 'scanning'
                ? 'bg-primary/25 border-primary/50 text-violet-200'
                : faceDetected
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-black/45 border-white/12 text-white/55'
            }`}>
              {phase === 'scanning' ? 'Matching…' : faceDetected ? 'Face Acquired' : 'Align Face'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Top bar ── */}
      <div className="absolute top-0 inset-x-0 px-5 pt-5 z-30 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => { stop(); setPhase('select_service'); }}
          className="pointer-events-auto glass-dark w-11 h-11 rounded-2xl flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="glass-dark px-4 py-2.5 rounded-2xl pointer-events-auto text-right">
          <p className="text-white text-sm font-bold leading-tight">
            {selectedService?.name || selectedService?.service_group}
          </p>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className={`text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Mode toggle ── */}
      <div className="absolute top-[4.75rem] inset-x-0 flex justify-center z-30 pointer-events-none">
        <div className="glass-dark rounded-2xl p-1 flex pointer-events-auto">
          <button
            onClick={() => setMode('sign_in')}
            className={`px-5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              mode === 'sign_in'
                ? 'bg-primary text-white shadow-lg shadow-primary/40'
                : 'text-white/45 hover:text-white/80'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode('sign_out')}
            className={`px-5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              mode === 'sign_out'
                ? 'bg-info text-white shadow-lg shadow-blue-500/40'
                : 'text-white/45 hover:text-white/80'
            }`}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Camera picker ── */}
      {availableCameras.length > 1 && (
        <div className="absolute top-[8.75rem] inset-x-0 flex justify-center z-30">
          <div className="glass-dark rounded-2xl overflow-hidden pointer-events-auto">
            <div className="flex items-center gap-1 p-1">
              {availableCameras.map((cam, i) => (
                <button
                  key={cam.deviceId}
                  onClick={() => void switchCamera(cam.deviceId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-200 whitespace-nowrap ${
                    activeCameraId === cam.deviceId
                      ? 'bg-primary text-white'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {cam.label.length > 20 ? `Camera ${i + 1}` : cam.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Result overlay ── */}
      {phase === 'result' && result && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center animate-fade-in bg-black/80 backdrop-blur-sm"
          onClick={resetScan}
        >
          <div className="animate-scale-in w-[80%] max-w-xs rounded-[2rem] overflow-hidden shadow-2xl">
            {/* Drain bar */}
            <div className={`h-1 ${
              result.type === 'success' ? 'bg-emerald-400/40' :
              result.type === 'already_marked' ? 'bg-amber-400/40' : 'bg-red-400/40'
            }`}>
              <div className={`h-full ${
                result.type === 'success'
                  ? 'bg-emerald-300 result-bar-success'
                  : 'bg-white/70 result-bar-error'
              }`} />
            </div>

            {/* Content */}
            <div className={`px-7 py-8 text-center ${
              result.type === 'success'
                ? 'bg-gradient-to-b from-emerald-600 to-emerald-700'
                : result.type === 'already_marked'
                ? 'bg-gradient-to-b from-amber-500 to-amber-600'
                : 'bg-gradient-to-b from-red-600 to-red-700'
            }`}>
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-5">
                <span className="text-4xl text-white font-black">
                  {result.type === 'success' ? '✓' : result.type === 'already_marked' ? '↩' : '✕'}
                </span>
              </div>
              <h2 className="text-white text-2xl font-black leading-tight mb-2">
                {result.type === 'success'
                  ? result.name
                  : result.type === 'already_marked'
                  ? 'Already Marked'
                  : 'Not Accepted'}
              </h2>
              <p className="text-white/70 text-sm font-medium leading-relaxed">{result.message}</p>
            </div>
          </div>
          <p className="text-white/30 text-[11px] font-bold uppercase tracking-widest mt-5">Tap to continue</p>
        </div>
      )}

      {/* ── Bottom dock ── */}
      <div className="absolute bottom-0 inset-x-0 z-20 px-5 pb-7">
        <div className="glass-dark rounded-3xl px-6 py-4">
          {phase === 'scanning' ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">Processing face…</p>
                <p className="text-white/40 text-xs mt-0.5">
                  {embeddings.length > 0 ? `Checking ${embeddings.length} students` : 'Matching…'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary/80 animate-bounce"
                    style={{ animationDelay: `${i * 0.13}s`, animationDuration: '0.75s' }}
                  />
                ))}
              </div>
            </div>
          ) : !isOnline && !offlineReady ? (
            <div className="text-center">
              <p className="text-amber-300 font-bold text-sm">Offline model loading…</p>
              <p className="text-white/40 text-xs mt-0.5">Reconnect to Wi-Fi or wait</p>
            </div>
          ) : !canScan ? (
            <div className="text-center">
              <p className="text-white/55 font-semibold text-sm animate-pulse">Waiting for GPS fix…</p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-sm">
                  {mode === 'sign_in' ? 'Ready to Sign In' : 'Ready to Sign Out'}
                </p>
                {modelDownloadPct !== null && modelDownloadPct < 100 && !offlineReady ? (
                  <p className="text-amber-400 text-xs mt-0.5">Offline not ready · keep connected ({Math.round(modelDownloadPct)}%)</p>
                ) : (
                  <p className="text-white/40 text-xs mt-0.5">Position face inside the frame</p>
                )}
              </div>
              <div className="relative w-3 h-3">
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400 animate-ping opacity-75" />
                <div className="relative w-3 h-3 rounded-full bg-emerald-400" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

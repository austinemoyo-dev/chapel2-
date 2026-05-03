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
import { matchOffline } from '@/lib/offline/offlineMatcher';
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
  const { videoRef, canvasRef, overlayRef, start, stop, captureFrame, isActive, analyzeFrame, modelsLoaded } = useCamera({
    facingMode: 'environment',
    width: 640,
    height: 480,
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

  // Liveness
  const [livenessChallenge, setLivenessChallenge] = useState<typeof LIVENESS_CHALLENGES[number] | null>(null);
  const [livenessProgress, setLivenessProgress]   = useState(0); // 0–100
  const livenessDeadlineRef  = useRef<number | null>(null);
  const livenessPassRef      = useRef(false);
  const livenessChallengeRef = useRef<typeof LIVENESS_CHALLENGES[number] | null>(null); // readable inside interval

  const analysisLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef    = useRef<number | null>(null);
  const phaseRef        = useRef(phase);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState('Select a service to prepare attendance.');
  const [servicesLoaded, setServicesLoaded] = useState(false);

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

  const handleSelectService = useCallback(async (service: Service) => {
    setSelectedService(service);
    setEmbeddingStatus('Preparing face pool...');

    try {
      if (isOnline) {
        const data = await attendanceService.getEmbeddings(service.id);
        setEmbeddings(data.embeddings);
        await cacheEmbeddings({
          service_id: service.id,
          embeddings: data.embeddings,
          cached_at: new Date().toISOString(),
        });
        setEmbeddingStatus(`${data.student_count} embeddings cached for this service.`);
        addToast(`Loaded ${data.student_count} student embeddings`, 'info');
      } else {
        const cached = await getCachedEmbeddings(service.id);
        if (cached) {
          setEmbeddings(cached.embeddings);
          setEmbeddingStatus(`${cached.embeddings.length} cached student records found. Offline face matching still requires a browser model.`);
          addToast('Cached embeddings found, but offline matching is not enabled yet.', 'warning');
        } else {
          setEmbeddings([]);
          setEmbeddingStatus('No cached embeddings for this service.');
        }
      }
    } catch {
      setEmbeddingStatus('Could not load embeddings. Online scans may still work through the backend.');
      addToast('Failed to load embeddings', 'error');
    }

    // Switch to camera view BEFORE starting the camera.
    // The <video> element only exists in the DOM during the camera phases.
    // Calling start() here (while phase is still 'select_service') means
    // videoRef.current is null — the stream gets obtained but never attached.
    // The useEffect below fires after the re-render, by which time
    // videoRef.current is set and the stream attaches correctly.
    setPhase('ready');
  }, [isOnline, addToast]);

  useEffect(() => {
    serviceService.listServices({ is_cancelled: 'false' }).then((data) => {
      const list = Array.isArray(data) ? data : data.results || [];
      const now = new Date().toISOString();
      // Include a service if EITHER the sign-in window OR a dedicated sign-out
      // window is currently open. This prevents "no active service" when the
      // sign-in window closes but sign-out marking is still required.
      const open = list.filter((s) => {
        const signInOpen  = s.window_open_time <= now && s.window_close_time >= now;
        const signOutOpen = s.signout_open_time && s.signout_close_time
          ? s.signout_open_time <= now && s.signout_close_time >= now
          : false;
        return signInOpen || signOutOpen;
      });
      
      setServicesLoaded(true);
      if (open.length === 1) {
        // Only one service active — auto-select it immediately
        setServices(open);
        void handleSelectService(open[0]);
      } else if (open.length > 1) {
        // Multiple services active — show all and require manual selection.
        // Protocol members must choose which service they are assigned to.
        setServices(open);
      } else {
        setServices([]);
      }
    }).catch(() => {
      setServices([]);
      setServicesLoaded(true);
    });
  }, [handleSelectService]);

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
        .then(() => { if (!cancelled) { setOfflineReady(true); setModelDownloadPct(100); } })
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

        // ── READY: wait for a stable face, then issue liveness challenge ────
        if (currentPhase === 'ready') {
          if (hasFace && isStable) {
            if (!holdStartRef.current) {
              holdStartRef.current = Date.now();
            } else if (Date.now() - holdStartRef.current >= 400) {
              holdStartRef.current = null;
              // Pick a random challenge and switch to liveness phase
              const challenge = LIVENESS_CHALLENGES[
                Math.floor(Math.random() * LIVENESS_CHALLENGES.length)
              ];
              livenessPassRef.current     = false;
              livenessDeadlineRef.current  = Date.now() + LIVENESS_TIMEOUT_MS;
              livenessChallengeRef.current = challenge;   // readable inside interval
              setLivenessChallenge(challenge);
              setLivenessProgress(0);
              setPhase('liveness');
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

      const landmarks = lastLandmarksRef.current;
      if (!landmarks || landmarks.length < 400) {
        setResult({ type: 'failed', name: '', message: 'No face landmarks detected. Try again.' });
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
        // Align face to 112×112 ArcFace template
        const vw = videoRef.current?.videoWidth  ?? 640;
        const vh = videoRef.current?.videoHeight ?? 480;
        const aligned = alignFace(videoRef.current!, landmarks, vw, vh);
        if (!aligned) {
          setResult({ type: 'failed', name: '', message: 'Could not align face. Position face in the oval.' });
          setScanning(false);
          setPhase('result');
          scheduleAutoReset('failed');
          return;
        }

        // Extract 512-dim ArcFace embedding via ONNX Runtime Web
        const tensor    = imageDataToFloat32(aligned);
        const embedding = await extractEmbedding(tensor);

        // 1-to-N cosine match against cached student pool
        const pool = await getCachedEmbeddings(selectedService.id);
        if (!pool || pool.embeddings.length === 0) {
          setResult({ type: 'failed', name: '', message: 'No cached student embeddings. Select service again while online.' });
          setScanning(false);
          setPhase('result');
          scheduleAutoReset('failed');
          return;
        }

        const match = matchOffline(embedding, pool);
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
        setResult({ type: 'failed', name: '', message: 'Offline matching error. Please retry.' });
      }

      setScanning(false);
      setPhase('result');
      scheduleAutoReset(offlineSucceeded ? 'success' : 'failed');
      return;
    }

    const file = captureFrame();
    if (!file) {
      setResult({ type: 'failed', name: '', message: 'Camera frame was not captured. Please retry.' });
      setScanning(false);
      setPhase('result');
      scheduleAutoReset('failed');
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
  //   2000ms on success — protocol member reads + confirms the student name
  //   1500ms on warning/error — sees the rejection reason before next scan
  function scheduleAutoReset(resultType: ResultType) {
    const delay = resultType === 'success' ? 2000 : 1500;
    setTimeout(() => {
      if (phaseRef.current === 'result') resetScan();
    }, delay);
  }

  const gpsReady = geo.latitude !== null && geo.longitude !== null && !geo.permissionDenied;
  const canScan = isActive && gpsReady && !!deviceId && !!selectedService && !scanning && isOnline;

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

  return (
    <div className="h-dvh flex flex-col relative bg-surface overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Light frosted mask with glowing oval */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center backdrop-blur-sm" style={{ paddingTop: '5%' }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <mask id="faceMask">
              <rect width="100" height="100" fill="white"/>
              <ellipse cx="50" cy="45" rx="28" ry="36" fill="black"/>
            </mask>
          </defs>
          <rect width="100" height="100" fill="rgba(255,255,255,0.85)" mask="url(#faceMask)"/>
        </svg>
        
        <div className={`w-[56%] aspect-[28/36] rounded-full border-[3px] transition-all duration-500 relative ${
          phase === 'scanning'  ? 'border-primary shadow-[0_0_40px_rgba(124,58,237,0.4),inset_0_0_20px_rgba(124,58,237,0.2)] scale-105' :
          phase === 'liveness'  ? 'border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.3)]' :
          faceDetected          ? 'border-success shadow-[0_0_30px_rgba(16,185,129,0.25)] scale-[1.02]' :
                                  'border-primary/20'
        }`}>
          {/* Scanning sweep animation line */}
          {phase === 'scanning' && (
            <div className="absolute left-0 right-0 h-[2px] bg-primary shadow-[0_0_10px_rgba(124,58,237,0.8)] rounded-full" 
                 style={{ animation: 'slide-up-fade 1s infinite alternate linear' }} />
          )}
        </div>
      </div>

      {/* Top HUD */}
      <div className="absolute top-0 inset-x-0 p-6 z-20 flex justify-between items-start pointer-events-none">
        <button
          onClick={() => { stop(); setPhase('select_service'); }}
          className="bg-white/80 backdrop-blur-md border border-border w-12 h-12 rounded-full flex items-center justify-center text-foreground hover:bg-white transition-colors pointer-events-auto shadow-sm"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        
        <div className="bg-white/80 backdrop-blur-md border border-border px-5 py-2.5 rounded-full text-right pointer-events-auto shadow-sm">
          <p className="text-foreground font-bold text-sm tracking-wide">{selectedService?.name || selectedService?.service_group}</p>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success' : 'bg-warning'} ${isOnline ? 'animate-pulse' : ''}`} />
            <p className={`text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-success' : 'text-warning'}`}>{isOnline ? 'Online' : 'Offline'}</p>
          </div>
        </div>
      </div>

      {/* Mode Indicator Pill */}
      <div className="absolute top-24 inset-x-0 flex justify-center z-20 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md border border-border px-4 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
          <span className={`w-2 h-2 rounded-full ${mode === 'sign_in' ? 'bg-primary' : 'bg-info'}`} />
          <span className="text-foreground text-xs font-bold uppercase tracking-wider">{mode === 'sign_in' ? 'Sign In Mode' : 'Sign Out Mode'}</span>
        </div>
      </div>

      {/* Liveness Challenge Overlay */}
      {phase === 'liveness' && livenessChallenge && (
        <div className="absolute inset-x-0 bottom-32 flex flex-col items-center justify-end z-20 pointer-events-none animate-slide-up-fade">
          <div className="mx-6 w-full max-w-sm rounded-[2rem] overflow-hidden bg-white/90 backdrop-blur-xl border-2 border-yellow-400/30 shadow-[0_10px_40px_rgba(0,0,0,0.1)]">
            <div className="h-1.5 bg-border w-full relative">
              <div
                className="absolute inset-y-0 left-0 transition-all duration-100 ease-linear rounded-r-full"
                style={{
                  width: `${livenessProgress}%`,
                  background: livenessProgress > 30 ? '#FACC15' : '#EF4444',
                  boxShadow: `0 0 10px ${livenessProgress > 30 ? 'rgba(250,204,21,0.5)' : 'rgba(239,68,68,0.5)'}`
                }}
              />
            </div>
            <div className="px-6 py-6 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mb-3 text-yellow-600 border border-yellow-400/30">
                <span className="text-3xl">
                  {livenessChallenge.label.includes('Blink') ? '👁️' :
                   livenessChallenge.label.includes('Smile') ? '😊' :
                   livenessChallenge.label.includes('Left')  ? '↩️' :
                   livenessChallenge.label.includes('Right') ? '↪️' : '↕️'}
                </span>
              </div>
              <p className="text-foreground font-black text-2xl leading-tight mb-1">{livenessChallenge.label}</p>
              <p className="text-muted text-sm font-medium">{livenessChallenge.instruction}</p>
            </div>
          </div>
        </div>
      )}

      {/* Result Screen */}
      {phase === 'result' && result && (
        <div
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center animate-fade-in backdrop-blur-xl
            ${result.type === 'success' ? 'bg-success-muted/90' : result.type === 'already_marked' ? 'bg-warning-muted/90' : 'bg-danger-muted/90'}`}
        >
          <div className="absolute top-0 inset-x-0 h-2 bg-border/50">
            <div className={`h-full rounded-r-full ${
              result.type === 'success' ? 'bg-success result-bar-success' : 
              result.type === 'already_marked' ? 'bg-warning result-bar-error' : 
              'bg-danger result-bar-error'}`} />
          </div>

          <div className="flex flex-col items-center text-center p-8 max-w-sm w-full">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 shadow-xl border-4 animate-pulse-ring
              ${result.type === 'success' ? 'bg-white border-success text-success' : 
                result.type === 'already_marked' ? 'bg-white border-warning text-warning' : 
                'bg-white border-danger text-danger'}`}>
              <span className="text-6xl drop-shadow-sm font-bold">
                {result.type === 'success' ? '✓' : result.type === 'already_marked' ? '!' : '✕'}
              </span>
            </div>
            
            <h2 className={`text-3xl font-black mb-3 drop-shadow-sm leading-tight
              ${result.type === 'success' ? 'text-success' : 
                result.type === 'already_marked' ? 'text-warning' : 
                'text-danger'}`}>
              {result.type === 'success'
                ? result.name
                : result.type === 'already_marked'
                ? 'Already Marked'
                : 'Not Accepted'}
            </h2>
            <p className="text-foreground/80 text-base font-bold px-4">
              {result.message}
            </p>
          </div>
          <button onClick={resetScan} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </div>
      )}

      {/* Bottom Status HUD */}
      {phase === 'ready' && (
        <div className="absolute bottom-10 inset-x-6 z-20 flex flex-col gap-3">
          {!isOnline && !offlineReady && (
            <div className="bg-warning-muted/90 backdrop-blur-md border border-warning/30 rounded-2xl p-4 text-center shadow-sm">
              <p className="text-warning font-bold text-sm">Offline Model Loading...</p>
              <p className="text-warning/80 text-xs mt-1">Please wait or connect to Wi-Fi</p>
            </div>
          )}
          {!canScan && (isOnline || offlineReady) && (
            <div className="bg-white/90 backdrop-blur-md border border-border rounded-2xl p-4 text-center shadow-sm">
              <p className="text-muted font-semibold text-sm animate-pulse">Waiting for GPS Fix...</p>
            </div>
          )}
          {canScan && (
            <div className="bg-white/95 backdrop-blur-xl border border-border rounded-[2rem] p-5 text-center shadow-lg">
              <p className="text-foreground font-black text-base tracking-wide mb-1 flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                {mode === 'sign_in' ? 'Ready to Sign In' : 'Ready to Sign Out'}
              </p>
              <p className="text-muted text-xs font-medium">Position face in the oval to begin</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

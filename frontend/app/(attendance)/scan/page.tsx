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
import { cacheEmbeddings, getCachedEmbeddings, getQueueCount } from '@/lib/offline/db';
import { syncOfflineRecords, registerBackgroundSync } from '@/lib/offline/syncManager';
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
      // Show services with open windows
      const now = new Date().toISOString();
      const open = list.filter((s) => s.window_open_time <= now && s.window_close_time >= now);
      
      setServicesLoaded(true);
      if (open.length > 0) {
        // Auto-select the first open service
        setServices([open[0]]);
        void handleSelectService(open[0]);
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

        const { skinToneRatio, isStable, blendshapes, headYaw } = analysis;
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
      setResult({
        type: 'offline_unavailable',
        name: '',
        message: 'Offline face matching needs a browser embedding model before attendance can be accepted locally.',
      });
      setScanning(false);
      setPhase('result');
      return;
    }

    const file = captureFrame();
    if (!file) {
      setResult({ type: 'failed', name: '', message: 'Camera frame was not captured. Please retry.' });
      setScanning(false);
      setPhase('result');
      return;
    }

    if (geo.latitude === null || geo.longitude === null || !deviceId) {
      setResult({ type: 'failed', name: '', message: 'GPS and device identity are required before scanning.' });
      setScanning(false);
      setPhase('result');
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

      setResult({
        type: 'success',
        name: response.student_name || '',
        message: response.message,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setResult({
          type: err.status === 409 ? 'already_marked' : 'failed',
          name: (err.data.student_name as string) || '',
          message: err.message,
        });
      } else {
        setResult({ type: 'failed', name: '', message: 'Scan failed. Please retry.' });
      }
    } finally {
      setScanning(false);
      setPhase('result');
    }
  }

  function resetScan() {
    setResult(null);
    setPhase('ready');
  }

  const gpsReady = geo.latitude !== null && geo.longitude !== null && !geo.permissionDenied;
  const canScan = isActive && gpsReady && !!deviceId && !!selectedService && !scanning && isOnline;

  if (phase === 'select_service') {
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Attendance Scanner</h1>
            <p className="text-sm text-muted">{user?.full_name}</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingSync > 0 && (
              <Button variant="secondary" size="sm" onClick={() => void handleSync()} loading={syncing}>
                Sync {pendingSync}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={logout}>Logout</Button>
          </div>
        </div>

        <div className="flex gap-2 p-1 bg-surface-2 rounded-xl">
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'sign_in' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
            onClick={() => setMode('sign_in')}
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'sign_out' ? 'bg-primary text-white' : 'text-muted hover:text-foreground'
            }`}
            onClick={() => setMode('sign_out')}
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-muted">Connection</p>
            <p className={isOnline ? 'text-success' : 'text-warning'}>{isOnline ? 'Online' : 'Offline'}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-muted">GPS</p>
            <p className={gpsReady ? 'text-success' : 'text-warning'}>
              {gpsReady ? `Ready (${Math.round(geo.accuracy || 0)}m)` : 'Waiting'}
            </p>
          </div>
        </div>

        {geo.permissionDenied && (
          <div className="bg-danger-muted border border-danger/30 rounded-xl p-3 text-sm text-danger">
            GPS access denied. Location is required for attendance marking.
          </div>
        )}

        {!isOnline && (
          <div className="bg-warning-muted border border-warning/30 rounded-xl p-3 text-sm text-warning">
            Offline attendance is paused until a client-side face embedding model is installed.
          </div>
        )}

        <h2 className="text-sm font-medium text-muted">Active Service</h2>
        {!servicesLoaded ? (
          <div className="text-center py-8 text-muted"><Spinner /><p className="mt-2 text-sm">Detecting active service...</p></div>
        ) : services.length === 0 ? (
          <div className="text-center py-8 text-muted"><p className="text-sm">No active service at the moment. Ask the Superadmin to open a service window.</p></div>
        ) : (
          <div className="space-y-2">
            {services.map((s) => (
              <div
                key={s.id}
                className="w-full text-left p-4 rounded-xl bg-surface-2 border border-border"
              >
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="font-medium">{s.name || `${s.service_type} ${s.service_group}`}</p>
                    <p className="text-xs text-muted">{s.scheduled_date}</p>
                  </div>
                  <Badge variant={s.is_window_open ? 'success' : 'info'}>
                    {s.is_window_open ? 'Open' : s.service_group}
                  </Badge>
                </div>
                <Button className="w-full" onClick={() => void handleSelectService(s)}>
                  Resume Scanning
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col relative">
      <div className="flex-1 relative bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Dark mask with oval window */}
        <div className="absolute inset-0 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <mask id="faceMask">
                <rect width="100" height="100" fill="white"/>
                <ellipse cx="50" cy="43" rx="29" ry="37" fill="black"/>
              </mask>
            </defs>
            <rect width="100" height="100" fill="rgba(0,0,0,0.60)" mask="url(#faceMask)"/>
          </svg>
        </div>

        {/* Colour-coded oval guide */}
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none"
             style={{ paddingTop: '6%' }}>
          <div className={`w-[58%] aspect-[3/4] rounded-full border-[3px] transition-all duration-300 ${
            phase === 'scanning'  ? 'border-primary animate-pulse shadow-[0_0_24px_rgba(139,0,255,0.5)]' :
            phase === 'liveness'  ? 'border-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.5)]' :
            faceDetected          ? 'border-success shadow-[0_0_24px_rgba(5,150,105,0.4)]' :
                                    'border-white/30'
          }`}/>
        </div>

        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10">
          <button
            onClick={() => { stop(); setPhase('select_service'); }}
            className="bg-surface/80 backdrop-blur px-3 py-1.5 rounded-xl text-sm"
          >
            Back
          </button>
          <div className="bg-surface/80 backdrop-blur px-3 py-1.5 rounded-xl text-xs text-right">
            <p>{selectedService?.name || selectedService?.service_group}</p>
            <p className={isOnline ? 'text-success' : 'text-warning'}>{isOnline ? 'Online' : 'Offline'}</p>
          </div>
        </div>

        <div className="absolute left-4 right-4 top-20 z-10 rounded-xl bg-surface/80 backdrop-blur border border-border p-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <Badge variant={mode === 'sign_in' ? 'success' : 'info'}>{mode === 'sign_in' ? 'Sign in' : 'Sign out'}</Badge>
            <Badge variant={gpsReady ? 'success' : 'warning'}>{gpsReady ? `GPS ${Math.round(geo.accuracy || 0)}m` : 'GPS waiting'}</Badge>
            <Badge variant={embeddings.length > 0 ? 'success' : 'warning'}>{embeddings.length} cached</Badge>
          </div>
          <p className="text-muted mt-2">{embeddingStatus}</p>
        </div>

        {/* Liveness challenge overlay */}
        {phase === 'liveness' && livenessChallenge && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 z-20 pointer-events-none">
            <div className="mx-4 w-full max-w-sm rounded-3xl overflow-hidden"
                 style={{
                   background: 'rgba(10,0,30,0.82)',
                   backdropFilter: 'blur(20px)',
                   border: '1.5px solid rgba(139,0,255,0.40)',
                   boxShadow: '0 8px 32px rgba(0,0,0,0.40)',
                 }}>
              {/* Progress bar */}
              <div className="h-1 bg-white/10 w-full">
                <div
                  className="h-full transition-all duration-200 rounded-full"
                  style={{
                    width: `${livenessProgress}%`,
                    background: livenessProgress > 40
                      ? 'linear-gradient(90deg,#7C3AED,#A855F7)'
                      : 'linear-gradient(90deg,#DC2626,#EF4444)',
                  }}
                />
              </div>

              <div className="px-5 py-4 text-center">
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Liveness Check
                </p>
                <p className="text-4xl mb-2">{livenessChallenge.label.split(' ')[0] === 'Blink' ? '👁️' :
                  livenessChallenge.label.includes('Smile') ? '😊' :
                  livenessChallenge.label.includes('Left')  ? '↩️' :
                  livenessChallenge.label.includes('Right') ? '↪️' : '↕️'}</p>
                <p className="text-white font-black text-lg leading-tight">{livenessChallenge.label}</p>
                <p className="text-white/60 text-xs mt-1">{livenessChallenge.instruction}</p>
              </div>
            </div>
          </div>
        )}

        {phase === 'scanning' && scanning && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="text-center bg-black/40 backdrop-blur px-6 py-4 rounded-2xl">
              <Spinner size="lg" />
              <p className="mt-4 text-sm font-bold text-white">Matching face...</p>
            </div>
          </div>
        )}

        {phase === 'result' && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
            <div className="bg-surface border border-border rounded-2xl p-8 text-center max-w-xs mx-4 animate-slide-up">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
                result.type === 'success' ? 'bg-success-muted text-success' :
                  result.type === 'already_marked' || result.type === 'offline_unavailable' ? 'bg-warning-muted text-warning' :
                    'bg-danger-muted text-danger'
              }`}>
                <span className="text-2xl font-bold">
                  {result.type === 'success' ? '✓' : result.type === 'already_marked' ? '!' : '✕'}
                </span>
              </div>
              <h3 className="text-lg font-bold">
                {result.type === 'success' ? result.name : result.type === 'already_marked' ? 'Already Marked' : 'Not Accepted'}
              </h3>
              <p className="text-sm text-muted mt-1">{result.message || result.name}</p>
              <div className="mt-6">
                <Button onClick={resetScan} size="lg" className="w-full">Continue Scanning</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {phase === 'ready' && (
        <div className="absolute bottom-0 left-0 right-0 p-6 pb-8 z-10 flex flex-col items-center">
          {!isOnline && (
            <p className="mb-3 text-center text-sm text-warning bg-surface/90 border border-warning/30 rounded-xl p-3 w-full">
              Offline matching unavailable. Reconnect to scan.
            </p>
          )}
          {!modelsLoaded ? (
            <div className="bg-surface/90 backdrop-blur border border-border rounded-2xl p-4 w-full flex items-center justify-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm font-medium">Loading AI Models...</span>
            </div>
          ) : !canScan ? (
            <div className="bg-surface/90 backdrop-blur border border-border rounded-2xl p-4 w-full text-center">
              <span className="text-sm font-medium text-muted">Waiting for GPS...</span>
            </div>
          ) : (
            <div className="bg-surface/90 backdrop-blur border border-border rounded-2xl p-5 w-full text-center shadow-lg">
              <p className="text-sm font-bold text-foreground mb-1">
                {mode === 'sign_in' ? 'Sign-In Scanner' : 'Sign-Out Scanner'}
              </p>
              <p className="text-xs text-muted">Align face in the oval and hold still to auto-scan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

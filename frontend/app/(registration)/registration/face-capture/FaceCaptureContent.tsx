'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import { useCamera } from '@/lib/hooks/useCamera';
import { useToast } from '@/providers/ToastProvider';
import Spinner from '@/components/ui/Spinner';

// ============================================================================
// Types
// ============================================================================

type CapturePhase =
  | 'initializing'   // Camera starting
  | 'positioning'    // User needs to position face
  | 'hold-still'     // Face detected, waiting for stability
  | 'countdown'      // Counting down 3..2..1
  | 'capturing'      // Taking the photo
  | 'uploading'      // Sending to server
  | 'result'         // Showing approved/rejected
  | 'complete';      // All samples done

type Instruction = {
  text: string;
  icon: string;
  type: 'info' | 'warning' | 'success' | 'error';
};

const INSTRUCTIONS: Record<string, Instruction> = {
  no_camera:    { text: 'Starting camera…',                    icon: '📷', type: 'info'    },
  position:     { text: 'Centre your face in the oval',        icon: '👤', type: 'info'    },
  too_dark:     { text: 'Move to a brighter spot',            icon: '💡', type: 'warning' },
  no_face:      { text: 'Look straight at the camera',         icon: '👀', type: 'warning' },
  eyes_closed:  { text: 'Please open your eyes',               icon: '👁️', type: 'warning' },
  turn_face:    { text: 'Face the camera directly',            icon: '🎯', type: 'warning' },
  hold_still:   { text: 'Hold still…',                         icon: '✋', type: 'info'    },
  counting:     { text: 'Capturing in…',                       icon: '📸', type: 'success' },
  capturing:    { text: 'Capturing…',                          icon: '⚡', type: 'success' },
  uploading:    { text: 'Analysing…',                          icon: '🔄', type: 'info'    },
  approved:     { text: 'Sample approved!',                    icon: '✅', type: 'success' },
  rejected:     { text: 'Please try again',                    icon: '❌', type: 'error'   },
  complete:     { text: 'Face capture complete!',              icon: '🎉', type: 'success' },
};

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;
const COUNTDOWN_SECONDS    = 1;    // was 3 — face-box stability is reliable now
const HOLD_STILL_MS        = 200;  // was 500 — 200ms of confirmed stillness before countdown
const RESULT_DISPLAY_MS    = 1500; // was 2000
const ANALYSIS_INTERVAL_MS = 120;  // was 150 — slightly faster feedback cycle

// ============================================================================
// Inner component (needs Suspense boundary for useSearchParams)
// ============================================================================

function FaceCaptureInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const studentId = searchParams.get('student') || '';
  const semesterId = searchParams.get('semester') || '';

  const {
    videoRef, canvasRef, overlayRef, isActive, error: camError, modelsLoaded,
    start, captureFrame, analyzeFrame,
  } = useCamera({ facingMode: 'user', width: 640, height: 480 });

  // State
  const [phase, setPhase] = useState<CapturePhase>('initializing');
  const [instruction, setInstruction] = useState<Instruction>(INSTRUCTIONS.no_camera);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [approved, setApproved] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [total, setTotal] = useState(0);
  const [lastRejectionReason, setLastRejectionReason] = useState<string | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  // Live quality metrics for the real-time indicator row
  const [frameData, setFrameData] = useState<{
    brightness: number; skinRatio: number; isStable: boolean;
  } | null>(null);
  const frameDataTickRef = useRef(0);

  // Refs
  const holdStartRef = useRef<number | null>(null);
  const analysisLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef(phase);
  const approvedRef = useRef(approved);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { approvedRef.current = approved; }, [approved]);

  // Prevent leaving during face capture
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (approved < MIN_SAMPLES) {
        e.preventDefault();
        e.returnValue = 'Face capture is not complete. Your registration will be incomplete if you leave.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [approved]);

  // Show manual capture button after 12 seconds (was 30 — surface it faster)
  useEffect(() => {
    fallbackTimerRef.current = setTimeout(() => {
      setShowManualFallback(true);
    }, 12000);
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  // ============================================================================
  // Camera initialization
  // ============================================================================

  useEffect(() => {
    if (!isActive && !camError) {
      start();
    }
    if (isActive && phase === 'initializing') {
      setPhase('positioning');
      setInstruction(INSTRUCTIONS.position);
    }
  }, [isActive, camError, start, phase]);

  // ============================================================================
  // Auto-capture via upload
  // ============================================================================

  const doCapture = useCallback(async () => {
    if (phaseRef.current === 'capturing' || phaseRef.current === 'uploading') return;

    setPhase('capturing');
    setInstruction(INSTRUCTIONS.capturing);

    // Flash effect
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 400);

    const file = captureFrame();
    if (!file) {
      setPhase('positioning');
      setInstruction(INSTRUCTIONS.position);
      return;
    }

    setPhase('uploading');
    setInstruction(INSTRUCTIONS.uploading);

    try {
      const result = await registrationService.uploadFaceSample(studentId, semesterId, file);
      setTotal((t) => t + 1);

      if (result.status === 'approved') {
        const newApproved = approvedRef.current + 1;
        setApproved(newApproved);
        setInstruction(INSTRUCTIONS.approved);
        setPhase('result');
        setLastRejectionReason(null);
        addToast(`Face sample ${newApproved}/${MIN_SAMPLES} approved`, 'success');

        // Check if we have enough
        if (newApproved >= MIN_SAMPLES) {
          setTimeout(() => {
            setPhase('complete');
            setInstruction(INSTRUCTIONS.complete);
          }, RESULT_DISPLAY_MS);
          return;
        }
      } else {
        setRejected((r) => r + 1);
        const reason = result.rejection_reason || 'Quality check failed. Please try again.';
        setLastRejectionReason(reason);
        setInstruction({ text: reason, icon: '❌', type: 'error' });
        setPhase('result');
      }

      // After showing result, go back to positioning
      setTimeout(() => {
        if (phaseRef.current === 'result') {
          setPhase('positioning');
          setInstruction(INSTRUCTIONS.position);
          holdStartRef.current = null;
        }
      }, RESULT_DISPLAY_MS);

    } catch {
      setInstruction({ text: 'Upload failed. Retrying...', icon: '⚠️', type: 'error' });
      setPhase('result');
      setTimeout(() => {
        setPhase('positioning');
        setInstruction(INSTRUCTIONS.position);
        holdStartRef.current = null;
      }, RESULT_DISPLAY_MS);
    }
  }, [captureFrame, studentId, semesterId, addToast]);

  // ============================================================================
  // Countdown logic
  // ============================================================================

  const startCountdown = useCallback(() => {
    if (phaseRef.current === 'countdown') return;
    setPhase('countdown');
    setInstruction(INSTRUCTIONS.counting);

    let remaining = COUNTDOWN_SECONDS;
    setCountdown(remaining);

    countdownIntervalRef.current = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        setCountdown(null);
        doCapture();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [doCapture]);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // ============================================================================
  // Frame analysis loop (positioning guide + auto-capture trigger)
  // ============================================================================

  useEffect(() => {
    if (!isActive || phase === 'complete' || !modelsLoaded) return;

    let isAnalyzing = false;
    analysisLoopRef.current = setInterval(async () => {
      if (isAnalyzing) return;
      isAnalyzing = true;
      try {
        const currentPhase = phaseRef.current;
        // Only analyze during positioning and hold-still phases
        if (currentPhase !== 'positioning' && currentPhase !== 'hold-still') return;

        const analysis = await analyzeFrame();
        if (!analysis) return;

        const {
          centerBrightness, skinToneRatio, isStable,
          eyesOpen, faceFrontal,
        } = analysis;

        // Update quality display every 2nd tick
        frameDataTickRef.current += 1;
        if (frameDataTickRef.current % 2 === 0) {
          setFrameData({ brightness: centerBrightness, skinRatio: skinToneRatio, isStable });
        }

        // ── Quality gate checks (priority order) ────────────────────────────
        if (centerBrightness < 30) {
          setInstruction(INSTRUCTIONS.too_dark);
          setPhase('positioning');
          holdStartRef.current = null;
          return;
        }

        if (skinToneRatio < 0.5) {
          setInstruction(INSTRUCTIONS.no_face);
          setPhase('positioning');
          holdStartRef.current = null;
          return;
        }

        // NEW: real eyes-closed detection via MediaPipe blendshapes
        if (!eyesOpen) {
          setInstruction(INSTRUCTIONS.eyes_closed);
          setPhase('positioning');
          holdStartRef.current = null;
          return;
        }

        // NEW: reject if face turned too far from camera
        if (!faceFrontal) {
          setInstruction(INSTRUCTIONS.turn_face);
          setPhase('positioning');
          holdStartRef.current = null;
          return;
        }

        // ── All quality checks passed — proceed to stability → countdown ────
        if (isStable) {
          if (!holdStartRef.current) {
            holdStartRef.current = Date.now();
            setPhase('hold-still');
            setInstruction(INSTRUCTIONS.hold_still);
            return;
          }
          const held = Date.now() - holdStartRef.current;
          if (held >= HOLD_STILL_MS) {
            holdStartRef.current = null;
            startCountdown();
          }
        } else {
          if (currentPhase === 'hold-still') {
            holdStartRef.current = null;
            setPhase('positioning');
            setInstruction(INSTRUCTIONS.position);
          }
        }
      } finally {
        isAnalyzing = false;
      }
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      if (analysisLoopRef.current) clearInterval(analysisLoopRef.current);
    };
  }, [isActive, phase, modelsLoaded, analyzeFrame, startCountdown]);

  // ============================================================================
  // Manual capture handler
  // ============================================================================

  const handleManualCapture = useCallback(() => {
    if (phase === 'capturing' || phase === 'uploading' || phase === 'complete') return;
    holdStartRef.current = null;
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
    doCapture();
  }, [phase, doCapture]);

  // ============================================================================
  // Navigate to completion
  // ============================================================================

  const handleComplete = useCallback(() => {
    router.push(`/registration/status?student=${studentId}`);
  }, [router, studentId]);

  // ============================================================================
  // Progress ring SVG values
  // ============================================================================

  const ringRadius = 40;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (approved / MIN_SAMPLES) * ringCircumference;

  // ============================================================================
  // Render
  // ============================================================================

  if (camError) {
    return (
      <div className="text-center py-12 animate-fade-in space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-danger-muted">
          <svg className="w-10 h-10 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l-4 4m0-4l4 4m6-4a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Camera Access Required</h2>
        <p className="text-sm text-muted max-w-xs mx-auto">
          Please allow camera access in your browser settings to complete face registration.
        </p>
        <button
          onClick={start}
          className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!modelsLoaded) {
    return (
      <div className="text-center py-20 animate-fade-in space-y-4">
        <Spinner size="lg" />
        <h2 className="text-lg font-semibold text-foreground">Loading AI Face Detector...</h2>
        <p className="text-sm text-muted max-w-xs mx-auto">
          Initializing secure on-device face analysis models. This may take a few seconds.
        </p>
      </div>
    );
  }

  if (phase === 'complete') {
    return (
      <div className="text-center py-8 animate-fade-in space-y-6">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-success-muted animate-success-check">
          <svg className="w-12 h-12 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Face Capture Complete!</h2>
          <p className="text-sm text-muted mt-1">
            {approved} sample{approved !== 1 ? 's' : ''} verified successfully
          </p>
        </div>

        {/* Capture more or continue */}
        <div className="space-y-3 pt-2">
          {approved < MAX_SAMPLES && (
            <button
              onClick={() => {
                setPhase('positioning');
                setInstruction(INSTRUCTIONS.position);
              }}
              className="w-full py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-foreground hover:border-primary/50 transition-all"
            >
              Capture More (improves accuracy)
            </button>
          )}
          <button
            onClick={handleComplete}
            className="w-full py-3.5 rounded-xl bg-success text-white font-semibold text-base hover:brightness-110 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            Complete Registration ✓
          </button>
        </div>
      </div>
    );
  }

  // Derived oval state for color-coding
  const ovalColor = (() => {
    if (phase === 'result' && lastRejectionReason) return 'border-danger shadow-[0_0_24px_rgba(220,38,38,0.35)]';
    if (phase === 'result')      return 'border-success shadow-[0_0_24px_rgba(5,150,105,0.4)] oval-success';
    if (phase === 'countdown')   return 'border-success shadow-[0_0_18px_rgba(5,150,105,0.3)]';
    if (phase === 'hold-still')  return 'border-primary oval-hold';
    if (frameData && frameData.skinRatio > 0.5) return 'border-blue-400/70 oval-idle';
    return 'border-white/30 oval-idle';
  })();

  return (
    <div className="animate-fade-in">

      {/* ── Step guide banner ── */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <h2 className="text-base font-black text-foreground">Face Capture</h2>
            <p className="text-xs text-muted">
              Sample {Math.min(approved + 1, MAX_SAMPLES)} of {MAX_SAMPLES} — minimum {MIN_SAMPLES} required
            </p>
          </div>
          {/* Progress ring */}
          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="rgba(139,0,255,0.12)" strokeWidth="7"/>
              <circle cx="50" cy="50" r={ringRadius} fill="none"
                stroke="url(#pg2)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}/>
              <defs>
                <linearGradient id="pg2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8B00FF"/>
                  <stop offset="100%" stopColor="#10b981"/>
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-black text-foreground">{approved}/{MIN_SAMPLES}</span>
            </div>
          </div>
        </div>

        {/* Sample dots */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {Array.from({ length: MAX_SAMPLES }, (_, i) => (
            <div key={i}
              className={`flex items-center justify-center rounded-full text-[9px] font-black
                          transition-all duration-500
                          ${i < approved
                            ? 'w-8 h-8 bg-success text-white shadow-[0_2px_12px_rgba(5,150,105,0.45)] scale-100'
                            : i === approved && (phase === 'countdown' || phase === 'capturing')
                              ? 'w-8 h-8 bg-primary/30 text-primary border-2 border-primary animate-pulse'
                              : 'w-7 h-7 bg-surface-2 text-muted border border-border'}`}>
              {i < approved
                ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                : i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* ── Camera viewport ── */}
      <div className="relative aspect-[3/4] bg-black overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted
               className="w-full h-full object-cover"
               style={{ transform: 'scaleX(-1)' }}/>
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} className="hidden"/>

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
          <div className={`w-[58%] aspect-[3/4] rounded-full border-[3px] transition-all duration-400 ${ovalColor}`}/>
        </div>

        {/* Alignment dots (corners of face guide) */}
        <div className="absolute inset-0 pointer-events-none flex items-start justify-center" style={{ paddingTop: '6%' }}>
          {['top-0 left-1/2 -translate-x-1/2 -translate-y-1.5',
            'bottom-0 left-1/2 -translate-x-1/2 translate-y-1.5',
            'left-0 top-1/2 -translate-y-1/2 -translate-x-1.5',
            'right-0 top-1/2 -translate-y-1/2 translate-x-1.5',
          ].map((pos, i) => (
            <div key={i} className={`absolute w-[58%] aspect-[3/4] rounded-full pointer-events-none ${pos}`}>
              <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                phase === 'hold-still' || phase === 'countdown' ? 'bg-primary' : 'bg-white/40'}`}/>
            </div>
          ))}
        </div>

        {/* Scanning sweep line */}
        {(phase === 'positioning' || phase === 'hold-still') && (
          <div className="absolute left-[21%] right-[21%] h-px bg-gradient-to-r
                          from-transparent via-primary/70 to-transparent
                          animate-scan-line pointer-events-none"/>
        )}

        {/* Countdown */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div key={countdown} className="animate-countdown-pop">
              <span className="text-8xl font-black text-white drop-shadow-[0_0_40px_rgba(139,0,255,0.9)]">
                {countdown}
              </span>
            </div>
          </div>
        )}

        {/* Flash */}
        {showFlash && <div className="absolute inset-0 bg-white animate-capture-flash pointer-events-none"/>}

        {/* Quality indicator pills — top overlay */}
        {(phase === 'positioning' || phase === 'hold-still') && frameData && (
          <div className="absolute top-3 inset-x-3 flex items-center justify-center gap-2 pointer-events-none">
            {/* Brightness */}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md
                              ${frameData.brightness > 60
                                ? 'bg-success/80 text-white'
                                : frameData.brightness > 30
                                  ? 'bg-warning/80 text-white'
                                  : 'bg-danger/80 text-white'}`}>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/>
              </svg>
              {frameData.brightness > 60 ? 'Good' : frameData.brightness > 30 ? 'Low' : 'Dark'}
            </div>
            {/* Face detected */}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md
                              ${frameData.skinRatio > 0.5 ? 'bg-success/80 text-white' : 'bg-white/20 text-white'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 00-16 0"/>
              </svg>
              {frameData.skinRatio > 0.5 ? 'Face Found' : 'No Face'}
            </div>
            {/* Stability */}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md
                              ${frameData.isStable ? 'bg-primary/80 text-white' : 'bg-warning/80 text-white'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                {frameData.isStable
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>}
              </svg>
              {frameData.isStable ? 'Still' : 'Hold steady'}
            </div>
          </div>
        )}

        {/* Upload spinner overlay */}
        {phase === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white/90 rounded-2xl px-6 py-4 flex items-center gap-3">
              <Spinner size="sm"/>
              <span className="text-sm font-bold text-foreground">Analysing…</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Instruction banner ── */}
      <div className="px-5 pt-4 pb-2">
        <div className={`flex items-center gap-3 p-4 rounded-2xl transition-all duration-300 ${
          instruction.type === 'success' ? 'bg-success-muted border border-success/20' :
          instruction.type === 'error'   ? 'bg-danger-muted  border border-danger/20'  :
          instruction.type === 'warning' ? 'bg-warning-muted border border-warning/20' :
                                           'bg-primary-muted border border-primary/15'
        }`}>
          <span className="text-2xl">{instruction.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${
              instruction.type === 'success' ? 'text-success' :
              instruction.type === 'error'   ? 'text-danger'  :
              instruction.type === 'warning' ? 'text-warning' : 'text-primary'
            }`}>{instruction.text}</p>
          </div>
        </div>
      </div>

      {/* ── Quick tips ── */}
      {(phase === 'positioning' || phase === 'initializing') && (
        <div className="px-5 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '💡', tip: 'Face a bright window or lamp' },
              { icon: '👓', tip: 'Remove glasses if possible' },
              { icon: '😐', tip: 'Look straight at the camera' },
            ].map((t) => (
              <div key={t.tip} className="bg-surface-2 rounded-xl p-2.5 text-center">
                <div className="text-lg mb-1">{t.icon}</div>
                <p className="text-[10px] text-muted font-medium leading-tight">{t.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="px-5 pb-5 space-y-2">
        {/* Manual capture fallback */}
        {(showManualFallback || manualMode) && phase !== 'uploading' && phase !== 'capturing' && (
          manualMode ? (
            <button onClick={handleManualCapture}
                    className="w-full py-3.5 rounded-2xl bg-primary text-white font-black text-base
                               hover:bg-primary-hover active:scale-95 transition-all
                               shadow-[0_4px_20px_rgba(139,0,255,0.35)]">
              Capture Now
            </button>
          ) : (
            <button onClick={() => setManualMode(true)}
                    className="w-full py-2.5 rounded-2xl bg-surface-2 border border-border
                               text-sm font-semibold text-muted hover:text-foreground transition-colors">
              Having trouble? Switch to manual capture
            </button>
          )
        )}

        {/* Continue early once minimum met */}
        {approved >= MIN_SAMPLES && (
          <button onClick={handleComplete}
                  className="w-full py-4 rounded-2xl bg-success text-white font-black text-base
                             hover:brightness-110 active:scale-95 transition-all
                             shadow-[0_4px_20px_rgba(5,150,105,0.4)]">
            Continue with {approved} Samples ✓
          </button>
        )}
      </div>

      {/* Tips (original section – kept for additional detail) */}
      {phase === 'positioning' && total === 0 && (
        <div className="bg-surface-2 rounded-xl p-3.5 space-y-2 border border-border">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Tips for best results</p>
          <div className="grid gap-1.5">
            {[
              { icon: '💡', tip: 'Face a light source for even lighting' },
              { icon: '🎯', tip: 'Center your face in the oval guide' },
              { icon: '👓', tip: 'Remove glasses or headwear if possible' },
              { icon: '📱', tip: 'Hold your device at eye level' },
            ].map(({ icon, tip }) => (
              <div key={tip} className="flex items-center gap-2 text-xs text-muted">
                <span>{icon}</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FaceCaptureContent() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
      <FaceCaptureInner />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registrationService } from '@/lib/api/registrationService';
import { ApiError } from '@/lib/api/client';
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

    } catch (err: any) {
      let errMsg = 'Upload failed. Retrying...';
      if (err instanceof ApiError) {
        if (err.data && typeof err.data === 'object' && err.data.detail) {
          errMsg = String(err.data.detail);
        } else if (err.message) {
          errMsg = err.message;
        }
      } else if (err?.message) {
        errMsg = err.message;
      }
      
      setInstruction({ text: errMsg, icon: '⚠️', type: 'error' });
      setPhase('result');
      setTimeout(() => {
        setPhase('positioning');
        setInstruction(INSTRUCTIONS.position);
        holdStartRef.current = null;
      }, 3000); // 3 seconds to read the exact error
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

  // Derived state for reticle color-coding
  const ovalColor = (() => {
    if (phase === 'result' && lastRejectionReason) return 'text-danger drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]';
    if (phase === 'result')      return 'text-success drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]';
    if (phase === 'countdown')   return 'text-success drop-shadow-[0_0_15px_rgba(16,185,129,0.8)] scale-[1.02]';
    if (phase === 'hold-still')  return 'text-primary drop-shadow-[0_0_15px_rgba(124,58,237,0.8)] scale-[1.01]';
    if (frameData && frameData.skinRatio > 0.5) return 'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]';
    return 'text-white/40 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]';
  })();

  return (
    <div className="animate-fade-in pb-10">

      {/* ── Step guide banner ── */}
      <div className="mx-4 mt-4 px-5 pt-5 pb-3 glass-panel mb-4">
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
      <div className="relative aspect-[3/4] max-w-[280px] mx-auto bg-black overflow-hidden rounded-[2.5rem] shadow-2xl mb-2">
        <video ref={videoRef} autoPlay playsInline muted
               className="w-full h-full object-cover"
               style={{ transform: 'scaleX(-1)' }}/>
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} className="hidden"/>

        {/* Dark mask with banking-style capsule window */}
        <div className="absolute inset-0 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 100 133.33" preserveAspectRatio="none">
            <defs>
              <mask id="faceMask">
                <rect width="100" height="133.33" fill="white"/>
                <rect x="15" y="10" width="70" height="93.33" rx="35" fill="black"/>
              </mask>
            </defs>
            <rect width="100" height="133.33" fill="rgba(0,0,0,0.65)" mask="url(#faceMask)"/>
          </svg>
        </div>

        {/* Banking-style Scanning Reticle & Silhouette */}
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none"
             style={{ paddingTop: '10%' }}>
          <div className="w-[70%] aspect-[3/4] relative">
            
            {/* Segmented Outline Reticle */}
            <svg viewBox="0 0 200 266" className={`absolute inset-0 w-full h-full transition-all duration-500 ease-out ${ovalColor}`}>
               <rect x="4" y="4" width="192" height="258" rx="96" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="30 18" strokeLinecap="round" />
            </svg>
            
            {/* Target Crosshairs (Corner Brackets) */}
            <div className={`absolute top-0 left-0 w-8 h-8 border-t-[4px] border-l-[4px] rounded-tl-[30px] transition-colors duration-300 ${phase === 'countdown' ? 'border-success' : 'border-white/80'}`} />
            <div className={`absolute top-0 right-0 w-8 h-8 border-t-[4px] border-r-[4px] rounded-tr-[30px] transition-colors duration-300 ${phase === 'countdown' ? 'border-success' : 'border-white/80'}`} />
            <div className={`absolute bottom-0 left-0 w-8 h-8 border-b-[4px] border-l-[4px] rounded-bl-[30px] transition-colors duration-300 ${phase === 'countdown' ? 'border-success' : 'border-white/80'}`} />
            <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-[4px] border-r-[4px] rounded-br-[30px] transition-colors duration-300 ${phase === 'countdown' ? 'border-success' : 'border-white/80'}`} />

            {/* Guide Silhouette Avatar */}
            <svg viewBox="0 0 200 266" className={`absolute inset-0 w-full h-full transition-all duration-500 ${phase === 'positioning' ? 'text-white/40 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] animate-pulse' : 'text-white/10'}`}>
              {/* Head */}
              <path d="M100 40C125 40 145 62 145 95C145 125 125 150 100 150C75 150 55 125 55 95C55 62 75 40 100 40Z" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
              {/* Shoulders */}
              <path d="M30 260C30 200 60 170 100 170C140 170 170 200 170 260" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
            </svg>
            
          </div>
        </div>

        {/* Scanning sweep line */}
        {(phase === 'positioning' || phase === 'hold-still') && (
          <div className="absolute left-[20%] right-[20%] h-[2px] bg-gradient-to-r
                          from-transparent via-primary to-transparent
                          animate-scan-line pointer-events-none shadow-[0_0_10px_rgba(124,58,237,0.8)]"/>
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
      <div className="px-4 pt-4 pb-2">
        <div className={`flex items-center gap-3 p-4 rounded-2xl transition-all duration-300 glass-card ${
          instruction.type === 'success' ? 'border-success/30 shadow-[0_4px_16px_rgba(16,185,129,0.15)]' :
          instruction.type === 'error'   ? 'border-danger/30 shadow-[0_4px_16px_rgba(220,38,38,0.15)]'  :
          instruction.type === 'warning' ? 'border-warning/30 shadow-[0_4px_16px_rgba(245,158,11,0.15)]' :
                                           'border-primary/20 shadow-[0_4px_16px_rgba(124,58,237,0.1)]'
        }`}>
          <span className="text-2xl drop-shadow-md">{instruction.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-[15px] font-black ${
              instruction.type === 'success' ? 'text-success' :
              instruction.type === 'error'   ? 'text-danger'  :
              instruction.type === 'warning' ? 'text-warning' : 'text-primary'
            }`}>{instruction.text}</p>
          </div>
        </div>
      </div>

      {/* ── Quick tips ── */}
      {(phase === 'positioning' || phase === 'initializing') && (
        <div className="px-4 pb-2">
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: '💡', tip: 'Face a bright window or lamp' },
              { icon: '👓', tip: 'Remove glasses if possible' },
              { icon: '😐', tip: 'Look straight at the camera' },
            ].map((t) => (
              <div key={t.tip} className="glass-card rounded-xl p-3 text-center transition-transform hover:-translate-y-0.5">
                <div className="text-xl mb-1.5 drop-shadow-sm">{t.icon}</div>
                <p className="text-[10px] text-foreground/70 font-bold leading-tight">{t.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="px-4 pb-5 space-y-3 mt-2">
        {/* Manual capture fallback */}
        {(showManualFallback || manualMode) && phase !== 'uploading' && phase !== 'capturing' && (
          manualMode ? (
            <button onClick={handleManualCapture}
                    className="btn-liquid w-full py-4 rounded-[1.2rem] font-black text-[0.95rem] text-white">
              Capture Now
            </button>
          ) : (
            <button onClick={() => setManualMode(true)}
                    className="w-full py-3 rounded-xl glass-panel border border-border
                               text-sm font-bold text-muted hover:text-primary transition-colors">
              Having trouble? Switch to manual capture
            </button>
          )
        )}

        {/* Continue early once minimum met */}
        {approved >= MIN_SAMPLES && (
          <button onClick={handleComplete}
                  className="btn-liquid w-full py-4 rounded-[1.2rem] font-black text-[0.95rem] text-white
                             shadow-[0_4px_20px_rgba(5,150,105,0.4)]"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
            Continue with {approved} Samples ✓
          </button>
        )}
      </div>

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

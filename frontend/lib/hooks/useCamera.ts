'use client';
// ============================================================================
// useCamera — Camera stream + MediaPipe FaceLandmarker analysis.
//
// Replaces @vladmandic/face-api. Key improvements:
//  - 3–5× faster (WebAssembly + GPU delegate vs TensorFlow.js)
//  - Nose-tip landmark for sub-pixel stability tracking
//  - Real eye-open/closed detection via eyeBlinkLeft/Right blendshapes
//  - Head-angle check via landmark geometry
//  - Full 52 ARKit blendshapes exposed for liveness verification
// ============================================================================

import { useRef, useState, useCallback, useEffect } from 'react';
import { getFaceLandmarker } from '@/lib/mediapipe';

export interface CameraOptions {
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  autoStart?: boolean;
}

export interface FrameAnalysis {
  /** A face is detected and roughly centred in the oval guide. */
  hasCenterContent: boolean;
  /** Average brightness of the centre region (0–255). */
  centerBrightness: number;
  /** Normalised face-centre movement between frames (0–1). 0 = no movement. */
  motionDelta: number;
  /** True when the face has been still for STABLE_FRAME_COUNT consecutive frames. */
  isStable: boolean;
  /** 1.0 when a face is detected in the oval, 0.0 otherwise (kept for compat). */
  skinToneRatio: number;
  /** Both eyes open (eyeBlinkLeft + eyeBlinkRight each < 0.45). */
  eyesOpen: boolean;
  /** Face is roughly frontal — yaw within ±22° (nose close to eye midpoint). */
  faceFrontal: boolean;
  /**
   * Normalised head yaw: (noseTip.x − eyeMidpoint.x) / faceWidth.
   * Positive = face turned to camera-left (student's right).
   * Negative = face turned to camera-right (student's left).
   * Magnitude > 0.08 = significant turn.
   */
  headYaw: number;
  /** All 52 ARKit blendshape scores keyed by categoryName. */
  blendshapes: Record<string, number>;
  /**
   * Raw MediaPipe face landmarks (normalised 0–1 coords), null when no face
   * detected. Passed to facePreprocess.alignFace() for offline ArcFace matching.
   */
  landmarks: { x: number; y: number; z: number }[] | null;
}

// Face centre must stay within this many normalised units (0–1 x-coords)
// to be considered "stable". 0.03 ≈ 19px on a 640-wide feed.
const STABLE_NORM_THRESHOLD = 0.03;
// How many consecutive stable frames before isStable = true.
// At 120ms interval → 3 × 120ms = 360ms of genuine stillness.
const STABLE_FRAME_COUNT = 3;

export function useCamera(options: CameraOptions = {}) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  // Previous nose-tip position in normalised [0,1] coords.
  const prevNosePosRef = useRef<{ x: number; y: number } | null>(null);
  const stableCountRef = useRef(0);

  const [isActive,     setIsActive]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Pre-warm MediaPipe on mount so the first analyzeFrame call is fast.
  useEffect(() => {
    let active = true;
    getFaceLandmarker()
      .then(() => { if (active) setModelsLoaded(true); })
      .catch((e) => console.error('[MediaPipe] init failed:', e));
    return () => { active = false; };
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: options.facingMode || 'user',
          width:  { ideal: options.width  || 640 },
          height: { ideal: options.height || 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access denied');
      setIsActive(false);
    }
  }, [options.facingMode, options.width, options.height]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false);
    prevNosePosRef.current = null;
    stableCountRef.current = 0;
    const ovCtx = overlayRef.current?.getContext('2d');
    if (ovCtx && overlayRef.current) {
      ovCtx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }
  }, []);

  const captureFrame = useCallback((): File | null => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const raw  = atob(b64);
    const u8   = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    return new File([u8], `capture_${Date.now()}.jpg`, { type: mime });
  }, []);

  const analyzeFrame = useCallback(async (): Promise<FrameAnalysis | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    if (!modelsLoaded) return null;

    const landmarker = await getFaceLandmarker();
    // VIDEO mode requires a monotonically increasing timestamp (ms).
    const result = landmarker.detectForVideo(video, performance.now());

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // ── Overlay drawing ─────────────────────────────────────────────────────
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width  = video.clientWidth  || vw;
      overlay.height = video.clientHeight || vh;
      const oCtx = overlay.getContext('2d');
      if (oCtx) {
        oCtx.clearRect(0, 0, overlay.width, overlay.height);
        const lm = result.faceLandmarks?.[0];
        if (lm && lm.length > 0) {
          // Draw bracket corners around the face using key landmarks.
          // Scale from normalised [0,1] to overlay canvas pixels.
          const sx = overlay.width, sy = overlay.height;
          const pts = [33, 263, 1, 152, 234, 454].map((i) => ({
            x: lm[i].x * sx, y: lm[i].y * sy,
          }));
          const minX = Math.min(...pts.map((p) => p.x));
          const maxX = Math.max(...pts.map((p) => p.x));
          const minY = Math.min(...pts.map((p) => p.y));
          const maxY = Math.max(...pts.map((p) => p.y));
          const pad = (maxX - minX) * 0.15;
          const bx = minX - pad, by = minY - pad;
          const bw = (maxX - minX) + pad * 2;
          const bh = (maxY - minY) + pad * 2;
          const cl = Math.min(bw, bh) * 0.18;

          oCtx.strokeStyle = 'rgba(0, 255, 140, 0.90)';
          oCtx.lineWidth   = 2.5;
          oCtx.beginPath();
          // TL
          oCtx.moveTo(bx, by + cl); oCtx.lineTo(bx, by); oCtx.lineTo(bx + cl, by);
          // TR
          oCtx.moveTo(bx + bw - cl, by); oCtx.lineTo(bx + bw, by); oCtx.lineTo(bx + bw, by + cl);
          // BR
          oCtx.moveTo(bx + bw, by + bh - cl); oCtx.lineTo(bx + bw, by + bh); oCtx.lineTo(bx + bw - cl, by + bh);
          // BL
          oCtx.moveTo(bx + cl, by + bh); oCtx.lineTo(bx, by + bh); oCtx.lineTo(bx, by + bh - cl);
          oCtx.stroke();
          oCtx.fillStyle = 'rgba(0, 255, 140, 0.06)';
          oCtx.fillRect(bx, by, bw, bh);
        }
      }
    }

    // ── Brightness (quick centre sample) ────────────────────────────────────
    const canvas = canvasRef.current;
    let centerBrightness = 120; // safe default
    if (canvas) {
      canvas.width = vw; canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const r = 36;
        const cx = Math.floor(vw / 2), cy = Math.floor(vh / 2);
        const px = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
        let s = 0;
        for (let i = 0; i < px.length; i += 4) s += (px[i] + px[i + 1] + px[i + 2]) / 3;
        centerBrightness = s / (px.length / 4);
      }
    }

    // ── Face analysis ────────────────────────────────────────────────────────
    const lm = result.faceLandmarks?.[0] ?? null;
    const rawBlendshapes = result.faceBlendshapes?.[0]?.categories ?? [];
    const blendshapes: Record<string, number> = {};
    for (const c of rawBlendshapes) blendshapes[c.categoryName] = c.score;

    let isStable      = false;
    let motionDelta   = 1.0;
    let faceInOval    = false;
    let eyesOpen      = true;
    let faceFrontal   = true;
    let headYaw       = 0; // exposed for liveness head-turn detection

    if (lm && lm.length > 0) {
      // Nose tip = landmark 1
      const nose = lm[1];

      // Stability: track nose tip position in normalised coords
      if (prevNosePosRef.current) {
        const dx = nose.x - prevNosePosRef.current.x;
        const dy = nose.y - prevNosePosRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        motionDelta = dist;
        if (dist < STABLE_NORM_THRESHOLD) {
          stableCountRef.current = Math.min(stableCountRef.current + 1, STABLE_FRAME_COUNT + 4);
        } else {
          stableCountRef.current = 0;
        }
      } else {
        stableCountRef.current = 0;
      }
      prevNosePosRef.current = { x: nose.x, y: nose.y };
      isStable = stableCountRef.current >= STABLE_FRAME_COUNT;

      // Is face centred in oval? Use nose tip proximity to oval centre.
      const ovalCx = 0.50, ovalCy = 0.43;
      const ovalRx = 0.29, ovalRy = 0.37;
      const dx2 = (nose.x - ovalCx) / ovalRx;
      const dy2 = (nose.y - ovalCy) / ovalRy;
      faceInOval = dx2 * dx2 + dy2 * dy2 <= 1.5;

      // Eyes open — blink scores < 0.45 means eyes are open
      const blinkL = blendshapes['eyeBlinkLeft']  ?? 0;
      const blinkR = blendshapes['eyeBlinkRight'] ?? 0;
      eyesOpen = blinkL < 0.45 && blinkR < 0.45;

      // Head frontal — check yaw from nose vs eye midpoint
      const leftEye  = lm[33];   // left eye outer corner
      const rightEye = lm[263];  // right eye outer corner
      const eyeMidX  = (leftEye.x + rightEye.x) / 2;
      const faceW    = Math.abs(rightEye.x - leftEye.x);
      const yaw      = faceW > 0.01 ? (nose.x - eyeMidX) / faceW : 0;
      headYaw        = yaw;
      faceFrontal    = Math.abs(yaw) < 0.22; // within ~22° of frontal
    } else {
      prevNosePosRef.current = null;
      stableCountRef.current = 0;
    }

    return {
      hasCenterContent: faceInOval,
      centerBrightness,
      motionDelta,
      isStable: isStable && faceInOval,
      skinToneRatio: faceInOval ? 1.0 : 0.0,
      eyesOpen,
      faceFrontal,
      headYaw,
      blendshapes,
      landmarks: lm ?? null,
    };
  }, [modelsLoaded]);

  useEffect(() => {
    if (options.autoStart) start();
  }, [options.autoStart, start]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef, canvasRef, overlayRef,
    isActive, error, modelsLoaded,
    start, stop, captureFrame, analyzeFrame,
  };
}

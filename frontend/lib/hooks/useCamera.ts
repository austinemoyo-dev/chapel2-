'use client';
// ============================================================================
// useCamera — Camera access, frame capture, and motion/stability analysis
// Upgraded to use @vladmandic/face-api for robust machine-learning face detection.
// ============================================================================

import { useRef, useState, useCallback, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';

interface CameraOptions {
  facingMode?: 'user' | 'environment';
  width?: number;
  height?: number;
  autoStart?: boolean;
}

interface FrameAnalysis {
  /** Whether there's meaningful content in the center oval region */
  hasCenterContent: boolean;
  /** Brightness of the center region (0-255) */
  centerBrightness: number;
  /** How much the frame changed compared to the previous (0-1) */
  motionDelta: number;
  /** Whether the scene is stable (low motion) */
  isStable: boolean;
  /** Repurposed: 1.0 if real face is detected in oval, 0.0 otherwise */
  skinToneRatio: number;
}

export function useCamera(options: CameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const stabilityCountRef = useRef(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Load face-api models on mount
  useEffect(() => {
    let mounted = true;
    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        if (mounted) setModelsLoaded(true);
      } catch (err) {
        console.error('Failed to load face-api models', err);
      }
    };
    loadModels();
    return () => { mounted = false; };
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: options.facingMode || 'user',
          width: { ideal: options.width || 640 },
          height: { ideal: options.height || 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera access denied';
      setError(msg);
      setIsActive(false);
    }
  }, [options.facingMode, options.width, options.height]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    prevFrameRef.current = null;
    stabilityCountRef.current = 0;
    
    // Clear overlay on stop
    if (overlayRef.current) {
      const ctx = overlayRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }
  }, []);

  const captureFrame = useCallback((): File | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], `capture_${Date.now()}.jpg`, { type: mime });
  }, []);

  /**
   * Analyze the current camera frame.
   * Now uses real ML face detection instead of skin-tone heuristic.
   */
  const analyzeFrame = useCallback(async (): Promise<FrameAnalysis | null> => {
    if (!modelsLoaded || !videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    // ML Face Detection
    const detection = await faceapi.detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 })
    );

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);

    // Overlay visual
    if (overlayRef.current) {
      const overlay = overlayRef.current;
      overlay.width = video.clientWidth || video.videoWidth;
      overlay.height = video.clientHeight || video.videoHeight;
      const oCtx = overlay.getContext('2d');
      if (oCtx) {
        oCtx.clearRect(0, 0, overlay.width, overlay.height);
        
        if (detection) {
          // Map detection box to overlay canvas size
          const scaleX = overlay.width / video.videoWidth;
          const scaleY = overlay.height / video.videoHeight;
          const box = detection.box;
          
          const x = box.x * scaleX;
          const y = box.y * scaleY;
          const w = box.width * scaleX;
          const h = box.height * scaleY;

          // Draw futuristic targeting bracket
          const cornerLength = Math.min(w, h) * 0.2;
          oCtx.strokeStyle = 'rgba(0, 255, 128, 0.8)';
          oCtx.lineWidth = 3;
          oCtx.beginPath();
          
          // Top Left
          oCtx.moveTo(x, y + cornerLength);
          oCtx.lineTo(x, y);
          oCtx.lineTo(x + cornerLength, y);
          
          // Top Right
          oCtx.moveTo(x + w - cornerLength, y);
          oCtx.lineTo(x + w, y);
          oCtx.lineTo(x + w, y + cornerLength);
          
          // Bottom Right
          oCtx.moveTo(x + w, y + h - cornerLength);
          oCtx.lineTo(x + w, y + h);
          oCtx.lineTo(x + w - cornerLength, y + h);
          
          // Bottom Left
          oCtx.moveTo(x + cornerLength, y + h);
          oCtx.lineTo(x, y + h);
          oCtx.lineTo(x, y + h - cornerLength);
          
          oCtx.stroke();
          
          // Draw subtle fill
          oCtx.fillStyle = 'rgba(0, 255, 128, 0.1)';
          oCtx.fillRect(x, y, w, h);
        }
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.28;
    const ry = h * 0.38;

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let totalPixels = 0;
    let brightnessSum = 0;
    let motionSum = 0;
    let motionPixels = 0;

    const step = 4;
    for (let y = Math.floor(cy - ry); y < Math.floor(cy + ry); y += step) {
      for (let x = Math.floor(cx - rx); x < Math.floor(cx + rx); x += step) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;

        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        totalPixels++;
        brightnessSum += (r + g + b) / 3;

        if (prevFrameRef.current) {
          const prevR = prevFrameRef.current[idx];
          const prevG = prevFrameRef.current[idx + 1];
          const prevB = prevFrameRef.current[idx + 2];
          const diff = Math.abs(r - prevR) + Math.abs(g - prevG) + Math.abs(b - prevB);
          motionSum += diff;
          motionPixels++;
        }
      }
    }

    prevFrameRef.current = new Uint8ClampedArray(data);

    if (totalPixels === 0) return null;

    const centerBrightness = brightnessSum / totalPixels;
    const motionDelta = motionPixels > 0 ? motionSum / (motionPixels * 765) : 0;
    const isStable = motionDelta < 0.025;

    if (isStable) {
      stabilityCountRef.current++;
    } else {
      stabilityCountRef.current = 0;
    }

    let faceInOval = false;
    if (detection) {
      const box = detection.box;
      const faceCx = box.x + box.width / 2;
      const faceCy = box.y + box.height / 2;
      
      const dx = (faceCx - cx) / rx;
      const dy = (faceCy - cy) / ry;
      if (dx * dx + dy * dy <= 1.8) {
         faceInOval = true;
      }
    }

    return {
      hasCenterContent: centerBrightness > 30 && faceInOval,
      centerBrightness,
      motionDelta,
      isStable: stabilityCountRef.current >= 1,
      skinToneRatio: faceInOval ? 1.0 : 0.0,
    };
  }, [modelsLoaded]);

  useEffect(() => {
    if (options.autoStart) start();
  }, [options.autoStart, start]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, canvasRef, overlayRef, isActive, error, modelsLoaded, start, stop, captureFrame, analyzeFrame };
}

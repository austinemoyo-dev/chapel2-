/**
 * MediaPipe FaceLandmarker singleton.
 *
 * Initializes once on first call and reuses the same instance everywhere.
 * Uses the CDN-hosted WASM runtime and model (browser caches both after
 * the first load). Switch to self-hosted paths in DEPLOY.md if offline
 * PWA support without network is required.
 *
 * Model includes:
 *  - 478 3D face landmarks
 *  - 52 ARKit face blendshapes (blink, smile, jaw, etc.)
 *  - GPU-accelerated via WebGL delegate
 */

import type { FaceLandmarker as FaceLandmarkerType } from '@mediapipe/tasks-vision';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let instance: FaceLandmarkerType | null = null;
let initPromise: Promise<FaceLandmarkerType> | null = null;

/**
 * Returns the shared FaceLandmarker instance (creates it on first call).
 * Safe to call multiple times — subsequent calls return the cached instance.
 */
export async function getFaceLandmarker(): Promise<FaceLandmarkerType> {
  if (instance) return instance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    );
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
    instance = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      runningMode:           'VIDEO',
      numFaces:              1,
    });
    return instance;
  })();

  return initPromise;
}

/** Helper: look up a single blendshape score by ARKit name (0–1). */
export function bs(
  blendshapes: Record<string, number>,
  name: string,
): number {
  return blendshapes[name] ?? 0;
}

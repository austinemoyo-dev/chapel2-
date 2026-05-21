'use client';
// ============================================================================
// faceModel — Download, cache, and run the ArcFace ONNX model in the browser.
//
// The buffalo_l recognition model (w600k_r50.onnx, ~166 MB) is downloaded once
// from /api/attendance/offline-model/ while the device is online, stored as an
// ArrayBuffer in IndexedDB, and loaded into an ONNX Runtime Web InferenceSession
// when needed for offline face matching.
//
// Model key stored in IndexedDB: 'arcface_v1'
// ============================================================================

import { saveModel, loadModel, isModelCached } from './db';

// ONNX Runtime WASM files are served from public/ort-wasm/.
// These paths must be set BEFORE any InferenceSession is created.
const WASM_PATHS = {
  mjs:  '/ort-wasm/ort-wasm-simd-threaded.mjs',
  wasm: '/ort-wasm/ort-wasm-simd-threaded.wasm',
};

// All iOS browsers (Safari, Chrome/CriOS, Firefox/FxiOS, etc.) are required by
// Apple to use the WebKit engine, which imposes strict WebAssembly memory limits.
// A 166 MB model with SIMD WASM reliably triggers RangeError: Out of memory.
// WebGL runs the model on the GPU and sidesteps that constraint entirely.
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent);
}
const MODEL_KEY   = 'arcface_v1';
const MODEL_URL   = '/api/attendance/offline-model/';

/** Lazy singleton — the session is expensive to create, so we reuse it. */
let _session: unknown | null = null; // typed as unknown to avoid importing ort at module level

/**
 * Download the ArcFace ONNX model from the backend with progress reporting.
 * Saves the raw ArrayBuffer to IndexedDB for offline use.
 * Safe to call repeatedly — exits immediately if already cached.
 *
 * @param onProgress  Called with 0–100 as the download progresses.
 */
export async function downloadAndCacheModel(
  onProgress: (pct: number) => void,
): Promise<void> {
  if (await isModelCached(MODEL_KEY)) {
    onProgress(100);
    return;
  }

  const response = await fetch(MODEL_URL, {
    headers: {
      Authorization: `Bearer ${
        typeof window !== 'undefined'
          ? localStorage.getItem('chapel_access_token') || ''
          : ''
      }`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download offline model: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get('Content-Length') || '0');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body not readable');

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress(Math.round((received / total) * 100));
  }

  // Assemble chunks into a single ArrayBuffer
  const fullArray = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    fullArray.set(chunk, offset);
    offset += chunk.length;
  }

  await saveModel(MODEL_KEY, fullArray.buffer);
  onProgress(100);
  
  // Warm up the session immediately while online. This forces the browser to
  // download the 'onnxruntime-web' JS chunk and the '.wasm' file, ensuring
  // the Service Worker caches them for offline use.
  await getSession().catch(err => console.warn('[faceModel] Warmup failed:', err));
}

/** Returns true if the model ArrayBuffer is in IndexedDB and session can be created. */
export async function isModelReady(): Promise<boolean> {
  const cached = await isModelCached(MODEL_KEY);
  if (cached) {
    try {
      // Warm up session so WASM is cached before going offline
      await getSession();
      return true;
    } catch (err) {
      console.warn('[faceModel] Cached model warmup failed:', err);
      return false;
    }
  }
  return false;
}

/**
 * Load the ONNX InferenceSession from the cached model.
 * Returns the same session on subsequent calls (singleton).
 */
export async function getSession(): Promise<unknown> {
  if (_session) return _session;

  const buffer = await loadModel(MODEL_KEY);
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('ArcFace model not cached. Download it while online first.');
  }

  // Dynamic import so onnxruntime-web is only bundled client-side
  const ort = await import('onnxruntime-web');

  // Point to the exact self-hosted runtime files and avoid spawning proxy or
  // thread worker scripts during an offline scan.
  ort.env.wasm.wasmPaths = WASM_PATHS;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;

  // iOS Safari's WebAssembly memory limit causes OOM with the SIMD WASM build.
  // WebGL runs inference on the GPU and avoids that constraint entirely.
  const executionProviders = isIOSDevice() ? ['webgl', 'wasm'] : ['wasm'];

  try {
    _session = await ort.InferenceSession.create(buffer, {
      executionProviders,
      graphOptimizationLevel: 'all',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (lower.includes('out of memory') || lower.includes('rangeerror')) {
      throw new Error('Not enough memory to load the offline model on this device. Please use online scanning.');
    }
    if (lower.includes('no available backend') || lower.includes('backend')) {
      throw new Error('Offline face recognition is not supported on this browser or device. Please use online scanning.');
    }
    throw err;
  }

  return _session;
}

/**
 * Run ArcFace inference on a pre-processed 112×112 face tensor.
 *
 * @param alignedTensor  Float32Array of shape [1, 3, 112, 112] from facePreprocess
 * @returns              512-dimensional embedding as Float32Array
 */
export async function extractEmbedding(alignedTensor: Float32Array): Promise<Float32Array> {
  const ort     = await import('onnxruntime-web');
  const session = await getSession() as import('onnxruntime-web').InferenceSession;

  const inputName  = session.inputNames[0];
  const outputName = session.outputNames[0];

  if (!inputName || !outputName) {
    throw new Error('ArcFace model has unexpected input/output names.');
  }

  const tensor  = new ort.Tensor('float32', alignedTensor, [1, 3, 112, 112]);
  const feeds   = { [inputName]: tensor };
  const results = await session.run(feeds);
  const output  = results[outputName];

  if (!output?.data) {
    throw new Error('ArcFace model returned no output — try again.');
  }

  const embedding = output.data as Float32Array;
  if (embedding.length !== 512) {
    throw new Error(`Invalid embedding size: expected 512, got ${embedding.length}.`);
  }

  return embedding;
}

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

// ONNX Runtime WASM files were copied to public/ort-wasm/ at install time.
// This path must be set BEFORE any InferenceSession is created.
const WASM_PATH   = '/ort-wasm/';
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
}

/** Returns true if the model ArrayBuffer is in IndexedDB. */
export async function isModelReady(): Promise<boolean> {
  return isModelCached(MODEL_KEY);
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

  // Point to our self-hosted WASM files
  ort.env.wasm.wasmPaths = WASM_PATH;

  _session = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

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

  // The buffalo_l recognition model uses input name 'input.1'
  const inputName  = session.inputNames[0];
  const outputName = session.outputNames[0];

  const tensor  = new ort.Tensor('float32', alignedTensor, [1, 3, 112, 112]);
  const feeds   = { [inputName]: tensor };
  const results = await session.run(feeds);
  const output  = results[outputName];

  return output.data as Float32Array;
}

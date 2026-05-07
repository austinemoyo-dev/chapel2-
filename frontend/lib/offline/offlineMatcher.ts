'use client';
// ============================================================================
// offlineMatcher — Cosine similarity 1-to-N face matching against the
//                  student embedding pool cached in IndexedDB.
//
// Uses exactly the same threshold and normalisation logic as the server-side
// match_1_to_n_cached in apps/core/face.py so results are consistent.
// ============================================================================

import type { CachedEmbeddings } from './db';

export interface OfflineMatchResult {
  matched: boolean;
  student_id: string | null;
  student_name: string | null;
  /** Cosine similarity of the best match (higher = more confident). */
  confidence: number;
}

/**
 * Cosine distance threshold — must match INSIGHTFACE_MATCH_THRESHOLD on the
 * server (default 0.40). Lower = stricter matching.
 */
const DEFAULT_THRESHOLD = 0.40;

/** Normalise a Float32Array to unit length (L2 norm). */
function normalise(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm < 1e-10) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** Dot product of two equal-length typed arrays. */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ─── Pre-normalised pool ──────────────────────────────────────────────────────
// Build once when embeddings are loaded; reuse on every scan.
// Eliminates per-scan normalisation of all stored embeddings.

export interface NormalisedPool {
  student_id:   string;
  student_name: string;
  vectors:      Float32Array[];
}

/**
 * Pre-normalise all stored embeddings into a ready-to-match pool.
 * Call this once when embeddings are loaded, then pass the result to
 * matchNormalised() on every scan.
 */
export function buildNormalisedPool(
  embeddings: CachedEmbeddings['embeddings'],
): NormalisedPool[] {
  return embeddings
    .filter(e => e.embeddings && e.embeddings.length > 0)
    .map(e => ({
      student_id:   e.student_id,
      student_name: e.student_name,
      vectors: e.embeddings
        .filter(v => v && v.length === 512)
        .map(v => normalise(new Float32Array(v))),
    }))
    .filter(e => e.vectors.length > 0);
}

/**
 * Match a probe embedding against a pre-normalised pool.
 * Stored embeddings are already unit-length — no normalisation per scan.
 */
export function matchNormalised(
  probe: Float32Array,
  pool: NormalisedPool[],
  threshold: number = DEFAULT_THRESHOLD,
): OfflineMatchResult {
  if (pool.length === 0) {
    return { matched: false, student_id: null, student_name: null, confidence: 0 };
  }

  const normProbe = normalise(probe);
  let bestStudentId:   string | null = null;
  let bestStudentName: string | null = null;
  let bestSimilarity = -Infinity;

  for (const entry of pool) {
    let studentBest = -Infinity;
    for (const stored of entry.vectors) {
      const sim = dot(normProbe, stored);
      if (sim > studentBest) studentBest = sim;
    }
    if (studentBest > bestSimilarity) {
      bestSimilarity   = studentBest;
      bestStudentId    = entry.student_id;
      bestStudentName  = entry.student_name;
    }
  }

  if (bestSimilarity === -Infinity) {
    return { matched: false, student_id: null, student_name: null, confidence: 0 };
  }

  const cosineDist = 1.0 - bestSimilarity;
  return {
    matched:      cosineDist < threshold,
    student_id:   cosineDist < threshold ? bestStudentId   : null,
    student_name: cosineDist < threshold ? bestStudentName : null,
    confidence:   bestSimilarity,
  };
}

/**
 * Compare a probe embedding against all cached student embeddings.
 * Each student may have up to 5 face samples — we take the max similarity
 * across their samples as the per-student score, then pick the best student.
 *
 * @param probe      512-dim ArcFace embedding from the live camera frame
 * @param pool       Student embeddings downloaded and cached before the service
 * @param threshold  Cosine DISTANCE threshold (1 − similarity). Default 0.40.
 */
export function matchOffline(
  probe: Float32Array,
  pool: CachedEmbeddings,
  threshold: number = DEFAULT_THRESHOLD,
): OfflineMatchResult {
  const normProbe = normalise(probe);

  let bestStudentId:   string | null = null;
  let bestStudentName: string | null = null;
  let bestSimilarity = -Infinity;

  for (const entry of pool.embeddings) {
    if (!entry.embeddings || entry.embeddings.length === 0) continue;

    let studentBest = -Infinity;
    for (const storedEmb of entry.embeddings) {
      if (!storedEmb || storedEmb.length !== 512) continue;
      const stored = normalise(new Float32Array(storedEmb));
      const sim    = dot(normProbe, stored);
      if (sim > studentBest) studentBest = sim;
    }

    if (studentBest > bestSimilarity) {
      bestSimilarity   = studentBest;
      bestStudentId    = entry.student_id;
      bestStudentName  = entry.student_name;
    }
  }

  if (bestSimilarity === -Infinity) {
    return { matched: false, student_id: null, student_name: null, confidence: 0 };
  }

  const cosineDist = 1.0 - bestSimilarity;
  return {
    matched:      cosineDist < threshold,
    student_id:   cosineDist < threshold ? bestStudentId   : null,
    student_name: cosineDist < threshold ? bestStudentName : null,
    confidence:   bestSimilarity,
  };
}

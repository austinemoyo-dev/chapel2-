// ============================================================================
// Face Match — Cosine distance computation for offline 1-to-N matching.
// Uses the same algorithm and threshold as the Django backend (DeepFace cosine).
// ============================================================================

import { FACE_MATCH_THRESHOLD } from '@/lib/utils/constants';

export interface EmbeddingEntry {
  student_id: string;
  student_name: string;
  embeddings: number[][];  // Multiple embedding vectors per student
}

export interface MatchResult {
  matched: boolean;
  student_id: string;
  student_name: string;
  confidence: number;
  message: string;
}

/**
 * Compute cosine distance between two vectors.
 * cosine_distance = 1 - cosine_similarity
 * Lower distance = more similar. Threshold from backend is 0.30.
 */
function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 1;

  return 1 - dotProduct / denominator;
}

/**
 * Match a face embedding against a pool of cached embeddings (1-to-N).
 * Returns the best match below the threshold.
 *
 * @param queryEmbedding - 512-dim Facenet512 embedding from captured face
 * @param pool - Cached embeddings for the service's student pool
 * @param threshold - Match threshold (default: backend's DEEPFACE_MATCH_THRESHOLD)
 */
export function matchFace1toN(
  queryEmbedding: number[],
  pool: EmbeddingEntry[],
  threshold: number = FACE_MATCH_THRESHOLD
): MatchResult {
  let bestMatch: MatchResult = {
    matched: false,
    student_id: '',
    student_name: '',
    confidence: 0,
    message: 'No match found in the service pool.',
  };

  let bestDistance = Infinity;

  for (const entry of pool) {
    for (const embedding of entry.embeddings) {
      const distance = cosineDistance(queryEmbedding, embedding);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = {
          matched: distance <= threshold,
          student_id: entry.student_id,
          student_name: entry.student_name,
          confidence: Math.round((1 - distance) * 100) / 100,
          message: distance <= threshold
            ? `Matched: ${entry.student_name}`
            : 'No match found in the service pool.',
        };
      }
    }
  }

  return bestMatch;
}

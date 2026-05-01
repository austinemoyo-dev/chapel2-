// ============================================================================
// JWT Utilities — Decode tokens without a library, check expiry, extract claims.
// ============================================================================

export interface JWTPayload {
  token_type: string;
  exp: number;
  iat: number;
  jti: string;
  user_id: string;
  /** Custom claims added by backend CustomTokenObtainPairSerializer */
  role: string;
  full_name: string;
  email: string;
}

/**
 * Decode a JWT token without verification (client-side only).
 * The signature is verified by the backend — we just need the payload.
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    // Base64url to base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired.
 * Includes a 30-second buffer to prevent edge-case failures.
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload) return true;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now + 30; // 30s buffer
}

/**
 * Get the remaining lifetime of a token in seconds.
 */
export function getTokenRemainingTime(token: string): number {
  const payload = decodeJWT(token);
  if (!payload) return 0;

  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - now);
}

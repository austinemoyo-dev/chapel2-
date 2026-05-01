// ============================================================================
// Validators — Form field validation helpers matching backend constraints.
// ============================================================================

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate phone number (basic — digits, spaces, dashes, plus).
 */
export function isValidPhone(phone: string): boolean {
  return /^[+\d][\d\s-]{7,19}$/.test(phone.trim());
}

/**
 * Validate matric number (alphanumeric, slashes allowed).
 */
export function isValidMatric(matric: string): boolean {
  return /^[A-Za-z0-9/]{3,50}$/.test(matric.trim());
}

/**
 * Validate password meets minimum requirements.
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

/**
 * Validate that a name has at least 2 words.
 */
export function isValidFullName(name: string): boolean {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && parts.every((p) => p.length >= 2);
}

/**
 * Validate UUID format.
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

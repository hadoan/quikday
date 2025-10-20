import { createHmac, timingSafeEqual } from 'crypto';

/**
 * OAuth State Management Utilities
 *
 * Provides secure state parameter generation and validation for OAuth flows.
 * Uses HMAC-SHA256 signing to prevent tampering and includes timestamps
 * for replay attack prevention.
 */

export interface OAuthState {
  /** User ID (Kinde sub) initiating the OAuth flow */
  userId: string;
  /** Timestamp when state was created (for expiry checking) */
  timestamp: number;
  /** Optional return URL after successful OAuth */
  returnTo?: string;
  /** Any additional metadata needed for the flow */
  metadata?: Record<string, any>;
}

/**
 * Get signing secret from environment.
 * Falls back to a default for development (NOT secure for production).
 */
function getSigningSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET;

  if (!secret) {
    console.warn(
      '⚠️  OAUTH_STATE_SECRET not set. Using insecure default. ' +
        'Set OAUTH_STATE_SECRET in production!'
    );
    return 'insecure-default-secret-change-in-production';
  }

  return secret;
}

/**
 * Sign a state object with HMAC-SHA256.
 * Returns base64url-encoded signature.
 */
function signState(data: string): string {
  const secret = getSigningSecret();
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('base64url');
}

/**
 * Verify HMAC signature using timing-safe comparison.
 */
function verifySignature(data: string, signature: string): boolean {
  const expected = signState(data);

  // Timing-safe comparison to prevent timing attacks
  try {
    const expectedBuffer = Buffer.from(expected, 'base64url');
    const signatureBuffer = Buffer.from(signature, 'base64url');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Create a signed state parameter for OAuth flows.
 *
 * Format: base64url(JSON) + '.' + base64url(HMAC-SHA256)
 *
 * @param state - State data to encode and sign
 * @returns URL-safe signed state string
 *
 * @example
 * ```typescript
 * const state = createSignedState({
 *   userId: 'kp_123abc',
 *   timestamp: Date.now(),
 *   returnTo: '/dashboard',
 * });
 * // Use in OAuth URL: ?state=${encodeURIComponent(state)}
 * ```
 */
export function createSignedState(state: OAuthState): string {
  const payload = {
    ...state,
    timestamp: state.timestamp || Date.now(),
  };

  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signState(data);

  return `${data}.${signature}`;
}

/**
 * Validate and parse a signed state parameter.
 *
 * @param signedState - Signed state string from OAuth callback
 * @param maxAgeMs - Maximum age in milliseconds (default: 10 minutes)
 * @returns Parsed state object if valid
 * @throws Error if signature invalid, expired, or malformed
 *
 * @example
 * ```typescript
 * try {
 *   const state = validateSignedState(req.query.state as string);
 *   const user = await prisma.user.findUnique({
 *     where: { sub: state.userId }
 *   });
 *   // Proceed with OAuth flow...
 * } catch (error) {
 *   // Invalid or tampered state
 *   return res.status(400).json({ error: 'Invalid state' });
 * }
 * ```
 */
export function validateSignedState(
  signedState: string,
  maxAgeMs: number = 10 * 60 * 1000 // 10 minutes default
): OAuthState {
  if (!signedState || typeof signedState !== 'string') {
    throw new Error('State parameter is required');
  }

  const parts = signedState.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid state format');
  }

  const [data, signature] = parts;

  // Verify signature
  if (!verifySignature(data, signature)) {
    throw new Error('Invalid state signature - possible tampering detected');
  }

  // Decode and parse data
  let state: OAuthState;
  try {
    const decoded = Buffer.from(data, 'base64url').toString('utf-8');
    state = JSON.parse(decoded);
  } catch {
    throw new Error('Failed to parse state data');
  }

  // Validate required fields
  if (!state.userId || typeof state.userId !== 'string') {
    throw new Error('State missing required userId field');
  }

  if (!state.timestamp || typeof state.timestamp !== 'number') {
    throw new Error('State missing required timestamp field');
  }

  // Check expiry
  const age = Date.now() - state.timestamp;
  if (age > maxAgeMs) {
    throw new Error(`State expired (age: ${Math.round(age / 1000)}s, max: ${maxAgeMs / 1000}s)`);
  }

  if (age < 0) {
    throw new Error('State timestamp is in the future - possible clock skew');
  }

  return state;
}

/**
 * Legacy support: Parse unsigned state (for migration).
 * Only use during transition period. Remove once all flows use signed state.
 *
 * @deprecated Use createSignedState/validateSignedState instead
 */
export function parseUnsignedState(rawState: string): Partial<OAuthState> {
  try {
    const parsed = JSON.parse(rawState);
    console.warn('⚠️  Received unsigned state - migrate to signed state ASAP', {
      hasUserId: !!parsed?.userId,
      timestamp: parsed?.timestamp,
    });
    return parsed;
  } catch {
    throw new Error('Failed to parse state');
  }
}

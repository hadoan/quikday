/* Utility to mask long secrets for logs and UI. */
export function maskSecret(secret: string, head = 2, tail = 2): string {
  if (!secret) return '';
  const len = secret.length;
  if (len <= head + tail) return '*'.repeat(Math.max(3, len));
  const prefix = secret.slice(0, head);
  const suffix = secret.slice(len - tail);
  const maskLen = Math.max(3, len - head - tail);
  return `${prefix}${'*'.repeat(maskLen)}${suffix}`;
}

// TODO: Consider moving to a shared utils package if needed.

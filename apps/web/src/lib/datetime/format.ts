// Simple date/time formatting helpers that respect user/browser timezone
// and produce friendly strings for UI. Accepts ISO strings or Date objects.

let cachedUserTz: string | null = null;

export function setUserTimeZone(tz: string | null | undefined) {
  if (typeof tz === 'string' && tz.trim()) {
    cachedUserTz = tz;
    try {
      localStorage.setItem('user.timeZone', tz);
    } catch {}
  }
}

export function getUserTimeZone(): string {
  try {
    if (cachedUserTz && typeof cachedUserTz === 'string') return cachedUserTz;
    try {
      const fromLs = localStorage.getItem('user.timeZone');
      if (fromLs && fromLs.trim()) {
        cachedUserTz = fromLs;
        return fromLs;
      }
    } catch {}
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function toDate(value: string | Date | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.valueOf()) ? null : value;
  try {
    const d = new Date(value as any);
    return isNaN(d.valueOf()) ? null : d;
  } catch {
    return null;
  }
}

export function formatDateTime(
  value: string | Date | number,
  opts?: { tz?: string; dateStyle?: 'short' | 'medium' | 'long' | 'full'; timeStyle?: 'short' | 'medium' | 'long' }
): string {
  const d = toDate(value);
  if (!d) return '';
  const timeZone = opts?.tz || getUserTimeZone();
  const dateStyle = opts?.dateStyle ?? 'medium';
  const timeStyle = opts?.timeStyle ?? 'short';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle, timeStyle, timeZone }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function formatTime(
  value: string | Date | number,
  opts?: { tz?: string; timeStyle?: 'short' | 'medium' | 'long' }
): string {
  const d = toDate(value);
  if (!d) return '';
  const timeZone = opts?.tz || getUserTimeZone();
  const timeStyle = opts?.timeStyle ?? 'short';
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle, timeZone }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

export function formatDate(
  value: string | Date | number,
  opts?: { tz?: string; dateStyle?: 'short' | 'medium' | 'long' | 'full' }
): string {
  const d = toDate(value);
  if (!d) return '';
  const timeZone = opts?.tz || getUserTimeZone();
  const dateStyle = opts?.dateStyle ?? 'medium';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle, timeZone }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

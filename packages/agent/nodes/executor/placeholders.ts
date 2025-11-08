import { previewForLog } from './utils.js';

export function getByPath(obj: any, path: string) {
  if (!path || typeof path !== 'string') return undefined;
  // Support bracket notation: slots[0].start → slots.0.start
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  return normalized
    .split('.')
    .filter((p) => p.length > 0)
    .reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), obj);
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolvePlaceholders(
  args: any,
  stepResults: Map<string, any>,
  vars?: Record<string, any> | null,
  each?: { item?: any; index?: number; key?: any } | null,
  opts?: { tz?: string },
): { resolved: any; needsExpansion: boolean; expansionKey?: string } {
  if (typeof args !== 'object' || args === null) return { resolved: args, needsExpansion: false };

  if (Array.isArray(args)) {
    return {
      resolved: args.map((item) => resolvePlaceholders(item, stepResults, vars, each, opts).resolved),
      needsExpansion: false,
    };
  }

  const resolved: any = {};
  let needsExpansion = false;
  let expansionKey: string | undefined;

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      let str = value;
      // Pure $var.*
      const mVarOnly = str.match(/^\$var\.(.+)$/);
      if (mVarOnly && vars) {
        const v = getByPath(vars, mVarOnly[1]);
        try { console.log(`[executor] resolvePlaceholders: resolved var for field "${key}" from expr="${value}" → ${previewForLog(v)}`); } catch {}
        resolved[key] = v;
        continue;
      }

      // $each.* direct
      const mEach = str.match(/^\$each\.(.+)$/);
      if (mEach && each && 'item' in (each as any)) {
        const pathStr = mEach[1];
        let v = getByPath((each as any).item, pathStr);
        if (v === undefined && pathStr.endsWith('.address')) {
          const basePath = pathStr.slice(0, -('.address'.length));
          const base = getByPath((each as any).item, basePath);
          if (typeof base === 'string') v = base;
        }
        resolved[key] = v;
        continue;
      }

      // $each inside strings → leave for expansion
      if (/\$each\./.test(str)) {
        resolved[key] = str;
        continue;
      }

      // Formatting helpers: $fmt.datetime(expr, tz?) and $fmt.range(startExpr, endExpr, tz?)
      const fmt = (dt: any, tz?: string, withTzName = true) => {
        try {
          const d = typeof dt === 'string' || typeof dt === 'number' ? new Date(dt) : dt;
          if (!d || isNaN(d.valueOf())) return String(dt);
          const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', timeZone: tz };
          if (withTzName) options.timeZoneName = 'short';
          return new Intl.DateTimeFormat(undefined, options).format(d);
        } catch { return String(dt); }
      };
      const evalExpr = (expr: string): any => {
        expr = expr.trim();
        if (expr.startsWith('$var.') && vars) return getByPath(vars, expr.slice(5));
        if (expr.startsWith('$each.') && each && 'item' in (each as any)) return getByPath((each as any).item, expr.slice(6));
        if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith('\'') && expr.endsWith('\''))) return expr.slice(1, -1);
        return expr;
      };
      const tz = opts?.tz;
      str = str.replace(/\$fmt\.(datetime|range)\(([^)]*)\)/g, (_m, kind: string, inner: string) => {
        const parts = inner.split(',').map((s) => s.trim()).filter(Boolean);
        if (kind === 'datetime') {
          const val = parts[0] ? evalExpr(parts[0]) : undefined;
          const tzArg = parts[1] ? String(evalExpr(parts[1])) : tz;
          return fmt(val, tzArg || tz, true);
        }
        if (kind === 'range') {
          const a = parts[0] ? evalExpr(parts[0]) : undefined;
          const b = parts[1] ? evalExpr(parts[1]) : undefined;
          const tzArg = parts[2] ? String(evalExpr(parts[2])) : tz;
          const left = fmt(a, tzArg || tz, true);
          const right = fmt(b, tzArg || tz, true);
          return `${left} → ${right}`;
        }
        return _m;
      });

      // $fmt.listRange(arrayExpr, 'startKey', 'endKey', tz?) → numbered bullet list
      str = str.replace(/\$fmt\.listRange\(([^)]*)\)/g, (_m, inner: string) => {
        try {
          const parts = inner.split(',').map((s) => s.trim()).filter(Boolean);
          if (parts.length < 3) return _m;
          const arrVal = parts[0] ? evalExpr(parts[0]) : undefined;
          const startKeyRaw = parts[1];
          const endKeyRaw = parts[2];
          const tzArg = parts[3] ? String(evalExpr(parts[3])) : tz;
          const unquote = (s: string) => (s?.startsWith('"') && s?.endsWith('"')) || (s?.startsWith('\'') && s?.endsWith('\'')) ? s.slice(1, -1) : s;
          const startKey = unquote(startKeyRaw);
          const endKey = unquote(endKeyRaw);
          const arr: any[] = Array.isArray(arrVal) ? arrVal : [];
          if (!arr.length) return '';
          const lines: string[] = [];
          arr.forEach((item, idx) => {
            const a = item?.[startKey];
            const b = item?.[endKey];
            // Format: "Nov 11, 2025, 9:00 AM → 9:30 AM"
            // Show date + start time, then just end time (same day assumed)
            const startDate = typeof a === 'string' || typeof a === 'number' ? new Date(a) : a;
            const endDate = typeof b === 'string' || typeof b === 'number' ? new Date(b) : b;
            if (!startDate || isNaN(startDate.valueOf()) || !endDate || isNaN(endDate.valueOf())) {
              const left = fmt(a, tzArg || tz, false);
              const right = fmt(b, tzArg || tz, false);
              lines.push(`${idx + 1}. ${left} → ${right}`);
              return;
            }
            const dateOpts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeZone: tzArg || tz };
            const timeOpts: Intl.DateTimeFormatOptions = { timeStyle: 'short', timeZone: tzArg || tz };
            const datePart = new Intl.DateTimeFormat(undefined, dateOpts).format(startDate);
            const startTime = new Intl.DateTimeFormat(undefined, timeOpts).format(startDate);
            const endTime = new Intl.DateTimeFormat(undefined, timeOpts).format(endDate);
            lines.push(`${idx + 1}. ${datePart}, ${startTime} → ${endTime}`);
          });
          return lines.join('\n');
        } catch {
          return _m;
        }
      });

      // Embedded $var.* within a string → interpolate (run AFTER $fmt so helpers can read vars)
      if (str.includes('$var.')) {
        str = str.replace(/\$var\.([A-Za-z0-9_.$\[\]]+)/g, (_m: string, sub: string) => {
          const v = vars ? getByPath(vars, sub) : undefined;
          if (v === undefined || v === null) return '';
          if (typeof v === 'string') return v;
          if (typeof v === 'number' || typeof v === 'boolean') return String(v);
          try { return JSON.stringify(v); } catch { return String(v); }
        });
      }

      resolved[key] = str;
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      const nested = resolvePlaceholders(value, stepResults, vars, each, opts);
      resolved[key] = nested.resolved;
      if (nested.needsExpansion) {
        needsExpansion = true;
        expansionKey = nested.expansionKey;
      }
    } else {
      resolved[key] = value;
    }
  }

  // Legacy array expansion detection removed → always return needsExpansion: false
  return { resolved, needsExpansion: false, expansionKey: undefined };
}

// Legacy implicit fan-out helpers removed to keep logic lean (use expandOn + $each)

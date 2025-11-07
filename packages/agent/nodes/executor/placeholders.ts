import { previewForLog } from './utils.js';

export function getByPath(obj: any, path: string) {
  return path.split('.').reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), obj);
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolvePlaceholders(
  args: any,
  stepResults: Map<string, any>,
  vars?: Record<string, any> | null,
  each?: { item?: any; index?: number; key?: any } | null,
): { resolved: any; needsExpansion: boolean; expansionKey?: string } {
  if (typeof args !== 'object' || args === null) return { resolved: args, needsExpansion: false };

  if (Array.isArray(args)) {
    return {
      resolved: args.map((item) => resolvePlaceholders(item, stepResults, vars, each).resolved),
      needsExpansion: false,
    };
  }

  const resolved: any = {};
  let needsExpansion = false;
  let expansionKey: string | undefined;

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // $var.*
      const mVar = value.match(/^\$var\.(.+)$/);
      if (mVar && vars) {
        const v = getByPath(vars, mVar[1]);
        try {
          console.log(
            `[executor] resolvePlaceholders: resolved var for field "${key}" from expr="${value}" → ${previewForLog(v)}`,
          );
        } catch {}
        resolved[key] = v;
        continue;
      }

      // $each.* direct
      const mEach = value.match(/^\$each\.(.+)$/);
      if (mEach && each && 'item' in (each as any)) {
        const pathStr = mEach[1];
        let v = getByPath((each as any).item, pathStr);
        // Tolerate "*.address" when the base is already a string (e.g., from is a string)
        if (v === undefined && pathStr.endsWith('.address')) {
          const basePath = pathStr.slice(0, -('.address'.length));
          const base = getByPath((each as any).item, basePath);
          if (typeof base === 'string') v = base;
        }
        resolved[key] = v;
        continue;
      }

      // $each inside strings → leave for expansion
      if (/\$each\./.test(value)) {
        resolved[key] = value;
        continue;
      }

      // Note: $step-XX.* resolution removed. Use binds + $var.* instead.
    }

    if (typeof value === 'object' && value !== null) {
      const nested = resolvePlaceholders(value, stepResults, vars, each);
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

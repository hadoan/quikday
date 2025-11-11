import type { PlanStep } from '../../state/types.js';

/** Sanitize a string into a variable-safe identifier */
function sanitizeVar(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

/** Deep clone JSON-like values */
function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Recursively replace strings using a replacer */
function walkReplace(obj: any, replacer: (s: string) => string): any {
  if (typeof obj === 'string') return replacer(obj);
  if (Array.isArray(obj)) return obj.map((v) => walkReplace(v, replacer));
  if (obj && typeof obj === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(obj)) o[k] = walkReplace(v as any, replacer);
    return o;
  }
  return obj;
}

/**
 * Normalize a set of plan steps to the explicit Map-style pattern:
 * - Convert legacy array placeholders $step-XX.array[*].path → expandOn + $each.path
 * - Convert simple $step-XX.path → binds + $var.pathVar
 * - Ensure producer steps bind the required result slices into scratch.vars
 */
export function normalizePlanToExplicitExpansion(steps: PlanStep[]): PlanStep[] {
  const out: PlanStep[] = steps.map((s) => ({ ...s, args: deepClone(s.args || {}) }));
  const byId = new Map(out.map((s) => [s.id, s]));

  // Regexes
  const reArrayAny = /\$step-(\d+)\.([^[]+)\[\*\](?:\.(.+))?/g;
  const reArrayDetect = /\$step-(\d+)\.([^[]+)\[\*\]/;
  const reSimpleAny = /\$step-(\d+)\.([^\s'"}]+)\b/g;

  for (const step of out) {
    // 1) Handle array placeholders → expandOn + $each
    let foundArray: null | { baseId: string; arrayField: string } = null;
    const detectArrayIn = (v: any) => {
      if (foundArray) return;
      if (typeof v === 'string') {
        const m = v.match(reArrayDetect);
        if (m) foundArray = { baseId: `step-${m[1]}`, arrayField: m[2] };
        return;
      }
      if (Array.isArray(v)) {
        for (const it of v) detectArrayIn(it);
        return;
      }
      if (v && typeof v === 'object') {
        for (const val of Object.values(v)) detectArrayIn(val);
      }
    };
    detectArrayIn(step.args);
    if (foundArray) {
      const { baseId, arrayField } = foundArray;
      const src = byId.get(baseId);
      if (src) {
        const varName = sanitizeVar(arrayField);
        const binds = { ...(src as any).binds } as Record<string, string>;
        if (!binds[varName]) binds[varName] = `$.${arrayField}`;
        (src as any).binds = binds;
        if (!(step as any).expandOn) (step as any).expandOn = `$var.${varName}`;
      }
      // Replace occurrences with $each
      step.args = walkReplace(step.args, (s) =>
        s.replace(reArrayAny, (_m, _num, _arr, sub) => (sub ? `$each.${sub}` : `$each`)),
      );
    }

    // 2) Handle simple placeholders → binds + $var
    // Collect all simple refs present in this step
    const simpleRefs = new Map<string, { baseId: string; path: string }>();
    const detectSimpleIn = (v: any) => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(reSimpleAny)) {
          const baseId = `step-${m[1]}`;
          const path = m[2];
          // Skip array forms already handled
          if (/\[\*\]/.test(path)) continue;
          simpleRefs.set(`${baseId}:${path}`, { baseId, path });
        }
        return;
      }
      if (Array.isArray(v)) {
        for (const it of v) detectSimpleIn(it);
        return;
      }
      if (v && typeof v === 'object') {
        for (const val of Object.values(v)) detectSimpleIn(val);
      }
    };
    detectSimpleIn(step.args);

    if (simpleRefs.size > 0) {
      // For each unique ref, bind it on the producer and replace with $var
      for (const { baseId, path } of simpleRefs.values()) {
        const src = byId.get(baseId);
        if (!src) continue;
        const last = path.split('.').pop() || 'value';
        let varName = sanitizeVar(last);
        // Avoid accidental collisions
        const existing = (src as any).binds || {};
        if (existing[varName] && existing[varName] !== `$.${path}`) {
          varName = `${varName}_${Math.abs((path || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 1000)}`;
        }
        const binds = { ...(src as any).binds } as Record<string, string>;
        if (!binds[varName]) binds[varName] = `$.${path}`;
        (src as any).binds = binds;

        // Replace in consumer args
        const needle = new RegExp(
          `\\$step-${baseId.slice(5)}\\.${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\b`,
          'g',
        );
        step.args = walkReplace(step.args, (s) => s.replace(needle, `$var.${varName}`));
      }
    }
  }

  return out;
}

import { getByPath, resolvePlaceholders } from './placeholders.js';

export function expandStepForArray(step: any, stepResults: Map<string, any>, s: any): any[] {
  const vars = (s?.scratch?.vars ?? null) as Record<string, any> | null;

  // Attempt explicit expansion first (expandOn)
  let explicitArray: any[] | null = null;
  let expStepId: string | null = null;
  let expArrayField: string | null = null;

  const tryResolveSelector = (sel?: string) => {
    if (!sel) return undefined;
    if (sel.startsWith('$var.')) return getByPath(vars ?? {}, sel.slice(5));
    if (sel.startsWith('$step-')) {
      const err: any = new Error('Step placeholders are not supported. Use binds + $var.*');
      err.code = 'E_PLACEHOLDER_UNSUPPORTED';
      throw err;
    }
    return undefined;
  };

  if (typeof step.expandOn === 'string' && step.expandOn.trim().length > 0) {
    const v = tryResolveSelector(step.expandOn);
    if (Array.isArray(v)) {
      try {
        if (step.expandOn.startsWith('$var.')) {
          console.log(
            `[executor] expandOn: resolved from var expr="${step.expandOn}" → items=${v.length}`,
          );
        }
      } catch {}
      explicitArray = v;
      const m = step.expandOn.match(/^\$step-(\d+)\.(.+)$/);
      if (m) {
        expStepId = `step-${m[1]}`;
        expArrayField = m[2];
      } else if (step.expandOn.startsWith('$var.')) {
        expStepId = '';
        expArrayField = step.expandOn.slice(5);
      }
    }
  }

  // Resolve $var/$step in args first (no array detection)
  const { resolved: baseArgs } = resolvePlaceholders(step.args, stepResults, vars, null, {
    tz: s?.ctx?.tz,
  });

  // If no explicit expandOn, return single step
  if (!explicitArray) {
    return [{ ...step, args: baseArgs }];
  }

  // Extract the array to iterate over (explicit only)
  let array: any[] = explicitArray ?? [];

  if (!Array.isArray(array) || array.length === 0) {
    console.warn(`[executor] Expected array from expandOn="${step.expandOn}" but got:`, array);
    return [];
  }

  // Create one step per array item
  const expandedSteps = array.map((item, idx) => {
    const expandedArgs: any = {};

    // Optional stable key
    let mapKey: any = undefined;
    if (typeof step.expandKey === 'string' && step.expandKey.trim().length > 0) {
      if (step.expandKey === '$each') mapKey = item;
      else if (step.expandKey.startsWith('$each.'))
        mapKey = getByPath(item, step.expandKey.slice(6));
    }

    // First pass: shallow copy baseArgs
    const deepCopy = (v: any): any => JSON.parse(JSON.stringify(v));
    const argsCopy = deepCopy(baseArgs);

    // Replace embedded $each.* and $index/$key inside strings recursively
    const replaceEmbedded = (v: any): any => {
      if (typeof v === 'string') {
        let out = v.replace(/\$each\.([A-Za-z0-9_\.]+)/g, (_m: string, sub: string) => {
          const rv = getByPath(item, sub);
          if (rv === undefined || rv === null) return '';
          if (typeof rv === 'string') return rv;
          if (typeof rv === 'number' || typeof rv === 'boolean') return String(rv);
          try {
            return JSON.stringify(rv);
          } catch {
            return String(rv);
          }
        });
        out = out.replace(/\$index\b/g, String(idx));
        if (mapKey !== undefined) out = out.replace(/\$key\b/g, String(mapKey));
        return out;
      }
      if (Array.isArray(v)) return v.map(replaceEmbedded);
      if (v && typeof v === 'object') {
        const o: any = {};
        for (const [kk, vv] of Object.entries(v)) o[kk] = replaceEmbedded(vv);
        return o;
      }
      return v;
    };

    const withEmbedded = replaceEmbedded(argsCopy);
    // Resolve direct $each.* placeholders now
    const { resolved: finalArgs } = resolvePlaceholders(
      withEmbedded,
      stepResults,
      vars,
      { item, index: idx, key: mapKey },
      { tz: s?.ctx?.tz },
    );
    Object.assign(expandedArgs, finalArgs);

    // Return a concrete child step with expansion resolved.
    // Important: remove expandOn/expandKey so children are not re-expanded.
    return {
      ...step,
      id: `${step.id}-${idx}`,
      args: expandedArgs,
      expandOn: undefined,
      expandKey: undefined,
    } as any;
  });

  return expandedSteps;
}

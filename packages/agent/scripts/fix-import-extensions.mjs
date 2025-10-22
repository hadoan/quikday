#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve(process.cwd(), 'dist');

const shouldAppend = (spec) => {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return false;
  // ignore if already has extension or URL-style query/hash
  if (/\.(mjs|cjs|js|json)$/i.test(spec)) return false;
  if (spec.includes('?') || spec.includes('#')) return false;
  return true;
};

const fixSpec = (spec) => (shouldAppend(spec) ? `${spec}.js` : spec);

const IMPORT_RE = /(import\s+[^'";]+?from\s+)(["'])([^"']+)(\2)/g;
const EXPORT_RE = /(export\s+\*\s+from\s+)(["'])([^"']+)(\2)/g;

async function processFile(file) {
  const src = await fs.readFile(file, 'utf8');
  let changed = false;
  const replace = (re) => (match, p1, q, spec, p4) => {
    const next = fixSpec(spec);
    if (next !== spec) changed = true;
    return `${p1}${q}${next}${p4}`;
  };
  let out = src.replace(IMPORT_RE, replace(IMPORT_RE));
  out = out.replace(EXPORT_RE, replace(EXPORT_RE));
  if (changed) await fs.writeFile(file, out, 'utf8');
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (ent) => {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) return walk(p);
      if (ent.isFile() && p.endsWith('.js')) return processFile(p);
    }),
  );
}

try {
  await walk(DIST_DIR);
  console.log('[fix-import-extensions] processed dist');
} catch (err) {
  console.error('[fix-import-extensions] failed:', err);
  process.exitCode = 1;
}


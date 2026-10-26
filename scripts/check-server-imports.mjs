// Vercel runs api/ as plain Node ES modules, so every relative import the server reaches
// must end with ".js" (the app's build tool doesn't need it, so mistakes only show on Vercel).
// Run by `npm run build`: the deploy stops here instead of shipping a broken backend.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function apiFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? apiFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}

function runtimeImports(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  const re = /^\s*(import|export)\s+(?!type\b)([^'";]*?\bfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;
  for (let m; (m = re.exec(src)); ) {
    const what = (m[2] ?? '').trim();
    if (/^\{\s*(type\s+\w+\s*,?\s*)+\}\s*from$/.test(what)) continue; // only types
    out.push(m[3]);
  }
  return out;
}

export function checkServerImports() {
  const bad = [];
  const seen = new Set();
  const todo = apiFiles(join(root, 'api'));
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of runtimeImports(f)) {
      if (!spec.endsWith('.js')) {
        bad.push(`${relative(root, f)} → '${spec}' (add .js)`);
        continue;
      }
      const ts = resolve(dirname(f), spec.replace(/\.js$/, '.ts'));
      if (!existsSync(ts)) bad.push(`${relative(root, f)} → '${spec}' (no such file)`);
      else todo.push(ts);
    }
  }
  return { bad, files: seen.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { bad, files } = checkServerImports();
  if (bad.length) {
    console.error('Server imports that will break on Vercel:\n  ' + bad.join('\n  '));
    process.exit(1);
  }
  console.log(`Server imports OK (${files} files)`);
}

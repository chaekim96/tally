/**
 * Verifies the serverless functions the way Vercel actually runs them.
 *
 * Vite's dev server and `tsc --noEmit` both accept extensionless relative
 * imports; Node's ESM loader in a deployed function does not, and fails at
 * runtime with ERR_MODULE_NOT_FOUND. This compiles api/ + lib/ to real
 * Node ESM and invokes every handler, so that gap shows up locally.
 *
 * Run: npm run verify:api   (no API key needed — handlers should report no_key)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = '.verifybuild';

rmSync(OUT, { recursive: true, force: true });
execFileSync(
  'npx',
  ['tsc', 'api/health.ts', 'api/estimate.ts', 'api/breakdown.ts', 'lib/ai.ts', 'lib/types.ts',
   '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022',
   '--skipLibCheck', '--outDir', OUT],
  { stdio: 'inherit' },
);
writeFileSync(`${OUT}/package.json`, '{"type":"module"}');

const cases = [
  { name: 'GET  /api/health', file: 'api/health.js', method: 'GET' },
  {
    name: 'POST /api/estimate', file: 'api/estimate.js', method: 'POST',
    body: { title: 'Check', lines: [{ id: 'a', text: 'Email Sarah', indent: 0 }], targetIds: ['a'] },
  },
  {
    name: 'POST /api/breakdown', file: 'api/breakdown.js', method: 'POST',
    body: { title: 'Check', text: 'Ship the app', siblings: [] },
  },
];

let failed = 0;
for (const c of cases) {
  try {
    const mod = await import(pathToFileURL(`${process.cwd()}/${OUT}/${c.file}`).href);
    const handler = mod[c.method];
    if (typeof handler !== 'function') throw new Error(`no ${c.method} export`);
    const res = c.body
      ? await handler(new Request(`http://local/${c.file}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(c.body),
        }))
      : await handler();
    const text = await res.text();
    // Without a key, 200 (health) or 503 no_key (the rest) are both healthy.
    const ok = res.status === 200 || res.status === 503;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name} → ${res.status} ${text.slice(0, 90)}`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`FAIL ${c.name} → ${err.message}`);
    failed++;
  }
}

rmSync(OUT, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} handler(s) failed to load or run under Node ESM.`);
  process.exit(1);
}
console.log('\nAll handlers load and run under Node ESM.');

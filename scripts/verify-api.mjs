/**
 * Verifies the serverless functions the way Vercel actually runs them.
 *
 * Vite's dev server and `tsc --noEmit` both accept extensionless relative
 * imports; Node's ESM loader in a deployed function does not. This compiles
 * api/ + lib/ to real Node ESM, then checks:
 *   - every handler loads and responds,
 *   - who pays: your own key beats the server key; the server key needs the
 *     access code and stays locked when no code is configured,
 *   - request caps reject oversized input before any model call.
 *
 * Run: npm run verify:api   (no real API key needed; nothing calls Claude)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const OUT = '.verifybuild';
const load = (file) => import(pathToFileURL(`${process.cwd()}/${OUT}/${file}`).href);

rmSync(OUT, { recursive: true, force: true });
execFileSync(
  'npx',
  ['tsc', 'api/health.ts', 'api/estimate.ts', 'api/breakdown.ts', 'lib/ai.ts', 'lib/types.ts',
   '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022',
   '--skipLibCheck', '--outDir', OUT],
  { stdio: 'inherit' },
);
writeFileSync(`${OUT}/package.json`, '{"type":"module"}');

// Run each check with an exact environment, whatever the shell has set.
const ENV_KEYS = ['ANTHROPIC_API_KEY', 'TALLY_ACCESS_CODE'];
async function withEnv(env, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try { return await fn(); }
  finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const req = (headers = {}, body) =>
  new Request('http://local/api', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

let failed = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` → ${detail}` : ''}`);
  if (!pass) failed++;
}

try {
  const ai = await load('lib/ai.js');
  const health = await load('api/health.js');
  const estimate = await load('api/estimate.js');
  const breakdown = await load('api/breakdown.js');
  const SERVER = { ANTHROPIC_API_KEY: 'server-key', TALLY_ACCESS_CODE: 'open-sesame' };
  const who = (r) => (r ? `${r.source}:${r.apiKey}` : 'none');

  console.log('\n— Who pays');
  await withEnv(SERVER, () => {
    const r = ai.resolveKey(req({ 'x-tally-key': 'my-key', 'x-tally-access': 'open-sesame' }));
    check('own key beats server key, even with a valid code', r?.source === 'browser' && r.apiKey === 'my-key', who(r));
  });
  await withEnv(SERVER, () => {
    const r = ai.resolveKey(req({ 'x-tally-access': 'open-sesame' }));
    check('right access code unlocks server key', r?.source === 'server', who(r));
  });
  await withEnv(SERVER, () => {
    const r = ai.resolveKey(req({ 'x-tally-access': 'wrong' }));
    check('wrong access code → no key', r === null, who(r));
  });
  await withEnv(SERVER, () => {
    const r = ai.resolveKey(req());
    check('no credentials → no key', r === null, who(r));
  });
  await withEnv({ ANTHROPIC_API_KEY: 'server-key' }, () => {
    const r = ai.resolveKey(req({ 'x-tally-access': 'anything' }));
    check('no TALLY_ACCESS_CODE set → server key locked (fails closed)', r === null, who(r));
  });
  await withEnv({ ANTHROPIC_API_KEY: 'server-key', TALLY_ACCESS_CODE: 'open-sesame' }, () => {
    const r = ai.resolveKey(req({ 'x-tally-access': '' }));
    check('empty access code → no key', r === null, who(r));
  });

  console.log('\n— Handlers');
  const status = async (res) => `${res.status} ${(await res.text()).slice(0, 80)}`;
  await withEnv({}, async () => {
    const res = await health.GET(req());
    const body = await res.clone().json();
    check('GET /api/health, no keys', res.status === 200 && body.serverKeyUsable === false, await status(res));
  });
  await withEnv(SERVER, async () => {
    const res = await health.GET(req({ 'x-tally-access': 'open-sesame' }));
    const body = await res.clone().json();
    check('GET /api/health, right code → usable', body.serverKeyUsable === true, await status(res));
  });
  await withEnv(SERVER, async () => {
    const res = await health.GET(req({ 'x-tally-access': 'wrong' }));
    const body = await res.clone().json();
    check('GET /api/health, wrong code → not usable', body.serverKeyUsable === false, await status(res));
  });
  const oneLine = { title: 'Check', lines: [{ id: 'a', text: 'Email Sarah', indent: 0 }], targetIds: ['a'] };
  await withEnv(SERVER, async () => {
    const res = await estimate.POST(req({}, oneLine));
    check('POST /api/estimate with server key but no code → 503 no_key', res.status === 503, await status(res));
  });
  await withEnv(SERVER, async () => {
    const res = await breakdown.POST(req({}, { title: 'Check', text: 'Ship it', siblings: [] }));
    check('POST /api/breakdown with server key but no code → 503 no_key', res.status === 503, await status(res));
  });

  console.log('\n— Request caps (rejected before any model call)');
  await withEnv(SERVER, async () => {
    const lines = Array.from({ length: 51 }, (_, i) => ({ id: `l${i}`, text: 'x', indent: 0 }));
    const res = await estimate.POST(req({ 'x-tally-access': 'open-sesame' }, { title: 't', lines, targetIds: lines.map((l) => l.id) }));
    check('51 targets → 400', res.status === 400, await status(res));
  });
  await withEnv(SERVER, async () => {
    const lines = Array.from({ length: 501 }, (_, i) => ({ id: `l${i}`, text: 'x', indent: 0 }));
    const res = await estimate.POST(req({ 'x-tally-access': 'open-sesame' }, { title: 't', lines, targetIds: ['l0'] }));
    check('501 lines → 400', res.status === 400, await status(res));
  });
  await withEnv(SERVER, async () => {
    const big = { title: 't', lines: [{ id: 'a', text: 'x'.repeat(70_000), indent: 0 }], targetIds: ['a'] };
    const res = await estimate.POST(req({ 'x-tally-access': 'open-sesame' }, big));
    check('70KB body → 413', res.status === 413, await status(res));
  });
  await withEnv(SERVER, async () => {
    const res = await estimate.POST(req({ 'x-tally-access': 'open-sesame' }, '{not json'));
    check('malformed JSON → 400', res.status === 400, await status(res));
  });
} catch (err) {
  check('handlers load under Node ESM', false, err.message);
}

rmSync(OUT, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');

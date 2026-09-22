import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = fileURLToPath(new URL('./api', import.meta.url));

/**
 * Serves `api/<name>.ts` locally with the same Web-standard signature Vercel
 * uses in production (`export async function POST(request: Request)`), so
 * `npm run dev` exercises the real functions without the Vercel CLI.
 */
function localApi(): Plugin {
  return {
    name: 'tally-local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const name = req.url.slice(5).split('?')[0];
        const file = path.join(apiDir, `${name}.ts`);
        if (!fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        try {
          const mod = await server.ssrLoadModule(file);
          const handler = mod[req.method ?? 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join(', '));
          }
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'dev_server', message: String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make .env.local keys visible to the API functions during `vite dev`.
  const env = loadEnv(mode, process.cwd(), '');
  for (const name of ['ANTHROPIC_API_KEY', 'TALLY_ACCESS_CODE']) {
    if (env[name] && !process.env[name]) process.env[name] = env[name];
  }
  return {
    plugins: [react(), tailwindcss(), localApi()],
    server: { port: 5173 },
  };
});

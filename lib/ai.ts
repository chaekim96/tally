// Server-only helpers shared by api/*.ts. Never imported by the browser bundle.
import Anthropic from '@anthropic-ai/sdk';
import type { ApiError } from './types';

export const MODEL = 'claude-opus-5';

/** Header the browser may use to supply its own key (Settings → API key). */
export const BROWSER_KEY_HEADER = 'x-tally-key';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function fail(error: ApiError['error'], message: string, status: number): Response {
  return json({ error, message } satisfies ApiError, status);
}

/** Server env key wins; otherwise a browser-supplied key; otherwise null. */
export function resolveClient(request: Request): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY || request.headers.get(BROWSER_KEY_HEADER) || '';
  if (!key.trim()) return null;
  return new Anthropic({ apiKey: key.trim(), maxRetries: 1, timeout: 45_000 });
}

export function hasServerKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Map SDK errors to a stable, client-friendly shape. */
export function handleApiError(err: unknown): Response {
  if (err instanceof Anthropic.AuthenticationError) return fail('bad_key', 'The API key was rejected.', 401);
  if (err instanceof Anthropic.PermissionDeniedError) return fail('bad_key', 'The API key lacks permission.', 403);
  if (err instanceof Anthropic.RateLimitError) return fail('rate_limited', 'Rate limited — try again shortly.', 429);
  if (err instanceof Anthropic.BadRequestError) return fail('bad_request', err.message, 400);
  if (err instanceof Anthropic.APIError) return fail('upstream', `Claude API error ${err.status ?? ''}: ${err.message}`, 502);
  return fail('server', err instanceof Error ? err.message : 'Unknown error', 500);
}

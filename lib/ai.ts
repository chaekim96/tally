// Server-only helpers shared by api/*.ts. Never imported by the browser bundle.
import Anthropic from '@anthropic-ai/sdk';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ApiError, HealthResponse } from './types.js';

export const MODEL = 'claude-opus-5';

/** Header carrying the caller's own Anthropic key (Settings → Your API key). */
export const BROWSER_KEY_HEADER = 'x-tally-key';
/** Header carrying the access code that unlocks the server's key. */
export const ACCESS_CODE_HEADER = 'x-tally-access';

/** Largest request body accepted, so one request can't carry an enormous prompt. */
export const MAX_BODY_BYTES = 64_000;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function fail(error: ApiError['error'], message: string, status: number): Response {
  return json({ error, message } satisfies ApiError, status);
}

function sameSecret(a: string, b: string): boolean {
  // Hash first: timingSafeEqual throws on unequal lengths, which would leak length.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/** True when the request carries the right access code. Fails closed if no code is configured. */
export function hasAccess(request: Request): boolean {
  const expected = process.env.TALLY_ACCESS_CODE?.trim();
  const given = request.headers.get(ACCESS_CODE_HEADER)?.trim();
  if (!expected || !given) return false;
  return sameSecret(given, expected);
}

export type KeySource = 'browser' | 'server';

/**
 * Which key pays for this request:
 *  1. the caller's own key — always wins, and never falls back to the server key;
 *  2. the server key — only with a valid access code;
 *  3. otherwise none (the client falls back to offline estimates).
 */
export function resolveKey(request: Request): { apiKey: string; source: KeySource } | null {
  const own = request.headers.get(BROWSER_KEY_HEADER)?.trim();
  if (own) return { apiKey: own, source: 'browser' };
  const server = process.env.ANTHROPIC_API_KEY?.trim();
  if (server && hasAccess(request)) return { apiKey: server, source: 'server' };
  return null;
}

export function resolveClient(request: Request): Anthropic | null {
  const key = resolveKey(request);
  return key ? new Anthropic({ apiKey: key.apiKey, maxRetries: 1, timeout: 45_000 }) : null;
}

export function serverStatus(request: Request): Omit<HealthResponse, 'ok' | 'model'> {
  const serverKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  return {
    serverKey,
    accessConfigured: Boolean(process.env.TALLY_ACCESS_CODE?.trim()),
    serverKeyUsable: serverKey && hasAccess(request),
  };
}

/** Reads a JSON body with a size cap. On failure, `error` is a ready-to-return Response. */
export async function readJson<T>(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: Response }> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { error: fail('bad_request', `Request too large (max ${Math.round(maxBytes / 1000)}KB).`, 413) };
  }
  try {
    return { data: JSON.parse(text) as T };
  } catch {
    return { error: fail('bad_request', 'Invalid JSON body.', 400) };
  }
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

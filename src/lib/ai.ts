import type {
  ApiError,
  BreakdownRequest,
  BreakdownResponse,
  EstimateRequest,
  EstimateResponse,
} from '../../lib/types';

export type AiStatus =
  | { mode: 'checking' }
  | { mode: 'server' }          // Vercel env var is set
  | { mode: 'browser' }         // user-supplied key in Settings
  | { mode: 'offline'; reason: string }; // heuristics only

export class AiRequestError extends Error {
  constructor(public code: ApiError['error'], message: string, public status: number) {
    super(message);
  }
}

function headers(apiKey?: string): HeadersInit {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) h['x-tally-key'] = apiKey;
  return h;
}

async function post<TReq, TRes>(path: string, body: TReq, apiKey?: string): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) });
  } catch (e) {
    throw new AiRequestError('server', e instanceof Error ? e.message : 'Network error', 0);
  }
  if (!res.ok) {
    let err: ApiError = { error: 'server', message: `HTTP ${res.status}` };
    try { err = (await res.json()) as ApiError; } catch { /* keep default */ }
    throw new AiRequestError(err.error, err.message, res.status);
  }
  return (await res.json()) as TRes;
}

export async function checkHealth(apiKey?: string): Promise<AiStatus> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return { mode: 'offline', reason: `API unavailable (${res.status})` };
    const data = (await res.json()) as { serverKey: boolean };
    if (data.serverKey) return { mode: 'server' };
    if (apiKey) return { mode: 'browser' };
    return { mode: 'offline', reason: 'No API key configured' };
  } catch {
    return { mode: 'offline', reason: 'API unreachable' };
  }
}

export function estimateLines(req: EstimateRequest, apiKey?: string) {
  return post<EstimateRequest, EstimateResponse>('/api/estimate', req, apiKey);
}

export function breakdownTask(req: BreakdownRequest, apiKey?: string) {
  return post<BreakdownRequest, BreakdownResponse>('/api/breakdown', req, apiKey);
}

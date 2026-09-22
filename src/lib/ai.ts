import type {
  ApiError,
  BreakdownRequest,
  BreakdownResponse,
  EstimateRequest,
  EstimateResponse,
  HealthResponse,
} from '../../lib/types';

export type AiStatus =
  | { mode: 'checking' }
  | { mode: 'browser' }          // your own key — billed to your Anthropic account
  | { mode: 'server' }           // the server's key, unlocked by the access code
  | { mode: 'offline'; reason: string }; // heuristics only

/** What the browser sends to prove which key it may use. */
export interface Credentials {
  apiKey?: string;
  accessCode?: string;
}

export class AiRequestError extends Error {
  constructor(public code: ApiError['error'], message: string, public status: number) {
    super(message);
  }
}

function headers(creds: Credentials = {}): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (creds.apiKey) h['x-tally-key'] = creds.apiKey;
  if (creds.accessCode) h['x-tally-access'] = creds.accessCode;
  return h;
}

async function post<TReq, TRes>(path: string, body: TReq, creds: Credentials): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: headers(creds), body: JSON.stringify(body) });
  } catch (e) {
    throw new AiRequestError('server', e instanceof Error ? e.message : 'Network error', 0);
  }
  if (!res.ok) {
    // The Vercel Firewall answers a rate-limited request with a bare 429, not our JSON error.
    let err: ApiError = res.status === 429
      ? { error: 'rate_limited', message: 'Too many requests. Try again in a minute.' }
      : { error: 'server', message: `HTTP ${res.status}` };
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (body?.error && body.message) err = body as ApiError;
    } catch { /* not JSON: keep the default */ }
    throw new AiRequestError(err.error, err.message, res.status);
  }
  return (await res.json()) as TRes;
}

export async function checkHealth(creds: Credentials): Promise<AiStatus> {
  // Your own key always wins server-side, so it decides the mode here too.
  if (creds.apiKey) return { mode: 'browser' };
  try {
    const res = await fetch('/api/health', { headers: headers({ accessCode: creds.accessCode }) });
    if (res.status === 429) return { mode: 'offline', reason: 'Too many requests. Try again in a minute' };
    if (!res.ok) return { mode: 'offline', reason: `API unavailable (${res.status})` };
    const h = (await res.json()) as HealthResponse;
    if (h.serverKeyUsable) return { mode: 'server' };
    if (!h.serverKey) return { mode: 'offline', reason: 'Add your own API key' };
    if (!h.accessConfigured) return { mode: 'offline', reason: 'Server key is locked (no access code set)' };
    return { mode: 'offline', reason: creds.accessCode ? 'Access code not recognised' : 'Enter the access code or your own key' };
  } catch {
    return { mode: 'offline', reason: 'API unreachable' };
  }
}

export function estimateLines(req: EstimateRequest, creds: Credentials) {
  return post<EstimateRequest, EstimateResponse>('/api/estimate', req, creds);
}

export function breakdownTask(req: BreakdownRequest, creds: Credentials) {
  return post<BreakdownRequest, BreakdownResponse>('/api/breakdown', req, creds);
}

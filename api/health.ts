import { json, MODEL, serverStatus } from '../lib/ai.js';
import type { HealthResponse } from '../lib/types.js';

/** GET /api/health → which keys this request could use. */
export async function GET(request: Request) {
  return json({ ok: true, model: MODEL, ...serverStatus(request) } satisfies HealthResponse);
}

import { hasServerKey, json, MODEL } from '../lib/ai';

/** GET /api/health → whether the server has a key configured. */
export async function GET() {
  return json({ ok: true, serverKey: hasServerKey(), model: MODEL });
}

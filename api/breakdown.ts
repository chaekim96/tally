import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { API_LIMITS, CATEGORIES, type BreakdownRequest, type BreakdownResponse } from '../lib/types.js';
import { fail, handleApiError, json, MODEL, readJson, resolveClient } from '../lib/ai.js';

const Output = z.object({
  steps: z.array(
    z.object({
      text: z.string(),
      minutes: z.number(),
      category: z.enum(CATEGORIES),
    }),
  ),
});

const SYSTEM = `You are the planner inside Tally, a personal note-taking app. Break ONE task into 3–7 concrete sub-tasks a person can start on immediately. Each step gets a realistic minutes estimate for a focused, competent person. Steps must be specific (start with a verb), sequential, and together cover the whole task. Keep each step under 12 words. Use the note title and sibling lines only for context — do not include them as steps.`;

/** POST /api/breakdown */
export async function POST(request: Request) {
  const parsed = await readJson<BreakdownRequest>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  if (typeof body?.text !== 'string' || !body.text.trim()) return fail('bad_request', 'Expected { text }.', 400);

  const client = resolveClient(request);
  if (!client) return fail('no_key', 'No usable API key: add your own key or the access code in Settings.', 503);

  body.text = body.text.slice(0, API_LIMITS.breakdownChars);
  body.title = String(body.title ?? '').slice(0, API_LIMITS.titleChars);
  body.siblings = (Array.isArray(body.siblings) ? body.siblings : [])
    .slice(0, API_LIMITS.siblings)
    .map((s) => String(s ?? '').slice(0, API_LIMITS.lineChars));

  const prompt = `Note title: ${body.title?.trim() || '(untitled)'}
Other lines in the note (context only):
${(body.siblings ?? []).filter(Boolean).map((s) => `- ${s}`).join('\n') || '- (none)'}

Task to break down: ${body.text.trim()}`;

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(Output) },
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return fail('upstream', 'The model did not return steps.', 502);
    }
    const steps = response.parsed_output.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ ...s, text: s.text.trim(), minutes: Math.max(5, Math.round(s.minutes)) }));
    return json({ steps, model: MODEL } satisfies BreakdownResponse);
  } catch (err) {
    return handleApiError(err);
  }
}

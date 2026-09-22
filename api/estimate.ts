import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { API_LIMITS, CATEGORIES, type EstimateRequest, type EstimateResponse } from '../lib/types.js';
import { fail, handleApiError, json, MODEL, readJson, resolveClient } from '../lib/ai.js';

const Output = z.object({
  estimates: z.array(
    z.object({
      id: z.string(),
      minutes: z.number(),
      low: z.number(),
      high: z.number(),
      category: z.enum(CATEGORIES),
      confidence: z.enum(['low', 'medium', 'high']),
      rationale: z.string(),
    }),
  ),
});

const SYSTEM = `You are the estimator inside Tally, a personal note-taking app. The user writes free-form lists; each line may be a task, a sub-task (indent 1), a heading, or a stray thought.

For each TARGET line, estimate the wall-clock minutes for one focused, competent person to complete it start to finish. Use the note title and neighbouring lines for context (e.g. "write intro" under "Marketing final paper" is academic writing). Sub-tasks are part of their parent; estimate the sub-task alone.

Rules:
- "minutes" is the most likely value. "low"/"high" bound an ~80% range. Round to sensible units (5, 10, 15, 30, 45, 60, 90, 120...).
- If the line already states a duration (e.g. "(2h)", "30 min"), honour it exactly with high confidence.
- If a line is not actionable (heading, question, idea, note-to-self), return minutes 0, low 0, high 0, category "Other", confidence "low".
- Categories: Work (job/consulting/career), Build (coding, product, side projects), Study (school, reading, courses), Errand (out-of-house chores), Health (fitness, medical), Personal (home, relationships, leisure), Admin (email, calls, paperwork, scheduling), Other.
- Be realistic, not optimistic: include setup, context switching, and finishing touches. Prefer round, believable numbers.
- rationale: at most 12 words.

Return exactly one estimate per target id, in the same order.`;

/** POST /api/estimate */
export async function POST(request: Request) {
  const parsed = await readJson<EstimateRequest>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  if (!Array.isArray(body?.lines) || !Array.isArray(body?.targetIds) || body.targetIds.length === 0) {
    return fail('bad_request', 'Expected { title, lines[], targetIds[] }.', 400);
  }
  if (body.lines.length > API_LIMITS.lines) {
    return fail('bad_request', `Note too long (max ${API_LIMITS.lines} lines).`, 400);
  }
  if (body.targetIds.length > API_LIMITS.targets) {
    return fail('bad_request', `Too many lines at once (max ${API_LIMITS.targets}).`, 400);
  }

  const client = resolveClient(request);
  if (!client) return fail('no_key', 'No usable API key: add your own key or the access code in Settings.', 503);

  // Only estimate ids that are actually in the note; clip text to keep prompts bounded.
  const lineIds = new Set(body.lines.map((l) => String(l.id)));
  body.targetIds = [...new Set(body.targetIds.map(String))].filter((id) => lineIds.has(id));
  if (body.targetIds.length === 0) return fail('bad_request', 'targetIds must reference lines.', 400);
  body.title = String(body.title ?? '').slice(0, API_LIMITS.titleChars);
  body.lines = body.lines.map((l) => ({
    id: String(l.id),
    text: String(l.text ?? '').slice(0, API_LIMITS.lineChars),
    indent: l.indent === 1 ? 1 : 0,
  }));

  const targets = new Set(body.targetIds);
  const rendered = body.lines
    .map((l) => `${l.id}${targets.has(l.id) ? ' [TARGET]' : ''} | ${'  '.repeat(l.indent ?? 0)}${l.text || '(empty)'}`)
    .join('\n');

  const prompt = `Note title: ${body.title?.trim() || '(untitled)'}

Lines (id | text). Estimate only the ones marked [TARGET]:
${rendered}`;

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(Output) },
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return fail('upstream', 'The model did not return estimates.', 502);
    }

    // Normalise: only requested ids, integers, sane ordering of the range.
    const byId = new Map(response.parsed_output.estimates.map((e) => [e.id, e]));
    const estimates = body.targetIds
      .filter((id) => byId.has(id))
      .map((id) => {
        const e = byId.get(id)!;
        const minutes = Math.max(0, Math.round(e.minutes));
        const low = Math.max(0, Math.min(Math.round(e.low), minutes));
        const high = Math.max(Math.round(e.high), minutes);
        return { ...e, minutes, low, high };
      });

    return json({ estimates, model: MODEL } satisfies EstimateResponse);
  } catch (err) {
    return handleApiError(err);
  }
}

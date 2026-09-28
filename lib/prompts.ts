// Prompt construction for api/*.ts, kept pure so scripts/verify-api.mjs can test it.
import { API_LIMITS, type BreakdownRequest, type EstimateRequest } from './types.js';

const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Clip every field to the API limits and keep only targets that reference real lines. */
export function sanitizeEstimate(body: EstimateRequest): EstimateRequest {
  const lines = body.lines.map((l) => ({
    id: String(l.id),
    text: String(l.text ?? '').slice(0, API_LIMITS.lineChars),
    indent: l.indent === 1 ? 1 : 0,
    notes: oneLine(l.notes, API_LIMITS.noteChars) || undefined,
  }));
  const ids = new Set(lines.map((l) => l.id));
  return {
    title: String(body.title ?? '').slice(0, API_LIMITS.titleChars),
    lines,
    targetIds: [...new Set(body.targetIds.map(String))].filter((id) => ids.has(id)),
  };
}

export function renderEstimatePrompt(body: EstimateRequest): string {
  const targets = new Set(body.targetIds);
  const rendered = body.lines
    .map((l) => {
      const head = `${l.id}${targets.has(l.id) ? ' [TARGET]' : ''} | ${'  '.repeat(l.indent ?? 0)}${l.text || '(empty)'}`;
      return l.notes && targets.has(l.id) ? `${head}\n    notes: ${l.notes}` : head;
    })
    .join('\n');
  return `Note title: ${body.title?.trim() || '(untitled)'}

Lines (id | text). Estimate only the ones marked [TARGET]:
${rendered}`;
}

export function sanitizeBreakdown(body: BreakdownRequest): BreakdownRequest {
  return {
    title: String(body.title ?? '').slice(0, API_LIMITS.titleChars),
    text: String(body.text ?? '').slice(0, API_LIMITS.breakdownChars),
    notes: oneLine(body.notes, API_LIMITS.noteChars) || undefined,
    siblings: (Array.isArray(body.siblings) ? body.siblings : [])
      .slice(0, API_LIMITS.siblings)
      .map((s) => String(s ?? '').slice(0, API_LIMITS.lineChars)),
  };
}

export function renderBreakdownPrompt(body: BreakdownRequest): string {
  return `Note title: ${body.title?.trim() || '(untitled)'}
Other lines in the note (context only):
${body.siblings.filter(Boolean).map((s) => `- ${s}`).join('\n') || '- (none)'}

Task to break down: ${body.text.trim()}${body.notes ? `\nNotes on this task: ${body.notes}` : ''}`;
}

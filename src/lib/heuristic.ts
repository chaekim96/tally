import type { Category, EstimateResult } from '../../lib/types';

/**
 * Offline fallback used when the AI endpoint is unavailable (no key, rate
 * limit, network). Deliberately conservative and keyword-based — it's here so
 * the app is always useful, not to compete with the model.
 */
const RULES: { re: RegExp; minutes: number; category: Category }[] = [
  { re: /\b(email|reply|respond|text|dm|slack|message|ping)\b/i, minutes: 10, category: 'Admin' },
  { re: /\b(call|phone)\b/i, minutes: 20, category: 'Admin' },
  { re: /\b(meeting|sync|standup|1:1|one on one|interview|coffee chat)\b/i, minutes: 30, category: 'Work' },
  { re: /\b(schedule|book|calendar|invite|pay|invoice|renew|register|apply|form|submit|file taxes|expense)\b/i, minutes: 15, category: 'Admin' },
  { re: /\b(review|proofread|edit|feedback)\b/i, minutes: 30, category: 'Work' },
  { re: /\b(write|draft|outline|memo|essay|blog|post|cover letter)\b/i, minutes: 60, category: 'Work' },
  { re: /\b(deck|slides|presentation|pitch)\b/i, minutes: 120, category: 'Work' },
  { re: /\b(research|analy[sz]e|compare|investigate|dig into|look into)\b/i, minutes: 60, category: 'Work' },
  { re: /\b(build|implement|code|ship|deploy|refactor|integrate|prototype|mvp|app|api|feature)\b/i, minutes: 180, category: 'Build' },
  { re: /\b(fix|debug|bug|patch)\b/i, minutes: 60, category: 'Build' },
  { re: /\b(design|mockup|wireframe|figma)\b/i, minutes: 90, category: 'Build' },
  { re: /\b(read|chapter|paper|article|textbook|case)\b/i, minutes: 45, category: 'Study' },
  { re: /\b(study|homework|problem set|pset|assignment|exam|quiz|lecture|course|udemy|practice)\b/i, minutes: 90, category: 'Study' },
  { re: /\b(gym|workout|run|lift|yoga|swim|bike|stretch|walk)\b/i, minutes: 60, category: 'Health' },
  { re: /\b(doctor|dentist|therapy|appointment|meds|pharmacy)\b/i, minutes: 60, category: 'Health' },
  { re: /\b(groceries|grocery|costco|trader joe|target|shopping|errand|pick ?up|drop ?off|post office|dmv|return)\b/i, minutes: 45, category: 'Errand' },
  { re: /\b(laundry|clean|dishes|vacuum|tidy|organize|cook|meal prep|dinner|lunch)\b/i, minutes: 40, category: 'Personal' },
  { re: /\b(plan|think|brainstorm|reflect|journal)\b/i, minutes: 30, category: 'Personal' },
  { re: /\b(watch|movie|show|game|hang|dinner with|date|birthday|party)\b/i, minutes: 120, category: 'Personal' },
];

const NON_TASK = /^(#|\/\/|note:|idea:|thought:|-{3,}|\?)/i;

export function heuristicEstimate(id: string, text: string): EstimateResult {
  const t = text.trim();
  if (!t || NON_TASK.test(t) || t.endsWith('?')) {
    return { id, minutes: 0, low: 0, high: 0, category: 'Other', confidence: 'low', rationale: 'Looks like a note, not a task' };
  }
  const rule = RULES.find((r) => r.re.test(t));
  let minutes = rule ? rule.minutes : 30;
  const category: Category = rule ? rule.category : 'Other';

  // Longer lines usually describe bigger work.
  const words = t.split(/\s+/).length;
  if (words > 12) minutes = Math.round(minutes * 1.4);
  if (/\b(quick|small|tiny|brief)\b/i.test(t)) minutes = Math.round(minutes * 0.5);
  if (/\b(all|entire|whole|full|complete|end[- ]to[- ]end)\b/i.test(t)) minutes = Math.round(minutes * 1.6);

  return {
    id,
    minutes,
    low: Math.round(minutes * 0.6),
    high: Math.round(minutes * 1.8),
    category,
    confidence: 'low',
    rationale: rule ? 'Keyword-based estimate (offline)' : 'Default estimate (offline)',
  };
}

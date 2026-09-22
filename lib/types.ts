// Shared between the browser app (src/) and the serverless functions (api/).

export const CATEGORIES = [
  'Work',
  'Build',
  'Study',
  'Errand',
  'Health',
  'Personal',
  'Admin',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Confidence = 'low' | 'medium' | 'high';

/** Where an estimate came from. `manual` is never overwritten automatically. */
export type EstimateSource = 'ai' | 'heuristic' | 'parsed' | 'manual';

export interface Item {
  id: string;
  text: string;
  done: boolean;
  /** Most-likely minutes. null = not estimated yet. */
  minutes: number | null;
  low?: number;
  high?: number;
  category: Category;
  confidence?: Confidence;
  rationale?: string;
  source: EstimateSource | null;
  /** 0 = top-level, 1 = sub-task (from Tab or "Break down"). */
  indent: 0 | 1;
}

export interface Note {
  id: string;
  title: string;
  items: Item[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** Minutes of focused time available per day. */
  dailyCapacityMinutes: number;
  autoEstimate: boolean;
  /** Your own Anthropic key. Takes priority over the server key; stored in this browser only. */
  apiKey: string;
  /** Unlocks the server's key (must match TALLY_ACCESS_CODE on Vercel). Stored in this browser only. */
  accessCode: string;
}

// ---- API contracts ----

/** Request caps enforced by the API; the client batches to stay under them. */
export const API_LIMITS = {
  lines: 500,
  lineChars: 300,
  targets: 50,
  titleChars: 200,
  breakdownChars: 500,
  siblings: 50,
} as const;

export interface HealthResponse {
  ok: true;
  model: string;
  /** ANTHROPIC_API_KEY is set on the server. */
  serverKey: boolean;
  /** TALLY_ACCESS_CODE is set; without it the server key is never used. */
  accessConfigured: boolean;
  /** This request's access code unlocks the server key. */
  serverKeyUsable: boolean;
}

export interface EstimateRequest {
  title: string;
  /** Every line in the note, for context. */
  lines: { id: string; text: string; indent: number }[];
  /** Which line ids to estimate. */
  targetIds: string[];
}

export interface EstimateResult {
  id: string;
  minutes: number;
  low: number;
  high: number;
  category: Category;
  confidence: Confidence;
  rationale: string;
}

export interface EstimateResponse {
  estimates: EstimateResult[];
  model: string;
}

export interface BreakdownRequest {
  title: string;
  text: string;
  siblings: string[];
}

export interface BreakdownStep {
  text: string;
  minutes: number;
  category: Category;
}

export interface BreakdownResponse {
  steps: BreakdownStep[];
  model: string;
}

export interface ApiError {
  error: 'no_key' | 'bad_key' | 'rate_limited' | 'upstream' | 'bad_request' | 'server';
  message: string;
}

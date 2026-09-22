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
  /** Optional browser-only key; sent as a header to /api and never stored server-side. */
  apiKey: string;
}

// ---- API contracts ----

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

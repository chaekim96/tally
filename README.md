# Tally

**Notes that add up.** A personal note-taker where every line you write gets a
time estimate in a ledger column on the right — so a to-do list turns into an
honest picture of your day.

Inspired by [Timely](https://github.com/chaekim96/Google-AI-Studio) (Google AI
Studio), rebuilt from scratch with a different design and a Claude-powered
estimator.

## What it does

- **Write like a list.** Title + lines. `Enter` for a new line, `Tab` to make a
  sub-task, `⌘Enter` to check something off.
- **Every line gets an estimate.** Claude reads the whole note for context and
  returns the most-likely minutes, an 80% range, a confidence level, and a
  category (Work · Build · Study · Errand · Health · Personal · Admin).
- **The Ledger.** Remaining vs. done, finish-by time, a day-capacity meter,
  where the time goes by category, quick wins (≤15m) and deep-work blocks
  (≥90m).
- **You stay in control.** Click any estimate to override it (`2h30`, `45m`,
  `90`). Write a duration in the line (`Gym (1h)`) and it's honoured exactly.
  Click a category chip to change it.
- **Break down.** `⌘B` on a line asks Claude to split it into 3–7 estimated
  sub-tasks.
- **Works offline.** No key? Estimates fall back to a keyword heuristic and are
  marked with `~`.
- Sort by longest/shortest, hide done, search, dark mode, copy as Markdown,
  JSON backup/restore. Notes live in your browser's local storage.

## Stack

- Vite + React 19 + TypeScript, Tailwind v4, lucide icons
- Vercel serverless functions in `api/` (Web-standard `POST(request)` handlers)
- `@anthropic-ai/sdk` with structured outputs (`messages.parse` + zod) on
  `claude-opus-5` — the key never reaches the browser

```
src/            the app
  components/   Sidebar · Editor · ItemRow · Ledger · SettingsDialog
  lib/          ai.ts (fetch wrapper) · heuristic.ts · notes.ts · storage.ts · time.ts
api/            estimate.ts · breakdown.ts · health.ts  (deployed as Vercel functions)
lib/            types.ts (shared contracts) · ai.ts (server-side Claude helpers)
docs/ROADMAP.md what's next, incl. the AI-execution layer
```

## Checks

```bash
npm run check   # typecheck + verify the api/ functions load under real Node ESM
```

`api/` files must use explicit `.js` extensions on relative imports — Vite and
`tsc --noEmit` accept extensionless ones, but Node's ESM loader in a deployed
function does not. `npm run verify:api` catches that before it ships.

## Who pays for estimates

Every model call is paid by exactly one key, chosen per request:

1. **Your own key** (Settings → Your Anthropic API key) always wins and never
   falls back to the server key. Visitors who bring a key pay for their own use.
2. **The server key** (`ANTHROPIC_API_KEY`) is used only when the request also
   carries the **access code** (Settings → Access code) matching
   `TALLY_ACCESS_CODE`. If `TALLY_ACCESS_CODE` isn't set, the server key is
   never used.
3. Otherwise the app runs on offline heuristics.

Requests are also capped: 64 KB body, 500 lines of context, 50 lines estimated
per call (the client batches), and bounded `max_tokens`. A Vercel Firewall
rate-limit rule on `/api/` stops loops before the function runs. As the final
backstop, set a monthly spend limit in the Anthropic Console.

## Run locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY and TALLY_ACCESS_CODE
npm run dev                  # http://localhost:5173 — /api/* is served by a Vite plugin
```

Without a key the app runs in offline (heuristic) mode.

## Deploy

The repo is set up for Vercel (framework preset: Vite). After importing:

1. **Settings → Environment Variables →** `ANTHROPIC_API_KEY` and `TALLY_ACCESS_CODE`
2. Deploy fresh from git (push a commit). The dashboard's *Redeploy* keeps the
   old deployment's env vars.
3. Open the app → Settings → Access code. `/api/health` sent with that code
   reports `serverKeyUsable: true`.

## Shortcuts

| Key | Action |
|---|---|
| `⌘N` | New note |
| `⌘,` | Settings |
| `Enter` / `Backspace` on empty | New line / remove line |
| `Tab` / `⇧Tab` | Indent / outdent (sub-task) |
| `⌘Enter` | Toggle done |
| `⌥↑` / `⌥↓` | Move line |
| `⌘E` | Re-estimate line |
| `⌘B` | Break line into sub-tasks |

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) — next up is an agent that can *do* the
task, not just size it.

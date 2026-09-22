# Roadmap

## v0.1 — shipped
Note list · line editor · Claude estimates with range + confidence · ledger with
capacity meter · manual overrides · inline durations · break down · offline
heuristics · dark mode · Markdown export · JSON backup.

## v0.2 — polish
- Drag-to-reorder lines (currently `⌥↑/↓`)
- Per-note "started at" so *finish by* uses a real start time
- Actual-vs-estimate tracking: a timer per line, and a personal calibration
  factor ("your Build tasks run 1.4× estimate")
- Recurring notes / templates (daily plan, weekly review)
- Sync: Vercel KV or Postgres keyed by a magic-link email, replacing localStorage

## v0.3 — the execution layer (the big one)

The goal: a line like *"Draft the follow-up email to Sarah"* gets a **Run**
button. Tally does the task, shows the result, and you approve it.

### Shape
```
POST /api/execute        { noteId, itemId, text, context, approvals[] }
  └─ Claude Opus 5 + tool use (client.beta.messages.toolRunner)
       tools: draft_email · web_search · calendar_find_slot · create_doc · run_code …
       stream: SSE events → the Ledger shows progress per line
  └─ returns { status: 'done' | 'needs_approval' | 'blocked', artifacts[], log[] }
```

### Principles
1. **Estimate first, execute second.** The estimator already knows the task
   shape; execution reuses that plan (and *break down* output) as its steps.
2. **Approval gates for side effects.** Drafting is free; sending, booking,
   paying, or publishing pauses with a `needs_approval` state rendered inline.
3. **Artifacts, not chat.** Each run attaches outputs (a draft, a doc link, a
   diff) to the line. The note stays a note.
4. **Learn from actuals.** Runs report real elapsed time back into the
   calibration factor from v0.2.

### Build order
- `lib/tools/` — one file per tool, each a `betaZodTool` with a `sideEffect`
  flag that the runner uses to decide when to pause.
- `api/execute.ts` — streaming handler (SSE); keep `api/estimate.ts` untouched.
- `Item.run` state in `lib/types.ts`: `{ status, startedAt, artifacts, log }`.
- UI: a **Run** action in the row hover menu + a run panel in the Ledger.
- Start with read-only / draft tools (search, summarise, draft email, outline a
  doc), then add connectors (Gmail, Calendar, Notion) behind approvals.

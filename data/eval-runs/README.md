# `data/eval-runs/` — offline batch eval reports

## What lives here

One JSON file per eval run, named with an ISO-8601 timestamp (colons replaced with hyphens). Each file is a **report card**: the result of running every oracle question through both query paths plus an LLM judge.

## How a file gets here

```
npm run eval     # → src/eval/runEval.ts
```

That script:
1. Boots the same way the server does (load text, load-or-compile rules).
2. For every question in `data/oracle.json`, calls both `answerQuery` (compile path) and `baselineQuery` (baseline path).
3. Passes each answer to the LLM judge (`src/eval/judge.ts`), which decides pass/fail against the expected answer.
4. Aggregates pass rates, average tokens, average latency, and writes a single timestamped JSON here.

The eval deliberately bypasses HTTP — it imports the runtime functions directly. The reason: the eval is about LLM correctness, not transport. Fewer moving parts, clearer signal. It also keeps eval requests *out* of `data/runs.jsonl`, which is reserved for live traffic.

## File shape

```jsonc
{
  "summary": {
    "n": 10,
    "compile":  { "passRate": 100, "avgInputTokens": 1776.1, "avgLatencyMs": 2511.6 },
    "baseline": { "passRate":  90, "avgInputTokens": 5024.1, "avgLatencyMs": 2232.5 },
    "savingsPct": 64.65
  },
  "results": [
    {
      "id": "yas-001",
      "question": "...",
      "expected": "...",
      "cite": "...",
      "compile":  { "answer": "...", "pass": true,  "reason": "...", "inputTokens": ..., "outputTokens": ..., "latency_ms": ... },
      "baseline": { "answer": "...", "pass": true,  "reason": "...", "inputTokens": ..., "outputTokens": ..., "latency_ms": ... }
    },
    ...
  ]
}
```

`summary` is what you'd quote in a write-up. `results` is the per-question detail you'd dig into if the summary looks weird.

## Conventions

- **Don't delete old runs.** They're the history of how the answer changed as the schema and prompts evolved. Tiny files; keep them all.
- **One run per change.** If you tweak the schema, the prompt, or the model, run the eval and let the new report land next to the old ones. Diffing two timestamps is how you'll know whether a change helped.
- **`savingsPct` is `(baselineInput − compileInput) / baselineInput`** — input tokens only. Output tokens are similar between paths and noisier; we don't headline them.
- Pass rates with `n = 10` are coarse. Treat shifts under ~10 percentage points as noise.

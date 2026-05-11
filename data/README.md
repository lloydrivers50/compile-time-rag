# `data/` — what's in here

This directory holds every file the experiment reads from disk or writes to disk. Code in `src/` reads these paths directly; nothing else.

See the project root `README.md` for what the experiment is and what the results were.

## Files

### `policy-text.txt`
Cached output of **Stage 1** of the compile pipeline — raw text extracted from the source PDF by `pdf-parse`. Produced once by `src/compile/loadOrExtractText.ts`, read on every boot. Delete this file to force a re-fetch and re-extraction of the PDF.

### `policy-rules.json`
The **compiled artefact**. Validated against the Zod schema in `src/schema/policySchema.ts`. Produced by `src/compile/loadOrCompilePolicy.ts` (which calls `askAboutPolicy.ts` under the hood) — the LLM reads `policy-text.txt`, returns structured rules via tool use, Zod validates, the result is written here.

On boot the server loads this file instead of re-running the compile. Delete it (or change the schema in a way the cached file fails) to force a recompile. **Recompiling costs tokens** — see the project README for the cost/benefit framing.

### `oracle.json`
The **gold-standard test bank**. A hand-curated (well — LLM-generated, spot-checked) set of questions with expected answers and policy citations. Used by the eval harness as ground truth.

Schema: `{ source, generated, notes, questions: [{ id, question, expected, cite }] }`.

This file is *input* to evaluation, not output. Editing it changes what "pass" means.

### `runs.jsonl`
**Live HTTP traffic log.** Every `POST /query` and `POST /baseline` request hits `src/obs/recordRun.ts`, which appends one JSON line here with timestamp, path, question, token counts, and latency. No expected answer, no judge — this is production-shaped observability, not evaluation.

Deliberately distinct from `eval-runs/` (offline batch reports) so live and batch numbers can't get mixed up.

### `eval-runs/`
Timestamped offline batch eval reports. See its own README.

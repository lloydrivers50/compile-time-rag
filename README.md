# Knowledge Layer Experiment

## What is this project?

We're testing an idea from a VentureBeat article. The claim:

> **If you do the hard work of understanding a document ahead of time, then asking questions about it later becomes way cheaper.**

The standard way to ask an AI about a document is to send the AI the question AND the whole document, every time. That's expensive — the AI has to re-read everything on every question.

The idea we're testing: read the document **once**, write down what it says in a clean structured file, and from then on, never show the AI the original document again. Questions become a cheap lookup, not a re-reading.

The article claims this can save around 98% of the tokens (= money). We want to see if that holds in a real test, and at what point the upfront cost pays itself back.

> **What's a token?** AI providers charge by tokens — roughly chunks of words. More text in or out = more tokens = more cost.

---

## Why NHS travel?

We picked NHS corporate travel as the test case. It fits the pattern:

- A travel policy document gets read by **lots of people doing lots of bookings**. Pay the upfront cost once, save on every booking after.
- Conferences and train routes **repeat** (Leeds → Manchester for the Confederation event, Band 8a per-diem rules, etc). Same answers needed many times.
- The rules are mostly **deterministic** ("Band 8a gets Standard Class") so there's a clean answer the AI doesn't need to re-derive each time.

The more repetitive the questions and the bigger the audience, the better this approach should look.

---

## The Test (the actual experiment)

We measure two numbers:

1. **Compile cost**: how many tokens it takes to read the policy ONCE and produce the clean file.
2. **Per-query cost**: how many tokens each user question costs when looking at the clean file (instead of the PDF).

Then: `total_cost = compile_cost + (per_query_cost × N queries)`

If per-query cost is much cheaper than asking with the full PDF every time, then after **N** queries we break even and start saving. We want to find that **N**.

---

## The Pipeline (in plain English)

There are **two halves**. They run at different times.

### Half 1 — Doing the homework (runs once, occasionally)

This is what we've built today.

```
PDF document
   ↓
[1] Pull the words out of the PDF
   ↓
[2] Send the words to the AI with a strict "answer in this shape" instruction
   ↓
[3] AI returns a structured answer (JSON)
   ↓
[4] Double-check the answer has the right shape
   ↓
[5] Save the clean file
```

**Stage 1 — Pull the words out of the PDF.**
A PDF is a binary file. You can't just open it like a text file and read it. We use a library called `pdf-parse` that extracts the words. **No AI involved.** Just pulling text out of bytes. Fast, free, identical result every time.

**Stage 2 — Ask the AI for the answer in a specific shape.**
We hand the extracted text to Claude with a strict instruction: *"Read this and give me the title, author, summary, and key concepts — in EXACTLY this JSON shape."* We use something called **tool use** to force the answer into our shape. Claude can't reply with a paragraph of prose; it can only fill in the fields we asked for.

**Stage 3 — AI returns structured data.**
Instead of a chatty response, we get something like:
```json
{
  "title": "Bitcoin: A Peer-to-Peer Electronic Cash System",
  "author": "Satoshi Nakamoto",
  "abstract": "...",
  "key_concepts": ["proof-of-work", "blockchain", "..."]
}
```

**Stage 4 — Double-check the shape.**
Even though we asked the AI to use a specific shape, we still verify it. We use a library called **Zod** that says *"if this JSON doesn't have the right fields and types, throw an error right now."* This is the safety net — if the AI ever returns garbage, we find out immediately, not three steps later when something else crashes.

**Stage 5 — Save the clean file.**
Once we have validated structured data, we save it as a JSON file (`data/policy-rules.json`). From now on, anyone asking questions about this document reads from THAT file — never the original PDF. On boot we look for the cached artifact first and only run Stages 2-5 if it's missing or fails validation (see `src/compile/loadOrCompilePolicy.ts`).

---

### Half 2 — Answering questions (runs every time someone asks)

Two query paths exist, on purpose — one is the thing we're testing, the other is the thing we're comparing against.

```
User question (e.g. "What's the mileage rate for my own car?")
   ↓
[1] Load the compiled rules JSON from disk
   ↓
[2] Send the rules + question to the AI
   ↓
[3] Reply to the user
```

**Compile path** (`src/runtime/answerQuery.ts`) — the AI sees the structured rules JSON plus the question. Never the PDF.

**Baseline path** (`src/runtime/baseline.ts`) — the AI sees the full raw policy text plus the question. This is the "vanilla RAG, inline the whole document" comparison.

Both paths use the same model and the same max tokens. The only thing that differs is the shape of the context. That's what keeps the comparison fair.

An HTTP server (`src/server.ts`) exposes both paths, and an offline eval harness (`src/eval/runEval.ts`) loops every question in `data/oracle.json` through both paths plus an LLM judge, then writes a timestamped report to `data/eval-runs/`.

**Honest caveat on what this half actually proves.** The compile path is not "look up the answer in the JSON" — the AI still reads the whole rules blob on every call. So what we're measuring is *compression* (denser representation than raw text), not *frontloading* (skipping the AI at query time entirely). A true frontloaded path would be deterministic code reaching into the rules JSON like any POJO, with no LLM call for the deterministic questions. That variant isn't built yet — it's the next architectural step if we want to test the article's strong claim.

---

## Results & status

**Status:** experiment paused. The headline question has an answer — it just isn't the answer the article promised.

**What works end-to-end:**
- Real corpus: NHS YAS Travel and Subsistence Policy v7.1 (PDF fetched, text extracted, cached to `data/policy-text.txt`).
- Compile pipeline runs and produces `data/policy-rules.json` — validated against a domain-specific schema (`src/schema/policySchema.ts`) covering mileage rates, accommodation eligibility, approval rules, booking process, exceptions, prohibitions, and evidence requirements.
- Boot uses the cached artifact when present and only recompiles on miss or validation failure.
- Both query paths run — compile-path and baseline — against the same model.
- Eval harness exists with a 10-question oracle (`data/oracle.json`), an LLM judge, and per-run reports under `data/eval-runs/`.

**Current measured result** (latest run, 10 questions):

| Path     | Pass rate | Avg input tokens | Avg latency |
| -------- | --------- | ---------------- | ----------- |
| Compile  | 100%      | 1,776            | 2,512 ms    |
| Baseline | 90%       | 5,024            | 2,233 ms    |

→ **64.6% input-token saving**, compile-path correctness as good or slightly better than baseline.

### What we concluded

- The "compile-time RAG" thesis *partly* holds. Replacing the raw PDF with a structured artefact in the prompt is a real, measurable cost win at no accuracy loss on this oracle.
- The article's ~98% claim is **not reachable with the architecture we built**. We're compressing the prompt, not eliminating it — the LLM still reads the rules JSON on every call. Hitting 98% would require either prompt caching (cheaper bytes), or a deterministic lookup path that bypasses the LLM for the questions that support it (no bytes at all), or a router that injects only the slice of rules relevant to the question.
- The strongest version of the experiment is therefore the variant we *didn't* build: tiny intent classifier → POJO lookup against the rules object → fallback LLM call only for fuzzy questions. That's the version that would actually test the article's strong claim.

### If we resume — what to do next, in priority order
1. Re-write the README's compile-cost framing once we actually measure compile-stage tokens (the eval harness currently only counts per-query tokens).
2. Compute the breakeven N — `compile_cost + per_query_cost × N` vs `baseline_per_query × N` — using the numbers we already have.
3. Add prompt caching on the rules block in `answerQuery.ts`. One-line change, biggest free win.
4. Build the POJO lookup path: a tiny intent classifier in front of deterministic TypeScript that reaches into the rules object for the deterministic questions. This is the only variant that can actually hit the article's 98% claim.
5. Grow the oracle. 10 LLM-generated questions are enough to feel out the harness; not enough to publish a number with.

---

## Project layout

```
data/
  README.md           ← what each artefact is
  policy-text.txt     ← Stage 1 output: extracted PDF text
  policy-rules.json   ← Stages 2–5 output: compiled, validated rules
  oracle.json         ← gold-standard question/answer/citation set
  runs.jsonl          ← live HTTP traffic log (per-request observability)
  eval-runs/
    README.md         ← what these reports are
    *.json            ← timestamped batch eval reports
src/
  compile/            ← Half 1 — Stage 1-5 of the homework
  runtime/            ← Half 2 — answerQuery (compile path) + baseline
  eval/               ← offline batch harness + LLM judge
  obs/                ← recordRun → data/runs.jsonl
  schema/             ← Zod schema for PolicyRules + tool definition
  server.ts           ← Express boot, /query and /baseline endpoints
```

---

## The mental hooks worth keeping

- **Two halves, two timescales.** Half 1 (homework) runs occasionally. Half 2 (answers) runs constantly. Different cost shapes, different code, different mental model.
- **Show the AI the document as little as possible.** Every time you re-show it, you pay tokens. The whole experiment is about minimising that.
- **Validate at the boundary.** Anywhere data crosses from "untrusted" (AI output, user input, files) into "trusted" (your typed code), put a Zod check. That's where bugs hide.
- **Plain code beats frameworks for one-shot stuff.** We chose the raw Anthropic SDK for the homework half because it's a single function call. Frameworks like LangGraph earn their keep in Half 2 where there are loops and state.

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
Once we have validated structured data, we save it as a JSON file. From now on, anyone asking questions about this document reads from THAT file — never the original PDF. *(We haven't built the save step yet; currently we just log the result to the console.)*

---

### Half 2 — Answering questions (runs every time someone asks)

We haven't built this part yet. It will look like:

```
User question (e.g. "What's the per-diem for Band 8a?")
   ↓
[1] Read the clean JSON file (NEVER the PDF)
   ↓
[2] Find the answer in the file
   ↓
[3] Reply to the user
```

**The whole point of this half:** it should be **cheap**, because we're not re-asking the AI to re-read the PDF every time. The expensive thinking already happened once, in Half 1. Now we're just looking things up.

---

## Where we are right now

**What works:**
- A PDF gets fetched and its text extracted (we're using the Bitcoin whitepaper as a stand-in for an NHS policy — same plumbing, easier test corpus).
- Claude reads the text and returns structured metadata (title, author, summary, key concepts).
- Zod validates the result before we trust it.
- Clean structured JSON appears in the console.

**What's next (when you come back):**
1. Save the result as a JSON file (right now we just log it).
2. Build the runtime side — read that JSON file and answer questions from it.
3. **Run the actual experiment**: count tokens for "lookup from clean file" vs "ask AI with full PDF every time" and compare.
4. Swap the Bitcoin whitepaper for a real (or synthetic) NHS travel policy.

---

## The mental hooks worth keeping

- **Two halves, two timescales.** Half 1 (homework) runs occasionally. Half 2 (answers) runs constantly. Different cost shapes, different code, different mental model.
- **Show the AI the document as little as possible.** Every time you re-show it, you pay tokens. The whole experiment is about minimising that.
- **Validate at the boundary.** Anywhere data crosses from "untrusted" (AI output, user input, files) into "trusted" (your typed code), put a Zod check. That's where bugs hide.
- **Plain code beats frameworks for one-shot stuff.** We chose the raw Anthropic SDK for the homework half because it's a single function call. Frameworks like LangGraph earn their keep in Half 2 where there are loops and state.

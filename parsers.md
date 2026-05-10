# Parsers

> A parser = LLM + Zod schema for one document type. Takes raw text, returns
> validated structured data ready for the artifact store. One parser per
> document type: PolicyParser, EventParser, RouteParser, etc.

This doc covers the meta-process of *creating and reasoning about* parsers.
For the per-document compile pipeline see `ingester.txt`. For the runtime
query path see `hl-design.txt`.

---

## The three time-axes

Every parser exists across three time-axes. They have very different cost
shapes and different amortisation profiles. The honest experiment ledger
must count all three.

### 1. Design-time — once per domain

Activities:
- Read 2-3 sample documents to understand the domain shape
- List the queries the parser must answer
- Design the Zod schema (`PolicyRules`, `EventRules`, etc.) to serve those queries
- Write the tool description (which the LLM reads as guidance)

Cost: LLM tokens spent reading sample docs + human design judgment.

Amortised across: every document of this type, forever.
A schema designed once works for all 200+ NHS trusts and any number of
re-parses as the source documents update.

> ⚠️ This is the cost most people forget to count. Schema design is not free
> just because it happens before "real" ingest. If you don't measure tokens
> spent here, the experiment math is rigged in your favour.

### 2. Compile-time — once per document

Activities (see `ingester.txt` for the full diagram):
- Pull raw bytes into the Raw Store (immutable, hashed)
- Extract text (PDF → text)
- Run the LLM with the schema as a forced tool call
- Validate the output with Zod (loose JSON gate)
- Normalise into canonical form (canonical JSON gate)
- Write to the Artifact Store, tagged with the raw-source hash

Cost: LLM tokens per document.

Amortised across: every query against that document.

### 3. Runtime — per query

Activities (see `hl-design.txt` for the full flow):
- Small LLM call to interpret the user query
- Structured lookup against the artifact
- Optional graph lookup
- Small LLM call to phrase the answer

Cost: small LLM call(s) + cheap lookups.

Not amortised — paid per query. This is the cost we're trying to drive down.

---

## The cost ledger

The honest comparison:

```
compile_RAG_total = design_cost
                  + (compile_cost × num_documents)
                  + (runtime_cost_cheap × num_queries)

baseline_RAG_total = full_doc_runtime_cost × num_queries
```

Break-even N = the query count at which `compile_RAG_total < baseline_RAG_total`.

Every cost above must be captured by the observability sink (see
`ingester.txt`). If a cost isn't measured, it isn't counted, and the
experiment lies.

---

## Recipe — designing a new parser

When adding a new document type (e.g. `EventParser`):

1. **List the queries first.** What will users ask of this document type?
   Schema fields exist to serve queries.
2. **Read 2-3 sample documents.** Skim, or have an LLM summarise the
   structure. Goal is the *shape of the domain*, not memorisation.
3. **Design the Zod schema.** Capture what's there AND what queries need.
   Always include an `unhandled` array as the escape hatch for things that
   don't fit.
4. **Write two files:** `xSchema.ts` (the contract) and `askAboutX.ts`
   (the LLM call + Zod gate). Match the existing parser pattern.
5. **Run on one sample document, inspect output.** Iterate the schema until
   coverage is acceptable. 80% coverage of common queries is already winning.
6. **Log design-time costs.** Every LLM call made during design goes in
   the ledger. Don't omit.

---

## Existing parsers

| Parser       | Schema file       | Driver file         | Status                  | First test doc                |
|--------------|-------------------|---------------------|-------------------------|-------------------------------|
| PolicyParser | `policySchema.ts` | `askAboutPolicy.ts` | Working (no save yet)   | YAS Travel & Subsistence v7.1 |

(Add rows as parsers are built.)

---

## Open questions

- How should design-time tokens be captured? (Manual logging? Wrap WebFetch calls?)
- When should design-time itself become automated? (e.g. "give the LLM 3 sample docs and ask it to propose a schema")
- How is schema versioning tied to artifact versioning? If the schema changes, all artifacts need re-compiling.
- At what point does a single schema stop covering a domain well, and you need multiple sub-parsers?

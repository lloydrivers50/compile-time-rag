import express from "express";
import { loadOrExtractText } from "./compile/loadOrExtractText";
import { loadOrCompilePolicy } from "./compile/loadOrCompilePolicy";
import { answerQuery } from "./runtime/answerQuery";
import { baselineQuery } from "./runtime/baseline";
import { recordRun } from "./obs/recordRun";

/*
These really belong inside a .config or .env file, but I'm hardcoding them here for simplicity since this is a demo. The URL can be any PDF; the cache and artifact paths can be anywhere on disk. The PORT can be any open port on your machine.
*/
const POLICY_PDF_URL =
  "https://www.yas.nhs.uk/media/5154/travel-and-subsistence-policy-and-employee-guidance-v71.pdf";
const TEXT_CACHE_PATH = "./data/policy-text.txt";
const ARTIFACT_PATH = "./data/policy-rules.json";
const PORT = 3000;

// BOOT — extract text once (cached), compile rules once (cached). Both
// stay in memory for the life of the process. /query uses rules,
// /baseline uses raw text. Neither endpoint touches the PDF after boot.
const policyText = await loadOrExtractText(POLICY_PDF_URL, TEXT_CACHE_PATH);
const rules = await loadOrCompilePolicy(policyText, ARTIFACT_PATH);
console.log("Starting server.");

const app = express();
app.use(express.json());

// COMPILE-RAG path: small structured rules + question
app.post("/query", async (req, res) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Body must be { message: string }" });
    return;
  }
  //Capture the data we need for observability BEFORE we run the query, so we can be sure to record it even if the query fails. We get input tokens from the rules (which are the same for every query, but that's fine) and output tokens from the question (which is the only part of the input that changes per query).
  const start = Date.now();
  try {
    const result = await answerQuery(rules, message);
    const latency_ms = Date.now() - start;
    await recordRun({
      ts: new Date().toISOString(),
      path: "compile",
      question: message,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms,
    });
    res.json({
      answer: result.answer,
      tokens: { input: result.inputTokens, output: result.outputTokens },
      latency_ms,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// BASELINE path: full PDF text + question (vanilla RAG comparison)
app.post("/baseline", async (req, res) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Body must be { message: string }" });
    return;
  }
  const start = Date.now();
  try {
    const result = await baselineQuery(policyText, message);
    const latency_ms = Date.now() - start;
    await recordRun({
      ts: new Date().toISOString(),
      path: "baseline",
      question: message,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms,
    });
    res.json({
      answer: result.answer,
      tokens: { input: result.inputTokens, output: result.outputTokens },
      latency_ms,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

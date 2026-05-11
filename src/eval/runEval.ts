import fs from "node:fs/promises";
import path from "node:path";
import { loadOrExtractText } from "../compile/loadOrExtractText";
import { loadOrCompilePolicy } from "../compile/loadOrCompilePolicy";
import { answerQuery } from "../runtime/answerQuery";
import { baselineQuery } from "../runtime/baseline";
import { judge } from "./judge";

const POLICY_PDF_URL =
  "https://www.yas.nhs.uk/media/5154/travel-and-subsistence-policy-and-employee-guidance-v71.pdf";
const TEXT_CACHE_PATH = "./data/policy-text.txt";
const ARTIFACT_PATH = "./data/policy-rules.json";
const ORACLE_PATH = "./data/oracle.json";
const RESULTS_DIR = "./data/eval-runs";

interface OracleEntry {
  id: string;
  question: string;
  expected: string;
  cite: string;
}

interface OracleFile {
  source: string;
  generated: string;
  notes: string;
  questions: OracleEntry[];
}

interface PathResult {
  answer: string;
  pass: boolean;
  reason: string;
  inputTokens: number;
  outputTokens: number;
  latency_ms: number;
}

interface PerQuestionResult {
  id: string;
  question: string;
  expected: string;
  cite: string;
  compile: PathResult;
  baseline: PathResult;
}

// EVAL HARNESS — offline batch runner.
//
// Boots the same way the server does (load text + rules from disk), then
// loops every oracle question through both paths plus an LLM judge.
//
// This deliberately bypasses HTTP. The eval is about LLM correctness, not
// transport — fewer moving parts means clearer signal. It also means we
// don't pollute runs.jsonl, which is for live /query traffic only.
async function main() {
  const policyText = await loadOrExtractText(POLICY_PDF_URL, TEXT_CACHE_PATH);
  const rules = await loadOrCompilePolicy(policyText, ARTIFACT_PATH);

  const oracleRaw = await fs.readFile(ORACLE_PATH, "utf8");
  const oracle = JSON.parse(oracleRaw) as OracleFile;

  console.log(
    `\nRunning ${oracle.questions.length} questions through both paths + judge...\n`,
  );

  const results: PerQuestionResult[] = [];

  for (const q of oracle.questions) {
    const compileStart = Date.now();
    const compileAnswer = await answerQuery(rules, q.question);
    const compileLatency = Date.now() - compileStart;
    const compileJudge = await judge(q.question, q.expected, compileAnswer.answer);

    const baselineStart = Date.now();
    const baselineAnswer = await baselineQuery(policyText, q.question);
    const baselineLatency = Date.now() - baselineStart;
    const baselineJudge = await judge(q.question, q.expected, baselineAnswer.answer);

    results.push({
      id: q.id,
      question: q.question,
      expected: q.expected,
      cite: q.cite,
      compile: {
        answer: compileAnswer.answer,
        pass: compileJudge.pass,
        reason: compileJudge.reason,
        inputTokens: compileAnswer.inputTokens,
        outputTokens: compileAnswer.outputTokens,
        latency_ms: compileLatency,
      },
      baseline: {
        answer: baselineAnswer.answer,
        pass: baselineJudge.pass,
        reason: baselineJudge.reason,
        inputTokens: baselineAnswer.inputTokens,
        outputTokens: baselineAnswer.outputTokens,
        latency_ms: baselineLatency,
      },
    });

    const c = compileJudge.pass ? "PASS" : "FAIL";
    const b = baselineJudge.pass ? "PASS" : "FAIL";
    console.log(
      `${q.id}  compile: ${c} ${compileAnswer.inputTokens}in/${compileAnswer.outputTokens}out  |  baseline: ${b} ${baselineAnswer.inputTokens}in/${baselineAnswer.outputTokens}out`,
    );
  }

  const summary = aggregate(results);

  console.log("\n=== SUMMARY ===");
  console.log(
    `Compile  pass rate: ${summary.compile.passRate.toFixed(0)}%  avg input: ${summary.compile.avgInputTokens.toFixed(0)}  avg latency: ${summary.compile.avgLatencyMs.toFixed(0)}ms`,
  );
  console.log(
    `Baseline pass rate: ${summary.baseline.passRate.toFixed(0)}%  avg input: ${summary.baseline.avgInputTokens.toFixed(0)}  avg latency: ${summary.baseline.avgLatencyMs.toFixed(0)}ms`,
  );
  console.log(`Input token savings: ${summary.savingsPct.toFixed(1)}%`);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(RESULTS_DIR, `${ts}.json`);
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nFull report saved to ${reportPath}`);
}

function aggregate(results: PerQuestionResult[]) {
  const n = results.length;
  const compilePass = results.filter((r) => r.compile.pass).length;
  const baselinePass = results.filter((r) => r.baseline.pass).length;
  const compileInputAvg =
    results.reduce((s, r) => s + r.compile.inputTokens, 0) / n;
  const baselineInputAvg =
    results.reduce((s, r) => s + r.baseline.inputTokens, 0) / n;
  const compileLatAvg =
    results.reduce((s, r) => s + r.compile.latency_ms, 0) / n;
  const baselineLatAvg =
    results.reduce((s, r) => s + r.baseline.latency_ms, 0) / n;

  return {
    n,
    compile: {
      passRate: (compilePass / n) * 100,
      avgInputTokens: compileInputAvg,
      avgLatencyMs: compileLatAvg,
    },
    baseline: {
      passRate: (baselinePass / n) * 100,
      avgInputTokens: baselineInputAvg,
      avgLatencyMs: baselineLatAvg,
    },
    savingsPct:
      ((baselineInputAvg - compileInputAvg) / baselineInputAvg) * 100,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

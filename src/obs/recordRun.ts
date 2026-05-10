import fs from "node:fs/promises";
import path from "node:path";

const RUNS_PATH = "./data/runs.jsonl";

export interface RunRecord {
  ts: string;
  path: "compile" | "baseline";
  question: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

// Append-only JSONL log of every query call.
// One line per call. Read it back with jq, a spreadsheet, or a short
// script when computing break-even N. No infra, no dashboards yet —
// just the raw numbers in a file.
export async function recordRun(record: RunRecord): Promise<void> {
  await fs.mkdir(path.dirname(RUNS_PATH), { recursive: true });
  await fs.appendFile(RUNS_PATH, JSON.stringify(record) + "\n");
}

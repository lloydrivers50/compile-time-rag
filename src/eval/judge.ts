import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 256;

export interface JudgeResult {
  pass: boolean;
  reason: string;
  inputTokens: number;
  outputTokens: number;
}

// LLM-as-judge. String-matching answers is brittle because phrasing varies
// across runs. A small Haiku call decides if the actual answer is
// factually equivalent to the expected one — same conclusion, no
// contradiction, no missing critical fact.
//
// Known limitation: the judge is the same model family as the system
// under test. Same blind spots. For a portfolio piece this is fine; a
// production eval would use a different vendor as judge.
export async function judge(
  question: string,
  expected: string,
  actual: string,
): Promise<JudgeResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content:
          `You are evaluating whether a Q&A system's answer matches the expected answer.\n\n` +
          `Question: ${question}\n` +
          `Expected: ${expected}\n` +
          `Actual: ${actual}\n\n` +
          `Mark PASS if the actual answer reaches the same conclusion as expected — no contradiction and no critical fact missing. Phrasing may differ.\n` +
          `Mark FAIL if the actual answer contradicts the expected, omits a critical fact, or adds incorrect information.\n\n` +
          `Respond ONLY with JSON in this exact shape: {"pass": true|false, "reason": "one short sentence"}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in judge response");
  }

  // Judge sometimes wraps JSON in prose or code fences. Strip to the first {...} block.
  const match = textBlock.text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`judge did not return JSON: ${textBlock.text}`);
  }
  const parsed = JSON.parse(match[0]) as { pass: boolean; reason: string };

  return {
    pass: parsed.pass,
    reason: parsed.reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

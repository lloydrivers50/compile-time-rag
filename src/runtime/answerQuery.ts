import Anthropic from "@anthropic-ai/sdk";
import type { PolicyRules } from "../schema/policySchema";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

export interface QueryResult {
  answer: string;
  inputTokens: number;
  outputTokens: number;
}

// RUNTIME — compile-RAG path.
// The LLM only ever sees the structured rules + the user question. The
// original PDF is never sent at query time. This is the cheap path the
// experiment is testing.
//
// Returns the answer AND the token usage so the caller can log it.
// Without token numbers there is no experiment.
export async function answerQuery(
  rules: PolicyRules,
  userMessage: string,
): Promise<QueryResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content:
          `You are answering questions about an NHS Trust travel and ` +
          `subsistence policy. Use ONLY the structured rules below to ` +
          `answer — do not invent information. If the rules don't contain ` +
          `the answer, say so plainly and name what's missing.\n\n` +
          `Rules:\n${JSON.stringify(rules, null, 2)}\n\n` +
          `Question: ${userMessage}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in LLM response");
  }
  return {
    answer: textBlock.text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

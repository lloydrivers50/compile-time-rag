import Anthropic from "@anthropic-ai/sdk";
import type { QueryResult } from "./answerQuery";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

// BASELINE — the comparison path the experiment is measured against.
//
// Sends the LLM the FULL raw policy text + the user question, every call.
// No compile step, no structured artifact, no schema. Vanilla RAG with
// the whole document inlined. We expect this path to use far more input
// tokens than the compile-RAG path because the entire policy is sent
// every time.
//
// Same model, same MAX_TOKENS, same task as answerQuery — only the
// context shape differs. That keeps the comparison fair.
export async function baselineQuery(
  policyText: string,
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
          `subsistence policy. The full policy is below. Answer the ` +
          `question using only the policy text. If the policy doesn't ` +
          `contain the answer, say so plainly.\n\n` +
          `Policy:\n${policyText}\n\n` +
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

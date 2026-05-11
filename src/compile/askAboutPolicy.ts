import Anthropic from "@anthropic-ai/sdk";
import { PolicyRules, policyRulesTool } from "../schema/policySchema";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";
// Bumped from 1024 — policy extraction produces a much bigger structured
// payload than the simple metadata case. If the LLM truncates, you'll see
// a JSON parse error from Zod.
const MAX_TOKENS = 4096;

// Stage 2-4 of the pipeline (policy-specific).
// Takes raw policy text, asks the LLM to extract structured rules,
// validates, returns a fully-typed PolicyRules. Callers never see content
// blocks or raw tool_use shapes.
export async function askLLMForPolicyRules(
  documentText: string,
): Promise<PolicyRules> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content:
          `Extract the structured policy rules from this NHS travel and ` +
          `subsistence document. Use the report_policy_rules tool.\n\n` +
          `Pay particular attention to:\n` +
          `- Exceptions ("X applies, EXCEPT when Y") — these are easy to ` +
          `miss because they qualify other rules.\n` +
          `- Prohibitions ("must not", "cannot", "is not permitted") — these ` +
          `are often as important as the positive rules.\n` +
          `- Evidence requirements (receipts, documentation, proofs).\n\n` +
          `Anything that doesn't fit a specific field goes into 'unhandled'.\n\n` +
          `Document:\n\n${documentText}`,
      },
    ],
    tools: [policyRulesTool],
    tool_choice: { type: "tool", name: "report_policy_rules" },
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("no tool_use block in LLM response");
  }

  return PolicyRules.parse(block.input);
}

import fs from "node:fs/promises";
import path from "node:path";
import { askLLMForPolicyRules } from "./askAboutPolicy";
import { PolicyRules } from "../schema/policySchema";

// THE BRIDGE between compile-time and runtime.
//
// At server boot this is the first thing that consults the pipeline.
// Two possible paths:
//
//   Cache hit  → read data/policy-rules.json, validate with Zod, return.
//                Stages 1-4 of the pipeline DO NOT RUN. This is the whole
//                point of compile-time RAG: the expensive work happened
//                once, in the past. Boot is just a disk read.
//
//   Cache miss → run Stages 2-5: LLM extraction → Zod validation →
//                save artifact to disk → return. (Stage 1 — extracting
//                text — was already done by loadOrExtractText upstream.)
//
// The function name encodes both paths: "load OR compile". That's why it
// appears so early at boot — at boot we WANT to load, and only fall back
// to compile when we have to.
//
// Takes pre-extracted text (not a URL) so the server can hold the raw
// text in memory once and pass it to whoever needs it. See
// loadOrExtractText.ts for the upstream cache.
//
// To force a recompile: delete the artifact file.
export async function loadOrCompilePolicy(
  text: string,
  artifactPath: string,
): Promise<PolicyRules> {
  const cached = await readIfExists(artifactPath);

  if (cached !== null) {
    try {
      const parsed = PolicyRules.parse(JSON.parse(cached));
      console.log(`Loaded cached artifact from ${artifactPath} (free).`);
      return parsed;
    } catch {
      console.log(
        `Cached artifact at ${artifactPath} failed schema validation — recompiling.`,
      );
    }
  }
  /*
  If we are here it means we have no JSON schema-valid artifact on disk, so we have to compile the rules from the raw text. This costs LLM tokens, so we want to avoid doing it more than once during development. Once we have a valid artifact, we save it to disk for future boots to load for free.
  */

  console.log("Compiling rules from raw text (this costs tokens)...");
  const rules = await askLLMForPolicyRules(text);
  /*
Since we did not have it, we better save the compiled artifact to disk for future use. This is the whole point of compile-time RAG: we do the expensive work once, save the results, and future boots can load the results for free.
*/
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify(rules, null, 2));
  console.log(`Saved compiled artifact to ${artifactPath}.`);

  return rules;
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

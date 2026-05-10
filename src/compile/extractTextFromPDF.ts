import { PDFParse } from "pdf-parse";

// Stage 1 of the pipeline.
// Pure plumbing: bytes in, text out. No LLM, no schema, no opinions.
// Identical input → identical output. Cheap and deterministic.
export async function extractTextFromPDF(url: string): Promise<string> {
  const parser = new PDFParse({ url });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

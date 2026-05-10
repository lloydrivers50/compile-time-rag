import fs from "node:fs/promises";
import path from "node:path";
import { extractTextFromPDF } from "./extractTextFromPDF";

// Disk-cached version of extractTextFromPDF.
// PDF extraction is free of LLM cost but slow and network-dependent.
// Caching the raw text means server restarts don't re-fetch and re-parse.
//
// To force a re-fetch: delete the cache file.
export async function loadOrExtractText(
  pdfUrl: string,
  cachePath: string,
): Promise<string> {
  try {
    // We don't validate the cached text here because it's just a blob of text — if the PDF changed in a way that broke the extraction, that's still a valid test of the end-to-end system. The cache is just to avoid redundant fetches and extractions during development.
    const cached = await fs.readFile(cachePath, "utf8");
    console.log(`Loaded raw text from ${cachePath}.`);
    return cached;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  // if we got here, there's no cache — we have to fetch and extract the text. 
  console.log("Fetching + extracting PDF text (no LLM cost)...");
  const text = await extractTextFromPDF(pdfUrl);
  /*
  Once the text is extracted, we save it to the cache path for future use.
  This avoids redundant fetches and extractions during development.                    
  */
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, text);
  console.log(`Saved raw text to ${cachePath}.`);
  return text;
}

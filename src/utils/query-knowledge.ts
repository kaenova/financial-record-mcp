import { readFileSync } from "fs";
import { join } from "path";

let _cachedKnowledge: string | null = null;

/**
 * Returns the full Google Query Language documentation text.
 * On first call reads from the bundled .txt file; thereafter returns cached result.
 *
 * At runtime the module tries multiple paths to find the bundled reference:
 *   1. Next to this module (unbundled dev mode)
 *   2. process.cwd() (typical for containerized runtime)
 *   3. Dist/google-sheets dir (one-off bundled builds)
 */
export function getGoogleQueryKnowledge(): string {
  if (_cachedKnowledge !== null) {
    return _cachedKnowledge;
  }

  const candidatePaths = [
    join(__dirname, "..", "google-sheets", "google-query-language.md.txt"),   // dev: src/utils/../google-sheets/
    join(process.cwd(), "src", "google-sheets", "google-query-language.md.txt"),
    join(process.cwd(), "dist", "google-sheets", "google-query-language.md.txt"),
    "/app/dist/google-sheets/google-query-language.md.txt",                         // container fallback
  ];

  let content: string | null = null;
  for (const p of candidatePaths) {
    try {
      content = readFileSync(p, "utf-8");
      break;
    } catch {
      // try next
    }
  }

  if (!content) {
    content =
      "Google Query Language reference not found. " +
      "Visit https://developers.google.com/chart/interactive/docs/querylanguage for full docs.";
  }

  _cachedKnowledge = content;
  return content;
}

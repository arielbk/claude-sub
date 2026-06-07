import { stripAnsi } from "./output-extractor.js";

const SNAPSHOT_BYTES = 4096;

export function formatDiagnostic(
  reason: "overall" | "idle",
  elapsedMs: number,
  rawOutput: string
): string {
  const snippet = rawOutput.slice(-SNAPSHOT_BYTES);
  const clean = stripAnsi(snippet);
  return [
    `csub: timed out (${reason})`,
    `elapsed: ${elapsedMs}ms`,
    ``,
    `--- raw PTY (last ${snippet.length} bytes) ---`,
    snippet,
    ``,
    `--- ANSI-stripped ---`,
    clean,
    ``,
  ].join("\n");
}

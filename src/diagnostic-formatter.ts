import { stripAnsi } from "./output-extractor.js";
import type { PtyRunFailReason } from "./pty-runner.js";

const SNAPSHOT_BYTES = 4096;

export function formatDiagnostic(
  reason: PtyRunFailReason,
  elapsedMs: number,
  rawOutput: string
): string {
  const snippet = rawOutput.slice(-SNAPSHOT_BYTES);
  const clean = stripAnsi(snippet);
  const header =
    reason === "no-reply"
      ? "csub: session ended without a clean reply (the prompt may never have been submitted)"
      : `csub: timed out (${reason})`;
  return [
    header,
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

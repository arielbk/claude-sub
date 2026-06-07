import { parseOutputMode } from "./output-mode-parser.js";

export type FailOpenResult =
  | { bypass: false }
  | { bypass: true; reason: string };

const FAIL_OPEN_FLAGS = new Set([
  "--output-format",
  "--input-format",
  "--include-partial-messages",
  "--include-hook-events",
  "--replay-user-messages",
  "--json-schema",
  "--resume",
  "-r",
  "--continue",
  "-c",
  "--session-id",
  "--fork-session",
  "--from-pr",
  "--no-session-persistence",
  "--max-budget-usd",
]);

export function detectFailOpen(argv: string[]): FailOpenResult {
  const outputMode = parseOutputMode(argv);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (
      flag === "--output-format" &&
      (outputMode.kind === "stream-json" || outputMode.kind === "json")
    ) {
      // stream-json and json are emulated in-process, so they do not force a bypass.
      continue;
    }
    if (FAIL_OPEN_FLAGS.has(flag)) {
      return { bypass: true, reason: flag };
    }
  }

  return { bypass: false };
}

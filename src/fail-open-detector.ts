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
  for (const arg of argv) {
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (FAIL_OPEN_FLAGS.has(flag)) {
      return { bypass: true, reason: flag };
    }
  }

  return { bypass: false };
}

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
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (flag === "--output-format") {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[i + 1];
      if (value === "stream-json") {
        continue;
      }
    }
    if (FAIL_OPEN_FLAGS.has(flag)) {
      return { bypass: true, reason: flag };
    }
  }

  return { bypass: false };
}

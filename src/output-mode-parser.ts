/**
 * Single owner of the `--output-format` vocabulary. Given argv, answers what
 * output mode was requested, distinguishing absent / supported / unsupported /
 * missing-value. Both the flag mapper and the fail-open detector consume this
 * one answer so the supported-values policy lives in exactly one place.
 */

export type OutputMode = "plain" | "stream-json" | "json";

export type OutputModeParse =
  | { kind: "absent" }
  | { kind: "stream-json" }
  | { kind: "json" }
  | { kind: "unsupported"; value: string }
  | { kind: "missing-value" };

export function parseOutputMode(argv: string[]): OutputModeParse {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output-format" || arg.startsWith("--output-format=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[i + 1];
      if (!value) {
        return { kind: "missing-value" };
      }
      if (value === "stream-json") {
        return { kind: "stream-json" };
      }
      if (value === "json") {
        return { kind: "json" };
      }
      return { kind: "unsupported", value };
    }
  }
  return { kind: "absent" };
}

/** The resolved mode for downstream rendering — unsupported/missing never reach here. */
export function resolvedOutputMode(parse: OutputModeParse): OutputMode {
  if (parse.kind === "stream-json") return "stream-json";
  if (parse.kind === "json") return "json";
  return "plain";
}

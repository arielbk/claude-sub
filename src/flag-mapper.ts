import {
  parseOutputMode,
  resolvedOutputMode,
  type OutputMode,
} from "./output-mode-parser.js";

export interface ParseSuccess {
  ok: true;
  prompt: string;
  passthroughArgs: string[];
  isPrintMode: boolean;
  outputMode: OutputMode;
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type FlagMapResult = ParseSuccess | ParseFailure;

const SUPPORTED_VALUE_FLAGS = new Set([
  "--model",
  "-m",
  "--append-system-prompt",
  "--system-prompt",
  "--permission-mode",
  "--settings",
  "--agent",
  "--agents",
]);
const SUPPORTED_BOOL_FLAGS = new Set([
  "--verbose",
  "-v",
  "--dangerously-skip-permissions",
  "--strict-mcp-config",
  "--bare",
]);
const SUPPORTED_VARIADIC_FLAGS = new Set([
  "--add-dir",
  "--mcp-config",
  "--allowedTools",
  "--allowed-tools",
  "--disallowedTools",
  "--disallowed-tools",
  "--tools",
  "--plugin-dir",
]);
const PRINT_FLAGS = new Set(["-p", "--print"]);

const UNSUPPORTED_FLAGS = ["--resume", "--json", "--no-markdown"];

export const SUPPORTED_FLAGS_LIST = [
  "--model (-m)",
  "--verbose (-v)",
  "--append-system-prompt",
  "--system-prompt",
  "--permission-mode",
  "--dangerously-skip-permissions",
  "--settings",
  "--agent",
  "--agents",
  "--strict-mcp-config",
  "--bare",
  "--add-dir",
  "--mcp-config",
  "--allowedTools/--allowed-tools",
  "--disallowedTools/--disallowed-tools",
  "--tools",
  "--plugin-dir",
  "--output-format stream-json",
];

export function parseArgs(args: string[]): FlagMapResult {
  const outputModeParse = parseOutputMode(args);
  if (outputModeParse.kind === "missing-value") {
    return { ok: false, error: `Flag --output-format requires a value` };
  }
  if (outputModeParse.kind === "unsupported") {
    return {
      ok: false,
      error:
        `Flag "--output-format" only supports stream-json in plan mode.\n` +
        `Supported flags: ${SUPPORTED_FLAGS_LIST.join(", ")}`,
    };
  }
  const outputMode = resolvedOutputMode(outputModeParse);

  let prompt: string | undefined;
  const passthroughArgs: string[] = [];
  let isPrintMode = false;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    const unsupported = UNSUPPORTED_FLAGS.find(
      (f) => arg === f || arg.startsWith(`${f}=`)
    );
    if (unsupported) {
      return {
        ok: false,
        error:
          `Flag "${unsupported}" is not supported in plan mode.\n` +
          `Supported flags: ${SUPPORTED_FLAGS_LIST.join(", ")}`,
      };
    }

    if (arg === "--output-format" || arg.startsWith("--output-format=")) {
      // Value already validated by parseOutputMode above; here we only skip the
      // flag (and its value, in the space form) so it isn't forwarded to claude.
      i += arg.includes("=") ? 1 : 2;
      continue;
    }

    if (PRINT_FLAGS.has(arg)) {
      isPrintMode = true;
      i++;
      if (i >= args.length) {
        return { ok: false, error: `Flag ${arg} requires a value` };
      }
      prompt = args[i];
      i++;
      continue;
    }

    if (SUPPORTED_VALUE_FLAGS.has(arg)) {
      i++;
      if (i >= args.length) {
        return { ok: false, error: `Flag ${arg} requires a value` };
      }
      passthroughArgs.push(arg, args[i]);
      i++;
      continue;
    }

    if (SUPPORTED_BOOL_FLAGS.has(arg)) {
      passthroughArgs.push(arg);
      i++;
      continue;
    }

    if (SUPPORTED_VARIADIC_FLAGS.has(arg)) {
      const valuesStart = i + 1;
      i = valuesStart;
      while (i < args.length && !args[i].startsWith("-")) {
        i++;
      }
      if (i === valuesStart) {
        return { ok: false, error: `Flag ${arg} requires a value` };
      }
      passthroughArgs.push(arg, ...args.slice(valuesStart, i));
      continue;
    }

    if (arg.startsWith("-")) {
      return {
        ok: false,
        error:
          `Flag "${arg}" is not supported in plan mode.\n` +
          `Supported flags: ${SUPPORTED_FLAGS_LIST.join(", ")}`,
      };
    }

    // Positional: first one is the prompt
    if (prompt === undefined) {
      prompt = arg;
    }
    i++;
  }

  if (!prompt || prompt.trim() === "") {
    return {
      ok: false,
      error:
        'No prompt provided. Use -p "your prompt" or provide it as a positional argument.',
    };
  }

  return { ok: true, prompt, passthroughArgs, isPrintMode, outputMode };
}

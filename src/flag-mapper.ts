export interface ParseSuccess {
  ok: true;
  prompt: string;
  passthroughArgs: string[];
  isPrintMode: boolean;
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type FlagMapResult = ParseSuccess | ParseFailure;

const SUPPORTED_VALUE_FLAGS = new Set(["--model", "-m"]);
const SUPPORTED_BOOL_FLAGS = new Set(["--verbose", "-v"]);
const PRINT_FLAGS = new Set(["-p", "--print"]);

const UNSUPPORTED_FLAGS = [
  "--output-format",
  "--resume",
  "--json",
  "--no-markdown",
];

export const SUPPORTED_FLAGS_LIST = ["--model (-m)", "--verbose (-v)"];

export function parseArgs(args: string[]): FlagMapResult {
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

  return { ok: true, prompt, passthroughArgs, isPrintMode };
}

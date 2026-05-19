import { readState, writeState } from "./state.js";
import { spawnSync } from "node:child_process";
import { resolveRealClaude } from "./real-claude-resolver.js";
import { detectFailOpen } from "./fail-open-detector.js";

export function resolveUsePty(envVar: string | undefined, stateEnabled: boolean): boolean {
  if (envVar === "1") return true;
  if (envVar === "0") return false;
  return stateEnabled;
}

export async function incrementInterceptCount(): Promise<void> {
  const state = await readState();
  await writeState({ interceptCount: state.interceptCount + 1 });
}

export async function incrementBypassCount(): Promise<void> {
  const state = await readState();
  await writeState({ bypassCount: state.bypassCount + 1 });
}

export type FailOpenBypassResult =
  | { bypassed: false }
  | { bypassed: true; exitCode: number };

export type RealClaudeExec = (
  command: string,
  args: string[],
  options: { stdio: "inherit"; env: NodeJS.ProcessEnv }
) => { status: number | null; signal: NodeJS.Signals | null };

export interface FailOpenBypassDeps {
  resolveRealClaude: () => string;
  spawnSync: RealClaudeExec;
  writeStderr: (message: string) => void;
  env: NodeJS.ProcessEnv;
}

export async function maybeRunFailOpenBypass(
  args: string[],
  deps: FailOpenBypassDeps = {
    resolveRealClaude,
    spawnSync,
    writeStderr: (message) => process.stderr.write(message),
    env: process.env,
  }
): Promise<FailOpenBypassResult> {
  const detected = detectFailOpen(args);
  if (!detected.bypass) {
    return { bypassed: false };
  }

  deps.writeStderr(
    `csub: ${detected.reason} is not supported under plan mode; this call will bill against API\n`
  );
  await incrementBypassCount();

  const result = deps.spawnSync(deps.resolveRealClaude(), args, {
    stdio: "inherit",
    env: deps.env,
  });

  return { bypassed: true, exitCode: result.status ?? (result.signal ? 1 : 0) };
}

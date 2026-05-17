import { readState, writeState, stateFilePath } from "./state.js";

export interface CommandResult {
  exitCode: number;
  output?: string;
}

export async function cmdOn(): Promise<CommandResult> {
  await writeState({ enabled: true });
  return { exitCode: 0 };
}

export async function cmdOff(): Promise<CommandResult> {
  await writeState({ enabled: false });
  return { exitCode: 0 };
}

export async function cmdStatus(): Promise<CommandResult & { output: string }> {
  const state = await readState();
  const fp = stateFilePath();
  const toggle = state.enabled ? "on" : "off";
  const output = [
    `Status: ${toggle}`,
    `State file: ${fp}`,
    `Intercepted ${state.interceptCount} calls`,
  ].join("\n");
  return { exitCode: 0, output };
}

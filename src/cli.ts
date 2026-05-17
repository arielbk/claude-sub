import { readState, writeState, stateFilePath } from "./state.js";
import { runDoctor } from "./doctor.js";
import { installSandbox } from "./install-sandbox.js";
export type { DiagnosticResult } from "./doctor.js";

export interface CommandResult {
  exitCode: number;
  output?: string;
}

export async function cmdOn(): Promise<CommandResult> {
  await writeState({ enabled: true });
  const diag = await runDoctor();
  const doctorLines = [diag.message];
  if (diag.remediation) doctorLines.push(diag.remediation);
  return { exitCode: 0, output: doctorLines.join("\n") };
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

export async function cmdDoctor(): Promise<CommandResult> {
  const result = await runDoctor();
  const lines: string[] = [result.message];
  if (result.remediation) lines.push(result.remediation);
  return {
    exitCode: result.ok ? 0 : 1,
    output: lines.join("\n"),
  };
}

export async function cmdInstallSandbox(name: string): Promise<CommandResult> {
  const result = await installSandbox(name);
  return { exitCode: result.exitCode, output: result.output };
}

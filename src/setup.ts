import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runDoctor } from "./doctor.js";
import { writeState } from "./state.js";

export type SupportedShell = "zsh" | "bash" | "fish";

export interface SetupOptions {
  nonInteractive?: boolean;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  binDir?: string;
  confirm?: (prompt: string) => Promise<boolean>;
}

export interface SetupPlan {
  shell: SupportedShell;
  rcFile: string;
  marker: string;
  line: string;
  alreadyPresent: boolean;
  diff: string;
}

export interface SetupResult {
  exitCode: number;
  output: string;
  wrote: boolean;
  plan: SetupPlan;
}

const MARKER = "# claude-sub setup";

export function detectShell(env: NodeJS.ProcessEnv = process.env): SupportedShell {
  const shell = env.SHELL ?? "";
  if (shell.endsWith("/fish") || shell === "fish") return "fish";
  if (shell.endsWith("/bash") || shell === "bash") return "bash";
  return "zsh";
}

export function rcFileForShell(
  shell: SupportedShell,
  homeDir: string = homedir()
): string {
  if (shell === "fish") return join(homeDir, ".config", "fish", "config.fish");
  if (shell === "bash") return join(homeDir, ".bashrc");
  return join(homeDir, ".zshrc");
}

export function pathLineForShell(shell: SupportedShell, binDir: string): string {
  if (shell === "fish") return `fish_add_path --prepend ${quoteFish(binDir)} ${MARKER}`;
  return `export PATH="${escapeDoubleQuoted(binDir)}:$PATH" ${MARKER}`;
}

export async function planSetup(options: SetupOptions = {}): Promise<SetupPlan> {
  const env = options.env ?? process.env;
  const shell = detectShell(env);
  const rcFile = rcFileForShell(shell, options.homeDir);
  const binDir = options.binDir ?? defaultBinDir();
  const line = pathLineForShell(shell, binDir);
  const existing = await readOptionalFile(rcFile);
  const alreadyPresent = existing.includes(MARKER);
  const diff = alreadyPresent
    ? `# ${rcFile} already contains ${MARKER}`
    : [`--- ${rcFile}`, `+++ ${rcFile}`, "@@", `+${line}`].join("\n");

  return { shell, rcFile, marker: MARKER, line, alreadyPresent, diff };
}

export async function setup(options: SetupOptions = {}): Promise<SetupResult> {
  const plan = await planSetup(options);
  const lines = [`Detected shell: ${plan.shell}`, `RC file: ${plan.rcFile}`, plan.diff];

  await writeState({ enabled: false });

  let wrote = false;
  if (plan.alreadyPresent) {
    lines.push("PATH entry already present; no changes made.");
  } else {
    const confirmed = options.nonInteractive
      ? true
      : await (options.confirm ?? promptForConfirmation)("Apply this change? [y/N] ");

    if (!confirmed) {
      lines.push("Setup cancelled; no changes made.");
      return { exitCode: 1, output: lines.join("\n"), wrote, plan };
    }

    await appendLine(plan.rcFile, plan.line);
    wrote = true;
    lines.push("PATH entry written.");
  }

  const diagnostic = await runDoctor();
  lines.push(diagnostic.message);
  if (diagnostic.remediation) lines.push(diagnostic.remediation);
  if (!diagnostic.ok) {
    lines.push("Open a new shell, then run: csub doctor");
  }

  return { exitCode: diagnostic.ok ? 0 : 1, output: lines.join("\n"), wrote, plan };
}

async function promptForConfirmation(prompt: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(prompt);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const existing = await readOptionalFile(filePath);
  const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
  await writeFile(filePath, `${prefix}${line}\n`, "utf8");
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    await access(filePath, constants.F_OK);
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function defaultBinDir(): string {
  return dirname(process.argv[1] ?? process.execPath);
}

function escapeDoubleQuoted(value: string): string {
  return value.replace(/["\\$`]/g, "\\$&");
}

function quoteFish(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}

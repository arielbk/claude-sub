import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { rcFileForShell, detectShell, type SupportedShell } from "./setup.js";

export interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr?: string;
}

export interface UninstallOptions {
  nonInteractive?: boolean;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  confirm?: (prompt: string) => Promise<boolean>;
  runCommand?: (command: string, args: string[]) => Promise<CommandRunResult>;
}

export interface UninstallPlan {
  shell: SupportedShell;
  rcFile: string;
  marker: string;
  markerPresent: boolean;
  diff: string;
}

export interface UninstallResult {
  exitCode: number;
  output: string;
  plan: UninstallPlan;
  removedMarker: boolean;
  packagePresent: boolean;
  uninstalledPackage: boolean;
}

const MARKER = "# claude-sub setup";
const PACKAGE_NAME = "claude-sub";

export async function planUninstall(options: UninstallOptions = {}): Promise<UninstallPlan> {
  const shell = detectShell(options.env ?? process.env);
  const rcFile = rcFileForShell(shell, options.homeDir);
  const existing = await readOptionalFile(rcFile);
  const markerLines = existing.split(/\r?\n/).filter((line) => line.includes(MARKER));
  const markerPresent = markerLines.length > 0;
  const diff = markerPresent
    ? [`--- ${rcFile}`, `+++ ${rcFile}`, "@@", ...markerLines.map((line) => `-${line}`)].join("\n")
    : `# ${rcFile} does not contain ${MARKER}`;

  return { shell, rcFile, marker: MARKER, markerPresent, diff };
}

export async function uninstall(options: UninstallOptions = {}): Promise<UninstallResult> {
  const plan = await planUninstall(options);
  const lines = [`Detected shell: ${plan.shell}`, `RC file: ${plan.rcFile}`, plan.diff];
  const confirm = options.confirm ?? promptForConfirmation;
  const runCommand = options.runCommand ?? runCommandDefault;
  let removedMarker = false;
  let packagePresent = false;
  let uninstalledPackage = false;

  if (plan.markerPresent) {
    const confirmed = options.nonInteractive
      ? true
      : await confirm("Remove claude-sub PATH entry from this rc file? [y/N] ");
    if (!confirmed) {
      lines.push("Uninstall cancelled; no changes made.");
      return {
        exitCode: 1,
        output: lines.join("\n"),
        plan,
        removedMarker,
        packagePresent,
        uninstalledPackage,
      };
    }

    await removeMarkerLines(plan.rcFile);
    removedMarker = true;
    lines.push("PATH entry removed.");
  } else {
    lines.push("PATH entry not found; no rc-file changes made.");
  }

  packagePresent = await isGlobalPackagePresent(runCommand);
  if (packagePresent) {
    const confirmed = options.nonInteractive
      ? true
      : await confirm("Uninstall global claude-sub package? [y/N] ");
    if (!confirmed) {
      lines.push("Global package uninstall skipped.");
      return {
        exitCode: 1,
        output: lines.join("\n"),
        plan,
        removedMarker,
        packagePresent,
        uninstalledPackage,
      };
    }

    const result = await runCommand("npm", ["uninstall", "-g", PACKAGE_NAME]);
    if (result.exitCode !== 0) {
      lines.push(result.stderr?.trim() || "Failed to uninstall global claude-sub package.");
      return {
        exitCode: result.exitCode || 1,
        output: lines.join("\n"),
        plan,
        removedMarker,
        packagePresent,
        uninstalledPackage,
      };
    }

    uninstalledPackage = true;
    lines.push("Global claude-sub package uninstalled.");
  } else {
    lines.push("Global claude-sub package not found; no package changes made.");
  }

  return {
    exitCode: 0,
    output: lines.join("\n"),
    plan,
    removedMarker,
    packagePresent,
    uninstalledPackage,
  };
}

async function isGlobalPackagePresent(
  runCommand: (command: string, args: string[]) => Promise<CommandRunResult>
): Promise<boolean> {
  const result = await runCommand("npm", ["ls", "-g", PACKAGE_NAME, "--depth=0", "--parseable"]);
  return result.exitCode === 0 && result.stdout.includes(PACKAGE_NAME);
}

async function removeMarkerLines(filePath: string): Promise<void> {
  const existing = await readOptionalFile(filePath);
  const lines = existing.split(/\r?\n/);
  const hadFinalNewline = existing.endsWith("\n");
  const kept = lines.filter((line, index) => {
    const isTrailingSplitLine = index === lines.length - 1 && line === "";
    return isTrailingSplitLine || !line.includes(MARKER);
  });
  let next = kept.join("\n");
  if (hadFinalNewline && !next.endsWith("\n")) next += "\n";
  await writeFile(filePath, next, "utf8");
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

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    await access(filePath, constants.F_OK);
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function runCommandDefault(command: string, args: string[]): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      const exitCode =
        typeof error === "object" && error && "code" in error && typeof error.code === "number"
          ? error.code
          : error
            ? 1
            : 0;
      resolve({ exitCode, stdout, stderr });
    });
  });
}

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

export interface DiagnosticResult {
  ok: boolean;
  shimPath?: string;
  realClaudePath?: string;
  message: string;
  remediation?: string;
}

export function isShimBinary(filePath: string): boolean {
  try {
    const head = readFileSync(filePath, { encoding: "utf8" }).slice(0, 4096);
    return (
      head.startsWith("#!") &&
      head.includes("shim.js") &&
      (head.includes("claude-sub") || head.includes("claude-plan-wrapper"))
    );
  } catch {
    return false;
  }
}

export function analyzePaths(
  paths: string[],
  shimChecker: (p: string) => boolean = isShimBinary
): DiagnosticResult {
  if (paths.length === 0) {
    return { ok: false, message: "claude not found on PATH — install claude and csub first" };
  }

  const shim = paths.find(shimChecker);
  const realClaude = paths.find((p) => !shimChecker(p));

  if (!shim) {
    return {
      ok: false,
      message: "csub shim not found on PATH — run: npm install -g claude-sub",
    };
  }

  if (!realClaude) {
    return {
      ok: false,
      message: "real claude binary not found on PATH behind the shim",
    };
  }

  if (!shimChecker(paths[0])) {
    const shimDir = dirname(shim);
    return {
      ok: false,
      message: "shim is not first on PATH — real claude appears before the shim",
      remediation: `export PATH="${shimDir}:$PATH"`,
    };
  }

  return {
    ok: true,
    shimPath: shim,
    realClaudePath: realClaude,
    message: "OK — shim is first on PATH and real claude is discoverable",
  };
}

export function getClaudePaths(): string[] {
  try {
    const output = execSync("which -a claude", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function runDoctor(): Promise<DiagnosticResult> {
  const paths = getClaudePaths();
  return analyzePaths(paths);
}

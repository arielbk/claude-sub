import { existsSync, statSync, realpathSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cachedPath: string | null = null;

/**
 * Finds the real `claude` binary by walking PATH and skipping any entry that
 * resolves back to this shim — either as a symlink (e.g. `pnpm link --global`)
 * or as a shell wrapper that re-execs our shim.js (e.g. `pnpm add -g <tgz>`).
 */
export function resolveRealClaude(): string {
  if (cachedPath !== null) return cachedPath;

  let shimRealPath: string;
  try {
    shimRealPath = realpathSync(process.argv[1]);
  } catch {
    shimRealPath = process.argv[1];
  }

  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv.split(":");

  for (const dir of dirs) {
    const candidate = join(dir, "claude");
    if (!existsSync(candidate)) continue;

    try {
      const stat = statSync(candidate);
      if (!stat.isFile() && !stat.isSymbolicLink()) continue;
      if ((stat.mode & 0o111) === 0) continue;

      if (pointsBackToShim(candidate, shimRealPath)) continue;

      cachedPath = candidate;
      return candidate;
    } catch {
      // Permission error or broken symlink — skip.
    }
  }

  throw new Error(
    "claude binary not found on PATH. " +
      "Ensure the real claude is installed and on PATH before the shim."
  );
}

function pointsBackToShim(candidate: string, shimRealPath: string): boolean {
  try {
    if (realpathSync(candidate) === shimRealPath) return true;
  } catch {
    // ignore
  }

  // Detect shell wrappers (pnpm/npm install) that re-exec our shim.js.
  // pnpm wrappers reference the target script via a `$basedir`-relative path,
  // so an exact realpath match won't appear in the script text — we look for
  // the package identity instead. The package name + shim filename together
  // make false positives vanishingly unlikely.
  try {
    const head = readFileSync(candidate, { encoding: "utf8" }).slice(0, 4096);
    if (
      head.startsWith("#!") &&
      head.includes("claude-plan-wrapper") &&
      head.includes("shim.js")
    ) {
      return true;
    }
  } catch {
    // Non-text binary or unreadable — not a wrapper to us.
  }

  return false;
}

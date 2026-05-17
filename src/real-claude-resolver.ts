import { existsSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";

let cachedPath: string | null = null;

/**
 * Finds the real `claude` binary by walking PATH and skipping any entry that
 * resolves to the same file as this shim (handles both direct invocation and
 * global-install symlinks transparently).
 */
export function resolveRealClaude(): string {
  if (cachedPath !== null) return cachedPath;

  // Resolve the shim's own real path to detect symlinks pointing back to us.
  let shimRealPath: string | null = null;
  try {
    shimRealPath = realpathSync(process.argv[1]);
  } catch {
    // If we can't resolve, fall back to the raw argv[1].
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

      // Resolve symlinks on the candidate and skip if it's ourself.
      const candidateReal = realpathSync(candidate);
      if (candidateReal === shimRealPath) continue;

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

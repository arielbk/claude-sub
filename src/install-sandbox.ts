import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SANDBOX_INSTALL_DIR = "/home/agent/.local/lib/claude-sub";
const STAGE_DIR = "/tmp/csub-stage";

export interface InstallResult {
  exitCode: number;
  output: string;
}

export function buildInstallPayload(): string {
  return [
    "#!/bin/bash",
    "set -euo pipefail",
    "",
    `INSTALL_DIR="${SANDBOX_INSTALL_DIR}"`,
    `STAGE_DIR="${STAGE_DIR}"`,
    'BIN_DIR="$INSTALL_DIR/bin"',
    'DIST_DIR="$INSTALL_DIR/dist"',
    'CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/claude-sub"',
    "",
    "# Idempotent: skip if already installed",
    'if [[ -L "$BIN_DIR/claude" ]] && [[ "$(readlink -f "$BIN_DIR/claude" 2>/dev/null)" == "$DIST_DIR/shim.js" ]] && [[ -d "$INSTALL_DIR/node_modules/node-pty" ]]; then',
    '  echo "claude-sub: already installed"',
    "  exit 0",
    "fi",
    "",
    "mkdir -p \"$BIN_DIR\" \"$CONFIG_DIR\"",
    "",
    "# Copy staged dist/ + package.json into INSTALL_DIR (staged via tar pipe).",
    'cp -r "$STAGE_DIR/dist" "$INSTALL_DIR/"',
    'cp "$STAGE_DIR/package.json" "$INSTALL_DIR/"',
    'chmod +x "$DIST_DIR/shim.js" "$DIST_DIR/csub.js"',
    "",
    "# Install runtime deps inside the sandbox so node-pty's native binding matches the sandbox arch.",
    'cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund --no-package-lock --silent',
    "",
    "# Symlink bin/claude -> dist/shim.js so resolveRealClaude detects it via realpath",
    'ln -sf "$DIST_DIR/shim.js" "$BIN_DIR/claude"',
    'ln -sf "$DIST_DIR/csub.js" "$BIN_DIR/csub"',
    "",
    "# Prepend bin dir to PATH in ~/.bashrc",
    'PROFILE="$HOME/.bashrc"',
    'if ! grep -qF "claude-sub" "$PROFILE" 2>/dev/null; then',
    '  printf \'export PATH="%s:$PATH"\\n\' "$BIN_DIR" >> "$PROFILE"',
    "fi",
    "",
    "# Write state file with enabled: true",
    'cat > "$CONFIG_DIR/state.json" << \'STATE_EOF\'',
    "{",
    '  "enabled": true,',
    '  "interceptCount": 0',
    "}",
    "STATE_EOF",
    "",
    'echo "claude-sub: installed. Re-source ~/.bashrc or start a new shell."',
  ].join("\n");
}

export async function installSandbox(name: string): Promise<InstallResult> {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(thisDir, "..");

  // Stage files in the sandbox via docker sandbox exec (raw `docker exec`
  // doesn't see sandbox VMs — they're managed by the `docker sandbox` subsystem).
  const mkdirResult = spawnSync(
    "docker",
    ["sandbox", "exec", name, "mkdir", "-p", STAGE_DIR],
    { encoding: "utf8" },
  );
  if (mkdirResult.status !== 0) {
    throw new Error(`docker sandbox exec mkdir failed: ${mkdirResult.stderr}`);
  }

  // `docker sandbox` has no `cp` equivalent — tar dist/ + package.json over stdin.
  // We deliberately exclude node_modules: the host build may be macOS/arm64; node-pty
  // ships a native binding per-platform and must be reinstalled inside the sandbox.
  const tarOut = spawnSync(
    "tar",
    ["-cf", "-", "-C", packageRoot, "dist", "package.json"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (tarOut.status !== 0) {
    throw new Error(`tar pack failed: ${tarOut.stderr?.toString() ?? ""}`);
  }
  const cpResult = spawnSync(
    "docker",
    ["sandbox", "exec", "-i", name, "tar", "-xf", "-", "-C", STAGE_DIR],
    { input: tarOut.stdout, encoding: "utf8" },
  );
  if (cpResult.status !== 0) {
    throw new Error(`tar extract in sandbox failed: ${cpResult.stderr}`);
  }

  // Run setup payload
  const payload = buildInstallPayload();
  const execResult = spawnSync("docker", ["sandbox", "exec", "-i", name, "bash", "-s"], {
    input: payload,
    encoding: "utf8",
  });

  const output = (execResult.stdout ?? "").trim();
  const exitCode = execResult.status ?? 1;

  if (exitCode !== 0) {
    const stderr = (execResult.stderr ?? "").trim();
    throw new Error(`install-sandbox failed (exit ${exitCode}): ${stderr || output}`);
  }

  return { exitCode, output };
}

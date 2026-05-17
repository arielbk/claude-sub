import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const SANDBOX_INSTALL_DIR = "/home/agent/.local/lib/claude-sub";

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
    'BIN_DIR="$INSTALL_DIR/bin"',
    'DIST_DIR="$INSTALL_DIR/dist"',
    'CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/claude-sub"',
    "",
    "# Idempotent: skip if already installed",
    'if [[ -L "$BIN_DIR/claude" ]] && [[ "$(readlink -f "$BIN_DIR/claude" 2>/dev/null)" == "$DIST_DIR/shim.js" ]]; then',
    '  echo "claude-sub: already installed"',
    "  exit 0",
    "fi",
    "",
    "mkdir -p \"$BIN_DIR\" \"$DIST_DIR\" \"$CONFIG_DIR\"",
    "",
    "# Copy dist files from temp staging area populated by docker cp",
    'cp -r /tmp/csub-dist/. "$DIST_DIR/"',
    'chmod +x "$DIST_DIR/shim.js"',
    "",
    "# Symlink bin/claude -> dist/shim.js so resolveRealClaude detects it via realpath",
    'ln -sf "$DIST_DIR/shim.js" "$BIN_DIR/claude"',
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

  // Stage dist files in the sandbox
  const mkdirResult = spawnSync("docker", ["exec", name, "mkdir", "-p", "/tmp/csub-dist"], {
    encoding: "utf8",
  });
  if (mkdirResult.status !== 0) {
    throw new Error(`docker exec mkdir failed: ${mkdirResult.stderr}`);
  }

  const cpResult = spawnSync("docker", ["cp", `${thisDir}/.`, `${name}:/tmp/csub-dist/`], {
    encoding: "utf8",
  });
  if (cpResult.status !== 0) {
    throw new Error(`docker cp failed: ${cpResult.stderr}`);
  }

  // Run setup payload
  const payload = buildInstallPayload();
  const execResult = spawnSync("docker", ["exec", "-i", name, "bash", "-s"], {
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

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shimBin = resolve(__dirname, "../../dist/shim.js");
const realClaude = "/home/agent/.local/bin/claude";

describe("shim passthrough", () => {
  it("dist/shim.js exists after build", () => {
    expect(existsSync(shimBin)).toBe(true);
  });

  it("shim --help output matches real claude --help", () => {
    const shimResult = spawnSync("node", [shimBin, "--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        CLAUDE_USE_PLAN: undefined,
      },
    });

    const realResult = spawnSync(realClaude, ["--help"], {
      encoding: "utf8",
      timeout: 15000,
    });

    expect(shimResult.status).toBe(realResult.status);
    expect(shimResult.stdout).toBe(realResult.stdout);
  });

  it("CLAUDE_USE_PLAN unset: shim passes through -p without plan-mode", () => {
    const result = spawnSync("node", [shimBin, "--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, CLAUDE_USE_PLAN: undefined },
    });
    // Passthrough: output should not contain the stub marker
    expect(result.stdout).not.toContain("[plan-mode stub]");
  });
});

describe("shim plan-mode branch (CLAUDE_USE_PLAN=1)", () => {
  it("exits 0 and emits stub output when -p is given with supported flags", () => {
    const result = spawnSync(
      "node",
      [shimBin, "-p", "hello", "--model", "sonnet"],
      {
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, CLAUDE_USE_PLAN: "1" },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hello");
  });

  it("exits non-zero with stderr message when unsupported flag is given", () => {
    const result = spawnSync(
      "node",
      [shimBin, "-p", "hello", "--output-format", "json"],
      {
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, CLAUDE_USE_PLAN: "1" },
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--output-format");
    expect(result.stderr).toContain("--model");
  });

  it("CLAUDE_USE_PLAN=1 without -p passes through to real claude", () => {
    const shimResult = spawnSync("node", [shimBin, "--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, CLAUDE_USE_PLAN: "1" },
    });
    const realResult = spawnSync(realClaude, ["--help"], {
      encoding: "utf8",
      timeout: 15000,
    });
    expect(shimResult.status).toBe(realResult.status);
    expect(shimResult.stdout).toBe(realResult.stdout);
  });
});

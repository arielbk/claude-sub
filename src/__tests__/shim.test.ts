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
        // Ensure opt-in flag is NOT set so shim passes through unconditionally.
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
});

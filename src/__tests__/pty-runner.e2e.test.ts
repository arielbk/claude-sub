import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shimBin = resolve(__dirname, "../../dist/shim.js");

const isE2E = process.env.CLAUDE_USE_PLAN_E2E === "1";

describe.skipIf(!isE2E)("sentinel-and-clean-extraction e2e", () => {
  it(
    'shim with CLAUDE_USE_PLAN=1 -p "reply with the single word OK" outputs exactly OK\\n',
    () => {
      const result = spawnSync(
        "node",
        [shimBin, "-p", "reply with the single word OK"],
        {
          encoding: "utf8",
          timeout: 120000,
          env: { ...process.env, CLAUDE_USE_PLAN: "1" },
        }
      );
      expect(result.status).toBe(0);
      // Clean output: no ANSI, no sentinel, no TUI chrome — just the reply + newline
      expect(result.stdout).not.toContain("\x1b[");
      expect(result.stdout).not.toContain("__PLAN_MODE_DONE_7a3b9f__");
      expect(result.stdout.trim()).toBe("OK");
    },
    120000
  );
});

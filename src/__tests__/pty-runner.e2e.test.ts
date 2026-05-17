import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shimBin = resolve(__dirname, "../../dist/shim.js");

const isE2E = process.env.CLAUDE_USE_PLAN_E2E === "1";

describe.skipIf(!isE2E)("pty-roundtrip e2e", () => {
  it(
    'shim with CLAUDE_USE_PLAN=1 -p "reply with the single word OK" outputs OK',
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
      expect(result.stdout).toContain("OK");
    },
    120000
  );
});

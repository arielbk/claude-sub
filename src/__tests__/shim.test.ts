import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shimBin = resolve(__dirname, "../../dist/shim.js");

function makeFakeClaude(contents: string): { tmp: string; realDir: string } {
  const tmp = mkdtempSync(join(tmpdir(), "shim-real-claude-"));
  const realDir = join(tmp, "bin");
  mkdirSync(realDir);
  const realClaude = join(realDir, "claude");
  writeFileSync(realClaude, contents);
  chmodSync(realClaude, 0o755);
  return { tmp, realDir };
}

describe("shim passthrough", () => {
  it("dist/shim.js exists after build", () => {
    expect(existsSync(shimBin)).toBe(true);
  });

  it("shim --help output matches real claude --help", () => {
    const fake = makeFakeClaude("#!/bin/sh\necho real-help\nexit 21\n");
    const shimResult = spawnSync("node", [shimBin, "--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        CLAUDE_USE_SUB: undefined,
        PATH: `${fake.realDir}:${process.env.PATH ?? ""}`,
      },
    });

    const realResult = spawnSync(join(fake.realDir, "claude"), ["--help"], {
      encoding: "utf8",
      timeout: 15000,
    });

    try {
      expect(shimResult.status).toBe(realResult.status);
      expect(shimResult.stdout).toBe(realResult.stdout);
    } finally {
      rmSync(fake.tmp, { recursive: true, force: true });
    }
  });

  it("CLAUDE_USE_SUB unset: shim passes through -p without plan-mode", () => {
    const fake = makeFakeClaude("#!/bin/sh\necho real-help\n");
    const result = spawnSync("node", [shimBin, "--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        CLAUDE_USE_SUB: undefined,
        PATH: `${fake.realDir}:${process.env.PATH ?? ""}`,
      },
    });
    try {
      expect(result.stdout).toBe("real-help\n");
    } finally {
      rmSync(fake.tmp, { recursive: true, force: true });
    }
  });
});

vi.mock("../state.js", () => ({
  readState: vi.fn(),
  writeState: vi.fn().mockResolvedValue(undefined),
  stateFilePath: vi.fn(),
}));

import { resolveUsePty, incrementInterceptCount, maybeRunFailOpenBypass } from "../shim-logic.js";
import { readState, writeState } from "../state.js";

describe("resolveUsePty (routing logic)", () => {
  it("env=unset + state=on → PTY path taken", () => {
    expect(resolveUsePty(undefined, true)).toBe(true);
  });

  it("env=unset + state=off → pass-through", () => {
    expect(resolveUsePty(undefined, false)).toBe(false);
  });

  it("env=1 + state=off → pass-through", () => {
    expect(resolveUsePty("1", false)).toBe(false);
  });

  it("env=0 + state=on → PTY path taken", () => {
    expect(resolveUsePty("0", true)).toBe(true);
  });
});

describe("incrementInterceptCount (mocked state writer)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (writeState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("reads current state and writes back interceptCount + 1", async () => {
    (readState as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      interceptCount: 5,
    });
    await incrementInterceptCount();
    expect(writeState).toHaveBeenCalledWith({ interceptCount: 6 });
  });
});

describe("maybeRunFailOpenBypass (mocked real claude exec)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (writeState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("routes fail-open flags to real claude with original argv and increments bypassCount", async () => {
    (readState as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: true,
      interceptCount: 2,
      bypassCount: 4,
    });
    const resolveRealClaude = vi.fn(() => "/usr/local/bin/claude");
    const spawnSync = vi.fn(() => ({ status: 7, signal: null }));
    const writeStderr = vi.fn();

    const result = await maybeRunFailOpenBypass(
      ["-p", "prompt", "--input-format", "stream-json"],
      {
        resolveRealClaude,
        spawnSync,
        writeStderr,
        env: { CLAUDE_USE_SUB: "1" },
      }
    );

    expect(result).toEqual({ bypassed: true, exitCode: 7 });
    expect(resolveRealClaude).toHaveBeenCalledOnce();
    expect(spawnSync).toHaveBeenCalledWith(
      "/usr/local/bin/claude",
      ["-p", "prompt", "--input-format", "stream-json"],
      { stdio: "inherit", env: { CLAUDE_USE_SUB: "1" } }
    );
    expect(writeStderr).toHaveBeenCalledWith(
      "csub: --input-format is not supported under subscription mode; this call will bill against API\n"
    );
    expect(writeState).toHaveBeenCalledWith({ bypassCount: 5 });
  });

  it("leaves allowlisted plan-mode invocations on the PTY path without incrementing bypassCount", async () => {
    for (const args of [
      ["-p", "prompt", "--model", "sonnet"],
      ["-p", "prompt", "--output-format", "stream-json"],
      ["-p", "prompt", "--output-format", "json"],
    ]) {
      const result = await maybeRunFailOpenBypass(args, {
        resolveRealClaude: vi.fn(),
        spawnSync: vi.fn(),
        writeStderr: vi.fn(),
        env: { CLAUDE_USE_SUB: "1" },
      });

      expect(result).toEqual({ bypassed: false });
    }
    expect(readState).not.toHaveBeenCalled();
    expect(writeState).not.toHaveBeenCalled();
  });
});

const isE2E = process.env.CLAUDE_USE_SUB_E2E === "1";

describe("shim plan-mode branch (CLAUDE_USE_SUB=1)", () => {
  it.skipIf(!isE2E)(
    "exits 0 and produces output when -p is given with supported flags",
    () => {
      const result = spawnSync(
        "node",
        [shimBin, "-p", "reply with the single word HELLO", "--model", "sonnet"],
        {
          encoding: "utf8",
          timeout: 120000,
          env: { ...process.env, CLAUDE_USE_SUB: "1" },
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    },
    120000
  );

  it("stream-json output emits assistant and result events without fail-open warning", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shim-stream-json-"));
    try {
      const realDir = join(tmp, "bin");
      const configHome = join(tmp, "config");
      mkdirSync(realDir);
      mkdirSync(join(configHome, "claude-sub"), { recursive: true });
      writeFileSync(
        join(configHome, "claude-sub", "state.json"),
        JSON.stringify({ enabled: true, interceptCount: 0, bypassCount: 0 })
      );
      writeFileSync(
        join(realDir, "claude"),
        "#!/bin/sh\necho OK\necho __PLAN_MODE_DONE_7a3b9f__\n"
      );
      chmodSync(join(realDir, "claude"), 0o755);

      const result = spawnSync(
        "node",
        [shimBin, "-p", "hello", "--output-format", "stream-json"],
        {
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            CLAUDE_USE_SUB: "1",
            XDG_CONFIG_HOME: configHome,
            PATH: `${realDir}:${process.env.PATH ?? ""}`,
          },
        }
      );

      const events = result.stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as {
          type: string;
          result?: string;
          message?: { content: Array<{ type: string; text: string }> };
        });

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("will bill against API");
      expect(events.find((event) => event.type === "assistant")?.message?.content[0]).toEqual({
        type: "text",
        text: "OK",
      });
      expect(events.find((event) => event.type === "result")?.result).toBe("OK");
      expect(
        JSON.parse(readFileSync(join(configHome, "claude-sub", "state.json"), "utf8"))
      ).toMatchObject({ bypassCount: 0, interceptCount: 1 });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("json output emits one parseable result object and no fail-open warning", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shim-json-"));
    try {
      const realDir = join(tmp, "bin");
      const configHome = join(tmp, "config");
      mkdirSync(realDir);
      mkdirSync(join(configHome, "claude-sub"), { recursive: true });
      writeFileSync(
        join(configHome, "claude-sub", "state.json"),
        JSON.stringify({ enabled: true, interceptCount: 0, bypassCount: 0 })
      );
      writeFileSync(
        join(realDir, "claude"),
        "#!/bin/sh\necho OK\necho __PLAN_MODE_DONE_7a3b9f__\n"
      );
      chmodSync(join(realDir, "claude"), 0o755);

      const result = spawnSync(
        "node",
        [shimBin, "-p", "hello", "--output-format", "json"],
        {
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            CLAUDE_USE_SUB: "1",
            XDG_CONFIG_HOME: configHome,
            PATH: `${realDir}:${process.env.PATH ?? ""}`,
          },
        }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("will bill against API");
      const parsed = JSON.parse(result.stdout) as { type: string; result: string };
      expect(parsed).toEqual({ type: "result", result: "OK" });
      expect(
        JSON.parse(readFileSync(join(configHome, "claude-sub", "state.json"), "utf8"))
      ).toMatchObject({ bypassCount: 0, interceptCount: 1 });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fail-open flag warns, increments bypassCount, and passes original argv to real claude", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shim-fail-open-"));
    try {
      const realDir = join(tmp, "bin");
      const configHome = join(tmp, "config");
      const argvLog = join(tmp, "argv.json");
      mkdirSync(realDir);
      mkdirSync(join(configHome, "claude-sub"), { recursive: true });
      writeFileSync(
        join(configHome, "claude-sub", "state.json"),
        JSON.stringify({ enabled: true, interceptCount: 0, bypassCount: 0 })
      );
      writeFileSync(
        join(realDir, "claude"),
        `#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(
          argvLog
        )}, JSON.stringify(process.argv.slice(2)));\nprocess.exit(13);\n`
      );
      chmodSync(join(realDir, "claude"), 0o755);

      const result = spawnSync(
        "node",
        [shimBin, "-p", "hello", "--input-format", "stream-json"],
        {
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            CLAUDE_USE_SUB: "1",
            XDG_CONFIG_HOME: configHome,
            PATH: `${realDir}:${process.env.PATH ?? ""}`,
          },
        }
      );

      expect(result.status).toBe(13);
      expect(result.stderr).toContain(
        "csub: --input-format is not supported under subscription mode; this call will bill against API"
      );
      expect(JSON.parse(readFileSync(argvLog, "utf8"))).toEqual([
        "-p",
        "hello",
        "--input-format",
        "stream-json",
      ]);
      expect(
        JSON.parse(readFileSync(join(configHome, "claude-sub", "state.json"), "utf8"))
      ).toMatchObject({ bypassCount: 1, interceptCount: 0 });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("exits non-zero with stderr message when an unknown unsupported flag is given", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shim-unsupported-"));
    const configHome = join(tmp, "config");
    mkdirSync(join(configHome, "claude-sub"), { recursive: true });
    writeFileSync(
      join(configHome, "claude-sub", "state.json"),
      JSON.stringify({ enabled: true, interceptCount: 0, bypassCount: 0 })
    );
    const result = spawnSync(
      "node",
      [shimBin, "-p", "hello", "--unknown-flag"],
      {
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, CLAUDE_USE_SUB: "1", XDG_CONFIG_HOME: configHome },
      }
    );
    try {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--unknown-flag");
      expect(result.stderr).toContain("--model");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("parse errors use csub: prefix, not claude-plan-wrapper:", () => {
    const tmp = mkdtempSync(join(tmpdir(), "shim-prefix-"));
    const configHome = join(tmp, "config");
    mkdirSync(join(configHome, "claude-sub"), { recursive: true });
    writeFileSync(
      join(configHome, "claude-sub", "state.json"),
      JSON.stringify({ enabled: true, interceptCount: 0, bypassCount: 0 })
    );
    const result = spawnSync(
      "node",
      [shimBin, "-p", "hello", "--unknown-flag"],
      {
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, CLAUDE_USE_SUB: "1", XDG_CONFIG_HOME: configHome },
      }
    );
    try {
      expect(result.stderr).toContain("csub:");
      expect(result.stderr).not.toContain("claude-plan-wrapper:");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("CLAUDE_USE_SUB=1 without -p passes through to real claude", () => {
    const fake = makeFakeClaude("#!/bin/sh\necho real-help\nexit 17\n");
    const shimResult = spawnSync("node", [shimBin, "--help"], {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        CLAUDE_USE_SUB: "1",
        PATH: `${fake.realDir}:${process.env.PATH ?? ""}`,
      },
    });
    const realResult = spawnSync(join(fake.realDir, "claude"), ["--help"], {
      encoding: "utf8",
      timeout: 15000,
    });
    try {
      expect(shimResult.status).toBe(realResult.status);
      expect(shimResult.stdout).toBe(realResult.stdout);
    } finally {
      rmSync(fake.tmp, { recursive: true, force: true });
    }
  });
});

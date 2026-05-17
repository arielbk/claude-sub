import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../state.js", () => ({
  writeState: vi.fn(),
  readState: vi.fn(),
  stateFilePath: vi.fn(),
}));

vi.mock("../doctor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../doctor.js")>();
  return { ...actual, runDoctor: vi.fn() };
});

import { analyzePaths, runDoctor } from "../doctor.js";
import { cmdDoctor, cmdOn } from "../cli.js";
import { writeState } from "../state.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(writeState).mockResolvedValue(undefined);
});

describe("analyzePaths", () => {
  it("shim-first: returns ok when shim is first and real claude exists behind it", () => {
    const shimFirst = (p: string) => p === "/usr/local/bin/claude";
    const result = analyzePaths(
      ["/usr/local/bin/claude", "/usr/bin/claude"],
      shimFirst
    );
    expect(result.ok).toBe(true);
    expect(result.shimPath).toBe("/usr/local/bin/claude");
    expect(result.realClaudePath).toBe("/usr/bin/claude");
  });

  it("real-first: returns not-ok when real claude appears before the shim", () => {
    const shimIsSecond = (p: string) => p === "/usr/local/bin/claude";
    const result = analyzePaths(
      ["/usr/bin/claude", "/usr/local/bin/claude"],
      shimIsSecond
    );
    expect(result.ok).toBe(false);
    expect(result.remediation).toContain("export PATH=");
    expect(result.remediation).toContain("/usr/local/bin");
  });

  it("missing entirely: returns not-ok when no claude paths found", () => {
    const result = analyzePaths([], () => false);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("shim-only: returns not-ok when only the shim is on PATH", () => {
    const alwaysShim = () => true;
    const result = analyzePaths(["/usr/local/bin/claude"], alwaysShim);
    expect(result.ok).toBe(false);
  });

  it("real-only: returns not-ok when only real claude is on PATH", () => {
    const neverShim = () => false;
    const result = analyzePaths(["/usr/bin/claude"], neverShim);
    expect(result.ok).toBe(false);
  });
});

describe("cmdDoctor", () => {
  it("returns exit code 0 when doctor is ok", async () => {
    vi.mocked(runDoctor).mockResolvedValue({
      ok: true,
      shimPath: "/usr/local/bin/claude",
      realClaudePath: "/usr/bin/claude",
      message: "OK — shim is first on PATH",
    });
    const result = await cmdDoctor();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("OK");
  });

  it("returns exit code 1 when doctor fails", async () => {
    vi.mocked(runDoctor).mockResolvedValue({
      ok: false,
      message: "shim is not first on PATH",
      remediation: 'export PATH="/usr/local/bin:$PATH"',
    });
    const result = await cmdDoctor();
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("shim is not first");
    expect(result.output).toContain("export PATH=");
  });
});

describe("cmdOn with doctor", () => {
  it("includes doctor message in cmdOn output", async () => {
    vi.mocked(runDoctor).mockResolvedValue({
      ok: true,
      shimPath: "/usr/local/bin/claude",
      realClaudePath: "/usr/bin/claude",
      message: "OK — shim is first on PATH",
    });
    const result = await cmdOn();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("OK — shim is first on PATH");
  });

  it("includes remediation in cmdOn output when doctor fails", async () => {
    vi.mocked(runDoctor).mockResolvedValue({
      ok: false,
      message: "shim is not first on PATH",
      remediation: 'export PATH="/usr/local/bin:$PATH"',
    });
    const result = await cmdOn();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("export PATH=");
  });
});

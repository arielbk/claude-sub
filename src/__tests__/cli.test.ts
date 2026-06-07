import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../state.js", () => ({
  writeState: vi.fn(),
  readState: vi.fn(),
  stateFilePath: vi.fn(),
}));

vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn(),
  analyzePaths: vi.fn(),
  isShimBinary: vi.fn(),
  getClaudePaths: vi.fn(),
}));

vi.mock("../uninstall.js", () => ({
  uninstall: vi.fn(),
}));

import { writeState, readState, stateFilePath } from "../state.js";
import { runDoctor } from "../doctor.js";
import { uninstall } from "../uninstall.js";
import { cmdOn, cmdOff, cmdStatus, cmdUninstall, cmdVersion } from "../cli.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runDoctor).mockResolvedValue({
    ok: true,
    message: "OK — shim is first on PATH",
  });
  vi.mocked(uninstall).mockResolvedValue({
    exitCode: 0,
    output: "uninstalled",
    removedMarker: true,
    packagePresent: true,
    uninstalledPackage: true,
    plan: {
      shell: "zsh",
      rcFile: "/home/me/.zshrc",
      marker: "# claude-sub setup",
      markerPresent: true,
      diff: "",
    },
  });
});

describe("cmdOn", () => {
  it("writes enabled: true", async () => {
    vi.mocked(writeState).mockResolvedValue(undefined);
    await cmdOn();
    expect(writeState).toHaveBeenCalledWith({ enabled: true });
  });

  it("returns exit code 0", async () => {
    vi.mocked(writeState).mockResolvedValue(undefined);
    const result = await cmdOn();
    expect(result.exitCode).toBe(0);
  });
});

describe("cmdOff", () => {
  it("writes enabled: false", async () => {
    vi.mocked(writeState).mockResolvedValue(undefined);
    await cmdOff();
    expect(writeState).toHaveBeenCalledWith({ enabled: false });
  });

  it("returns exit code 0", async () => {
    vi.mocked(writeState).mockResolvedValue(undefined);
    const result = await cmdOff();
    expect(result.exitCode).toBe(0);
  });
});

describe("cmdStatus", () => {
  it("includes 'on' in output when enabled is true", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: true, interceptCount: 5, bypassCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("on");
    expect(result.exitCode).toBe(0);
  });

  it("includes 'off' in output when enabled is false", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: false, interceptCount: 0, bypassCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("off");
    expect(result.exitCode).toBe(0);
  });

  it("includes state file path in output", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: false, interceptCount: 0, bypassCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/home/user/.config/claude-sub/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("/home/user/.config/claude-sub/state.json");
  });

  it("includes intercept count in output", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: true, interceptCount: 42, bypassCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("42");
  });

  it("returns exit code 0", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: false, interceptCount: 0, bypassCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.exitCode).toBe(0);
  });
});

describe("cmdUninstall", () => {
  it("passes non-interactive options to uninstall", async () => {
    await cmdUninstall({ nonInteractive: true });
    expect(uninstall).toHaveBeenCalledWith({ nonInteractive: true });
  });

  it("returns the uninstall exit code and output", async () => {
    vi.mocked(uninstall).mockResolvedValueOnce({
      exitCode: 0,
      output: "Global claude-sub package uninstalled.",
      removedMarker: false,
      packagePresent: true,
      uninstalledPackage: true,
      plan: {
        shell: "zsh",
        rcFile: "/home/me/.zshrc",
        marker: "# claude-sub setup",
        markerPresent: false,
        diff: "",
      },
    });

    const result = await cmdUninstall();

    expect(result).toEqual({ exitCode: 0, output: "Global claude-sub package uninstalled." });
  });
});

describe("cmdVersion", () => {
  it("reports the package version with exit code 0", async () => {
    const { readFile } = await import("node:fs/promises");
    const pkg = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    );

    const result = await cmdVersion();

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(`csub ${pkg.version}`);
  });
});

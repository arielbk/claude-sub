import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../state.js", () => ({
  writeState: vi.fn(),
  readState: vi.fn(),
  stateFilePath: vi.fn(),
}));

import { writeState, readState, stateFilePath } from "../state.js";
import { cmdOn, cmdOff, cmdStatus } from "../cli.js";

beforeEach(() => {
  vi.resetAllMocks();
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
    vi.mocked(readState).mockResolvedValue({ enabled: true, interceptCount: 5 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("on");
    expect(result.exitCode).toBe(0);
  });

  it("includes 'off' in output when enabled is false", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: false, interceptCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("off");
    expect(result.exitCode).toBe(0);
  });

  it("includes state file path in output", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: false, interceptCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/home/user/.config/claude-sub/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("/home/user/.config/claude-sub/state.json");
  });

  it("includes intercept count in output", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: true, interceptCount: 42 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.output).toContain("42");
  });

  it("returns exit code 0", async () => {
    vi.mocked(readState).mockResolvedValue({ enabled: false, interceptCount: 0 });
    vi.mocked(stateFilePath).mockReturnValue("/tmp/state.json");
    const result = await cmdStatus();
    expect(result.exitCode).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { parseArgs, SUPPORTED_FLAGS_LIST } from "../flag-mapper.js";

describe("parseArgs — prompt extraction", () => {
  it("extracts prompt from -p value form", () => {
    const result = parseArgs(["-p", "hello world"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toBe("hello world");
    expect(result.isPrintMode).toBe(true);
  });

  it("extracts prompt from --print value form", () => {
    const result = parseArgs(["--print", "hello world"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toBe("hello world");
    expect(result.isPrintMode).toBe(true);
  });

  it("extracts prompt from positional argument", () => {
    const result = parseArgs(["hello world"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt).toBe("hello world");
    expect(result.isPrintMode).toBe(false);
  });

  it("errors when no prompt is provided", () => {
    const result = parseArgs([]);
    expect(result.ok).toBe(false);
  });
});

describe("parseArgs — supported flags", () => {
  it("accepts --model with value and forwards it", () => {
    const result = parseArgs(["-p", "hi", "--model", "sonnet"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["--model", "sonnet"]);
  });

  it("accepts -m shorthand for --model", () => {
    const result = parseArgs(["-p", "hi", "-m", "sonnet"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["-m", "sonnet"]);
  });

  it("accepts --verbose and forwards it", () => {
    const result = parseArgs(["-p", "hi", "--verbose"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["--verbose"]);
  });

  it("accepts -v shorthand for --verbose", () => {
    const result = parseArgs(["-p", "hi", "-v"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["-v"]);
  });

  it.each([
    ["--append-system-prompt", "extra"],
    ["--system-prompt", "system"],
    ["--permission-mode", "acceptEdits"],
    ["--settings", "settings.json"],
    ["--agent", "reviewer"],
    ["--agents", "planner,reviewer"],
  ])("accepts %s with value and forwards it", (flag: string, value: string) => {
    const result = parseArgs(["-p", "hi", flag, value]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual([flag, value]);
  });

  it.each([
    "--dangerously-skip-permissions",
    "--strict-mcp-config",
    "--bare",
  ])("accepts %s and forwards it", (flag: string) => {
    const result = parseArgs(["-p", "hi", flag]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual([flag]);
  });

  it("accepts orchestrator non-variadic flags together and forwards them in order", () => {
    const result = parseArgs([
      "-p",
      "hi",
      "--append-system-prompt",
      "extra",
      "--permission-mode",
      "acceptEdits",
      "--bare",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual([
      "--append-system-prompt",
      "extra",
      "--permission-mode",
      "acceptEdits",
      "--bare",
    ]);
  });

  it("accepts variadic --add-dir with one value", () => {
    const result = parseArgs(["-p", "hi", "--add-dir", "src"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["--add-dir", "src"]);
  });

  it("accepts variadic --add-dir with multiple values", () => {
    const result = parseArgs(["-p", "hi", "--add-dir", "src", "docs", "tests"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["--add-dir", "src", "docs", "tests"]);
  });

  it("stops variadic values at the next flag", () => {
    const result = parseArgs([
      "-p",
      "hi",
      "--add-dir",
      "src",
      "docs",
      "--model",
      "sonnet",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual([
      "--add-dir",
      "src",
      "docs",
      "--model",
      "sonnet",
    ]);
  });

  it("accepts variadic values at the end of argv", () => {
    const result = parseArgs(["-p", "hi", "--mcp-config", "a.json", "b.json"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual(["--mcp-config", "a.json", "b.json"]);
  });

  it("accepts repeated --plugin-dir groups", () => {
    const result = parseArgs([
      "-p",
      "hi",
      "--plugin-dir",
      "plugins/a",
      "--plugin-dir",
      "plugins/b",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual([
      "--plugin-dir",
      "plugins/a",
      "--plugin-dir",
      "plugins/b",
    ]);
  });

  it.each([
    ["--add-dir", ["a", "b"]],
    ["--mcp-config", ["x.json", "y.json"]],
    ["--allowedTools", ["Bash(git *)", "Edit"]],
    ["--allowed-tools", ["Bash(git *)", "Edit"]],
    ["--disallowedTools", ["WebFetch", "Read"]],
    ["--disallowed-tools", ["WebFetch", "Read"]],
    ["--tools", ["Bash", "Edit"]],
    ["--plugin-dir", ["plugins/a"]],
  ])("accepts variadic %s and forwards its values", (flag: string, values: string[]) => {
    const result = parseArgs(["-p", "hi", flag, ...values]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passthroughArgs).toEqual([flag, ...values]);
  });

  it("accepts --output-format stream-json and records stream-json mode without forwarding it", () => {
    const result = parseArgs(["-p", "hi", "--output-format", "stream-json"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outputMode).toBe("stream-json");
    expect(result.passthroughArgs).toEqual([]);
  });

  it("accepts --output-format=stream-json and records stream-json mode", () => {
    const result = parseArgs(["-p", "hi", "--output-format=stream-json"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outputMode).toBe("stream-json");
  });

  it("defaults outputMode to plain when --output-format is absent", () => {
    const result = parseArgs(["-p", "hi"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outputMode).toBe("plain");
  });
});

describe("parseArgs — unsupported flags", () => {
  it("rejects --output-format values other than stream-json with error naming the flag", () => {
    const result = parseArgs(["-p", "hi", "--output-format", "json"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--output-format");
  });

  it("error message lists supported flags", () => {
    const result = parseArgs(["-p", "hi", "--output-format", "json"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const expectedSupportedFlags = [
      "--model (-m)",
      "--verbose (-v)",
      "--append-system-prompt",
      "--system-prompt",
      "--permission-mode",
      "--dangerously-skip-permissions",
      "--settings",
      "--agent",
      "--agents",
      "--strict-mcp-config",
      "--bare",
      "--add-dir",
      "--mcp-config",
      "--allowedTools/--allowed-tools",
      "--disallowedTools/--disallowed-tools",
      "--tools",
      "--plugin-dir",
      "--output-format stream-json",
    ];

    expect(SUPPORTED_FLAGS_LIST).toEqual(expectedSupportedFlags);
    for (const flag of expectedSupportedFlags) {
      expect(result.error).toContain(flag);
    }
  });

  it("rejects --resume with error naming the flag", () => {
    const result = parseArgs(["-p", "hi", "--resume"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--resume");
  });

  it("rejects unknown flags starting with --", () => {
    const result = parseArgs(["-p", "hi", "--unknown-flag"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--unknown-flag");
  });
});

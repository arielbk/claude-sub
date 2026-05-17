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
});

describe("parseArgs — unsupported flags", () => {
  it("rejects --output-format with error naming the flag", () => {
    const result = parseArgs(["-p", "hi", "--output-format", "json"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--output-format");
  });

  it("error message lists supported flags", () => {
    const result = parseArgs(["-p", "hi", "--output-format", "json"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const flag of SUPPORTED_FLAGS_LIST) {
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

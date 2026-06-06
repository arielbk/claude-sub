import { describe, expect, it } from "vitest";
import { detectFailOpen } from "../fail-open-detector.js";

describe("detectFailOpen", () => {
  it.each([
    "--input-format",
    "--include-partial-messages",
    "--include-hook-events",
    "--replay-user-messages",
    "--json-schema",
    "--resume",
    "-r",
    "--continue",
    "-c",
    "--session-id",
    "--fork-session",
    "--from-pr",
    "--no-session-persistence",
    "--max-budget-usd",
  ])("detects %s as a fail-open flag", (flag: string) => {
    expect(detectFailOpen(["-p", "hi", flag, "value"])).toEqual({
      bypass: true,
      reason: flag,
    });
  });

  it("does not bypass --output-format stream-json", () => {
    expect(detectFailOpen(["-p", "hi", "--output-format", "stream-json"])).toEqual({
      bypass: false,
    });
  });

  it("still bypasses other --output-format values", () => {
    expect(detectFailOpen(["-p", "hi", "--output-format", "json"])).toEqual({
      bypass: true,
      reason: "--output-format",
    });
  });

  it("returns false for allowlisted flags", () => {
    expect(
      detectFailOpen([
        "-p",
        "hi",
        "--model",
        "sonnet",
        "--verbose",
        "--add-dir",
        "src",
        "--allowedTools",
        "Edit",
      ])
    ).toEqual({ bypass: false });
  });

  it("returns false for unknown flags", () => {
    expect(detectFailOpen(["-p", "hi", "--unknown-flag"])).toEqual({
      bypass: false,
    });
  });

  it("detects --flag=value forms", () => {
    expect(detectFailOpen(["-p", "hi", "--input-format=stream-json"])).toEqual({
      bypass: true,
      reason: "--input-format",
    });
  });
});

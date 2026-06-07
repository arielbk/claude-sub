import { describe, it, expect } from "vitest";
import { homedir } from "node:os";
import { transcriptPathFor } from "../pty-runner.js";

describe("transcriptPathFor", () => {
  it("defaults to ~/.claude when CLAUDE_CONFIG_DIR is unset", () => {
    expect(transcriptPathFor("/Users/me/Projects/app", "abc-123", {})).toBe(
      `${homedir()}/.claude/projects/-Users-me-Projects-app/abc-123.jsonl`
    );
  });

  it("respects CLAUDE_CONFIG_DIR when set", () => {
    const env = { CLAUDE_CONFIG_DIR: "/Users/me/.claude-custom" };
    expect(transcriptPathFor("/Users/me/Projects/app", "abc-123", env)).toBe(
      "/Users/me/.claude-custom/projects/-Users-me-Projects-app/abc-123.jsonl"
    );
  });

  it("reads process.env by default", () => {
    expect(transcriptPathFor("/tmp/x", "id")).toContain(
      process.env.CLAUDE_CONFIG_DIR ?? `${homedir()}/.claude`
    );
  });
});

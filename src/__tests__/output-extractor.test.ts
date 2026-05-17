import { describe, it, expect } from "vitest";
import { extractReply, stripAnsi, SENTINEL } from "../output-extractor.js";

describe("stripAnsi", () => {
  it("passes plain text through unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("strips SGR color sequences", () => {
    expect(stripAnsi("\x1b[32mOK\x1b[0m")).toBe("OK");
  });

  it("strips cursor movement sequences", () => {
    expect(stripAnsi("\x1b[2J\x1b[H")).toBe("");
  });

  it("converts \\r\\n to \\n", () => {
    expect(stripAnsi("foo\r\nbar")).toBe("foo\nbar");
  });

  it("converts standalone \\r to \\n", () => {
    expect(stripAnsi("foo\rbar")).toBe("foo\nbar");
  });
});

describe("extractReply", () => {
  it("extracts clean reply with sentinel at end", () => {
    const raw = `OK\n${SENTINEL}\n`;
    const result = extractReply(raw);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("OK");
  });

  it("handles sentinel split across read chunks (accumulated buffer)", () => {
    // Sentinel arrives in two parts; caller concatenates before calling extractReply
    const half = Math.floor(SENTINEL.length / 2);
    const chunk1 = `The answer is yes\n${SENTINEL.slice(0, half)}`;
    const chunk2 = `${SENTINEL.slice(half)}\n`;
    const result = extractReply(chunk1 + chunk2);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("The answer is yes");
  });

  it("strips ANSI escape sequences interleaved with content", () => {
    const raw = `\x1b[32mOK\x1b[0m\n${SENTINEL}\n`;
    const result = extractReply(raw);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("OK");
  });

  it("strips trailing whitespace from the reply", () => {
    const raw = `OK   \n\n${SENTINEL}\n`;
    const result = extractReply(raw);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("OK");
  });

  it("does not match a sentinel prefix substring as the sentinel", () => {
    // Content contains beginning of sentinel token but not the full token
    const prefix = SENTINEL.slice(0, SENTINEL.length - 5);
    const raw = `${prefix}\nsome more content\n`;
    const result = extractReply(raw);
    expect(result.found).toBe(false);
  });

  it("returns found:false with clean content when no sentinel present", () => {
    const raw = `\x1b[32mhello\x1b[0m world\n`;
    const result = extractReply(raw);
    expect(result.found).toBe(false);
    expect(result.reply).toBe("hello world");
  });

  it("handles multi-line reply before sentinel", () => {
    const raw = `line one\nline two\nline three\n${SENTINEL}\n`;
    const result = extractReply(raw);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("line one\nline two\nline three");
  });
});

import { describe, it, expect } from "vitest";
import {
  extractReply,
  extractReplyFromTranscript,
  stripAnsi,
  SENTINEL,
} from "../output-extractor.js";

/** Build a JSONL transcript line for an assistant turn with block content. */
function assistantLine(text: string): string {
  return JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
  });
}

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

  it("strips kitty-keyboard and DEC private sequences (observed leaking from Claude Code v2.1.168)", () => {
    expect(stripAnsi("\x1b7\x1b8\x1b[<u\x1b[>1u\x1b[>4;2m\x1b[>0qOK")).toBe("OK");
  });

  it("strips bracketed-paste markers", () => {
    expect(stripAnsi("\x1b[200~pasted\x1b[201~")).toBe("pasted");
  });

  it("strips colon-parameterised SGR (true-color) sequences", () => {
    expect(stripAnsi("\x1b[38:2:255:0:0mred\x1b[0m")).toBe("red");
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

describe("extractReplyFromTranscript", () => {
  const userLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: "What is 2 plus 2?" },
  });

  it("extracts clean reply from the assistant turn carrying the sentinel", () => {
    const jsonl = [userLine, assistantLine(`2 plus 2 equals 4.\n\n${SENTINEL}`)].join("\n");
    const result = extractReplyFromTranscript(jsonl);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("2 plus 2 equals 4.");
  });

  it("preserves the sentinel's double-underscores (transcript stores raw text)", () => {
    // The terminal buffer renders __...__ as markdown bold and drops the
    // underscores; the transcript does not, so matching works here.
    const jsonl = assistantLine(`Paris.\n${SENTINEL}`);
    expect(extractReplyFromTranscript(jsonl).reply).toBe("Paris.");
  });

  it("takes the last assistant turn with the sentinel, ignoring earlier turns", () => {
    const jsonl = [
      assistantLine("Let me check that for you."),
      JSON.stringify({ type: "user", message: { role: "user", content: "[tool result]" } }),
      assistantLine(`The final answer is 42.\n${SENTINEL}`),
    ].join("\n");
    const result = extractReplyFromTranscript(jsonl);
    expect(result.found).toBe(true);
    expect(result.reply).toBe("The final answer is 42.");
  });

  it("handles string content (not just block arrays)", () => {
    const jsonl = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: `Hello there.\n${SENTINEL}` },
    });
    expect(extractReplyFromTranscript(jsonl).reply).toBe("Hello there.");
  });

  it("skips partial/unparseable trailing lines while streaming", () => {
    const jsonl = [assistantLine(`Done.\n${SENTINEL}`), '{"type":"assist'].join("\n");
    expect(extractReplyFromTranscript(jsonl).found).toBe(true);
    expect(extractReplyFromTranscript(jsonl).reply).toBe("Done.");
  });

  it("falls back to the last assistant text when no sentinel is present", () => {
    const jsonl = [userLine, assistantLine("Partial answer so far")].join("\n");
    const result = extractReplyFromTranscript(jsonl);
    expect(result.found).toBe(false);
    expect(result.reply).toBe("Partial answer so far");
  });

  it("returns an empty result when there are no assistant turns yet", () => {
    const jsonl = [
      JSON.stringify({ type: "mode" }),
      userLine,
      JSON.stringify({ type: "attachment" }),
    ].join("\n");
    const result = extractReplyFromTranscript(jsonl);
    expect(result.found).toBe(false);
    expect(result.reply).toBe("");
  });

  it("ignores non-text content blocks (e.g. tool_use) when joining", () => {
    const jsonl = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "x", name: "Read", input: {} },
          { type: "text", text: `Answer.\n${SENTINEL}` },
        ],
      },
    });
    expect(extractReplyFromTranscript(jsonl).reply).toBe("Answer.");
  });
});

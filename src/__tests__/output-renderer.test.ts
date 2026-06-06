import { describe, expect, it } from "vitest";
import { createOutputRenderer } from "../output-renderer.js";

function capture() {
  const chunks: string[] = [];
  return { write: (c: string) => chunks.push(c), chunks };
}

describe("createOutputRenderer — plain", () => {
  it("emits nothing on activity", () => {
    const { write, chunks } = capture();
    createOutputRenderer("plain", write).onActivity();
    expect(chunks).toEqual([]);
  });

  it("writes one reply line on finish", () => {
    const { write, chunks } = capture();
    createOutputRenderer("plain", write).finish("the answer");
    expect(chunks).toEqual(["the answer\n"]);
  });
});

describe("createOutputRenderer — stream-json", () => {
  it("writes a heartbeat event on activity", () => {
    const { write, chunks } = capture();
    createOutputRenderer("stream-json", write).onActivity();
    expect(chunks).toEqual([`${JSON.stringify({ type: "heartbeat" })}\n`]);
  });

  it("writes assistant and result events on finish", () => {
    const { write, chunks } = capture();
    createOutputRenderer("stream-json", write).finish("the answer");
    expect(chunks).toHaveLength(1);
    const lines = chunks[0].trimEnd().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { type: "assistant", message: { content: [{ type: "text", text: "the answer" }] } },
      { type: "result", result: "the answer" },
    ]);
  });
});

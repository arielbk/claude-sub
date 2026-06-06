import { describe, expect, it } from "vitest";
import { emitStreamJsonHeartbeat, emitStreamJsonResult } from "../stream-json-emitter.js";

function parseNdjson(output: string): unknown[] {
  return output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

describe("emitStreamJsonResult", () => {
  it("emits assistant text and final result events recoverable by ralph jq filters", () => {
    const events = parseNdjson(emitStreamJsonResult("OK"));

    expect(events).toEqual([
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "OK" }],
        },
      },
      {
        type: "result",
        result: "OK",
      },
    ]);
  });
});

describe("emitStreamJsonHeartbeat", () => {
  it("emits a parseable heartbeat event", () => {
    expect(JSON.parse(emitStreamJsonHeartbeat())).toEqual({ type: "heartbeat" });
  });
});

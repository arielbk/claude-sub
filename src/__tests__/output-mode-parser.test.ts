import { describe, expect, it } from "vitest";
import { parseOutputMode, resolvedOutputMode } from "../output-mode-parser.js";

describe("parseOutputMode", () => {
  it("returns absent when --output-format is not present", () => {
    expect(parseOutputMode(["-p", "hi"])).toEqual({ kind: "absent" });
  });

  it("returns stream-json for the space form", () => {
    expect(parseOutputMode(["-p", "hi", "--output-format", "stream-json"])).toEqual({
      kind: "stream-json",
    });
  });

  it("returns stream-json for the = form", () => {
    expect(parseOutputMode(["-p", "hi", "--output-format=stream-json"])).toEqual({
      kind: "stream-json",
    });
  });

  it("returns unsupported (carrying the value) for any other value", () => {
    expect(parseOutputMode(["-p", "hi", "--output-format", "json"])).toEqual({
      kind: "unsupported",
      value: "json",
    });
    expect(parseOutputMode(["-p", "hi", "--output-format=text"])).toEqual({
      kind: "unsupported",
      value: "text",
    });
  });

  it("returns missing-value when the flag has no value", () => {
    expect(parseOutputMode(["-p", "hi", "--output-format"])).toEqual({
      kind: "missing-value",
    });
  });
});

describe("resolvedOutputMode", () => {
  it("maps stream-json to stream-json and everything else to plain", () => {
    expect(resolvedOutputMode({ kind: "stream-json" })).toBe("stream-json");
    expect(resolvedOutputMode({ kind: "absent" })).toBe("plain");
    expect(resolvedOutputMode({ kind: "unsupported", value: "json" })).toBe("plain");
    expect(resolvedOutputMode({ kind: "missing-value" })).toBe("plain");
  });
});

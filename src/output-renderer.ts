/**
 * Stdout renderer seam for a PTY run's lifecycle. Chosen once from the resolved
 * output mode, it owns the two render shapes the shim used to branch on inline:
 * an activity hook (called on each heartbeat tick) and a finish hook (called
 * once with the final reply). Writes through an injected `write` so the shapes
 * are unit-testable without a real stdout. The stream-json adapter delegates
 * JSON shape to the existing emitter.
 */
import type { OutputMode } from "./output-mode-parser.js";
import { emitStreamJsonHeartbeat, emitStreamJsonResult } from "./stream-json-emitter.js";

export interface OutputRenderer {
  onActivity(): void;
  finish(reply: string): void;
}

export function createOutputRenderer(
  mode: OutputMode,
  write: (chunk: string) => void
): OutputRenderer {
  if (mode === "stream-json") {
    return {
      onActivity: () => write(emitStreamJsonHeartbeat()),
      finish: (reply) => write(emitStreamJsonResult(reply)),
    };
  }
  if (mode === "json") {
    return {
      onActivity: () => {},
      finish: (reply) => write(JSON.stringify({ type: "result", result: reply })),
    };
  }
  return {
    onActivity: () => {},
    finish: (reply) => write(`${reply}\n`),
  };
}

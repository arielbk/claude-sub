import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveRealClaude } from "./real-claude-resolver.js";
import {
  SENTINEL_SYSTEM_PROMPT,
  extractReply,
  extractReplyFromTranscript,
} from "./output-extractor.js";

export interface IMinimalPty {
  onData(cb: (data: string) => void): unknown;
  onExit(cb: (e: { exitCode: number | undefined }) => void): unknown;
  write(data: string): void;
  kill(signal?: string): void;
}

export type PtySpawner = (
  cmd: string,
  args: string[],
  opts: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> }
) => IMinimalPty;

export type PtyRunFailReason = "overall" | "idle" | "no-reply";

export type PtyRunResult =
  | { ok: true; rawOutput: string; reply: string; exitCode: number }
  | { ok: false; reason: PtyRunFailReason; elapsedMs: number; rawOutput: string };

export interface PtyRunOptions {
  /** Delay before sending the prompt, to let the TUI initialize. Default 2000ms. */
  initialDelayMs?: number;
  /**
   * Delay between writing the prompt and writing the submitting Enter.
   * A single prompt+CR chunk trips the TUI's paste detection: the CR is taken
   * as pasted content and the turn never submits. Default 300ms.
   */
  submitDelayMs?: number;
  /** How long to wait with no new output before considering the response done. Default 5000ms. */
  settleMs?: number;
  /** Hard timeout for the whole interaction. Default 300000ms (5 min). Exit code 124 on expiry. */
  maxMs?: number;
  /** Idle timeout: max ms of no output after session established. Default 30000ms. Exit code 124. */
  idleTimeoutMs?: number;
  /** Minimum interval between activity notifications. Default 10000ms. */
  heartbeatIntervalMs?: number;
  /** Called when PTY output has been active during a heartbeat interval. */
  onActivity?: () => void;
  /** Inject a custom PTY spawner (used in tests to avoid spawning real processes). */
  spawner?: PtySpawner;
  /** Session id to pin (so we know the transcript path). Default: a random UUID. */
  sessionId?: string;
  /** Override the resolved transcript path (used in tests). */
  transcriptPath?: string;
  /** Read the session transcript, or return null if not yet available (used in tests). */
  readTranscript?: () => string | null;
  /** How often to poll the transcript for the completed reply. Default 250ms. */
  pollIntervalMs?: number;
}

/**
 * Claude Code stores transcripts at <config-dir>/projects/<slug>/<session-id>.jsonl,
 * where the config dir is $CLAUDE_CONFIG_DIR when set, ~/.claude otherwise.
 */
export function transcriptPathFor(
  cwd: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const configDir = env.CLAUDE_CONFIG_DIR || `${homedir()}/.claude`;
  const slug = cwd.replace(/[/.]/g, "-");
  return `${configDir}/projects/${slug}/${sessionId}.jsonl`;
}

export async function runUnderPty(
  prompt: string,
  passthroughArgs: string[],
  opts?: PtyRunOptions
): Promise<PtyRunResult> {
  const {
    initialDelayMs = 2000,
    submitDelayMs = 300,
    settleMs = 5000,
    maxMs = 300000,
    idleTimeoutMs = 30000,
    heartbeatIntervalMs = 10000,
    onActivity,
    spawner,
    sessionId = randomUUID(),
    pollIntervalMs = 250,
  } = opts ?? {};

  // Lazy-load so passthrough invocations never touch the native module.
  const pty = spawner === undefined ? await import("node-pty") : null;
  const defaultSpawner: PtySpawner = (cmd, args, opts) =>
    pty!.spawn(cmd, args, opts) as unknown as IMinimalPty;
  const actualSpawner = spawner ?? defaultSpawner;
  const startTime = Date.now();
  const cmd = spawner !== undefined ? "" : resolveRealClaude();

  const transcriptPath = opts?.transcriptPath ?? transcriptPathFor(process.cwd(), sessionId);
  const readTranscript =
    opts?.readTranscript ??
    (() => (existsSync(transcriptPath) ? readFileSync(transcriptPath, "utf8") : null));

  return new Promise((resolve) => {
    let rawOutput = "";
    let done = false;
    let promptSent = false;
    let bytesSinceHeartbeat = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let submitTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // We drive the interactive TUI only to *run* the turn; the reply is read
    // from the session transcript, which stores clean model text. The terminal
    // buffer is kept solely for timeout diagnostics and as a degraded fallback.
    const spawnArgs = [
      "--session-id",
      sessionId,
      "--append-system-prompt",
      SENTINEL_SYSTEM_PROMPT,
      ...passthroughArgs,
    ];

    const ptyProcess = actualSpawner(cmd, spawnArgs, {
      name: "xterm-256color",
      cols: 200,
      rows: 50,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    const cleanup = () => {
      if (settleTimer) clearTimeout(settleTimer);
      if (submitTimer) clearTimeout(submitTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (maxTimer) clearTimeout(maxTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pollTimer) clearInterval(pollTimer);
    };

    /**
     * Reply resolution: transcript first, then the sentinel-delimited raw
     * buffer. A sentinel-less raw buffer is NOT a reply — it is the TUI screen
     * dump of a turn that never completed (or never submitted), and returning
     * it would silently hand the caller garbage with exit 0.
     */
    const resolveReply = (): { reply: string; trusted: boolean } => {
      const jsonl = readTranscript();
      if (jsonl !== null) {
        const fromTranscript = extractReplyFromTranscript(jsonl);
        if (fromTranscript.reply) return { reply: fromTranscript.reply, trusted: true };
      }
      const fromRaw = extractReply(rawOutput);
      return { reply: fromRaw.reply, trusted: fromRaw.found };
    };

    const finishOk = (exitCode: number) => {
      if (done) return;
      done = true;
      cleanup();
      const { reply, trusted } = resolveReply();
      if (!trusted) {
        resolve({ ok: false, reason: "no-reply", elapsedMs: Date.now() - startTime, rawOutput });
        return;
      }
      resolve({ ok: true, rawOutput, reply, exitCode });
    };

    const finishFail = (reason: PtyRunFailReason) => {
      if (done) return;
      done = true;
      cleanup();
      const elapsedMs = Date.now() - startTime;
      try { ptyProcess.kill(); } catch {}
      resolve({ ok: false, reason, elapsedMs, rawOutput });
    };

    const terminate = (exitCode: number) => {
      if (done) return;
      done = true;
      cleanup();
      const { reply, trusted } = resolveReply();
      try { ptyProcess.write("\x03"); } catch {}
      setTimeout(() => {
        try { ptyProcess.kill(); } catch {}
        if (!trusted) {
          resolve({ ok: false, reason: "no-reply", elapsedMs: Date.now() - startTime, rawOutput });
          return;
        }
        resolve({ ok: true, rawOutput, reply, exitCode });
      }, 500);
    };

    const resetSettle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => terminate(0), settleMs);
    };

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => finishFail("idle"), idleTimeoutMs);
    };

    maxTimer = setTimeout(() => finishFail("overall"), maxMs);
    heartbeatTimer = setInterval(() => {
      if (!bytesSinceHeartbeat || done) return;
      bytesSinceHeartbeat = false;
      try { onActivity?.(); } catch {}
    }, heartbeatIntervalMs);

    ptyProcess.onData((data: string) => {
      rawOutput += data;
      if (promptSent && !done) {
        bytesSinceHeartbeat = true;
        resetSettle();
        resetIdle();
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      finishOk(exitCode ?? 0);
    });

    setTimeout(() => {
      if (done) return;
      promptSent = true;
      // 2.1.x's Ink input submits on carriage return (Enter), not line feed —
      // and the CR must be a separate write: a multi-char chunk is treated as
      // a paste, so a trailing CR inside it becomes pasted content and the
      // turn never submits.
      ptyProcess.write(prompt);
      submitTimer = setTimeout(() => {
        if (done) return;
        try { ptyProcess.write("\r"); } catch {}
      }, submitDelayMs);
      resetSettle();
      resetIdle();
      // The transcript records the final reply (with the sentinel) once the turn
      // completes — poll for it as the primary completion signal.
      pollTimer = setInterval(() => {
        if (done) return;
        const jsonl = readTranscript();
        if (jsonl === null) return;
        if (extractReplyFromTranscript(jsonl).found) terminate(0);
      }, pollIntervalMs);
    }, initialDelayMs);
  });
}

import { resolveRealClaude } from "./real-claude-resolver.js";
import { SENTINEL, SENTINEL_SYSTEM_PROMPT, extractReply } from "./output-extractor.js";

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

export type PtyRunResult =
  | { ok: true; rawOutput: string; reply: string; exitCode: number }
  | { ok: false; reason: "overall" | "idle"; elapsedMs: number; rawOutput: string };

export interface PtyRunOptions {
  /** Delay before sending the prompt, to let the TUI initialize. Default 2000ms. */
  initialDelayMs?: number;
  /** How long to wait with no new output before considering the response done. Default 5000ms. */
  settleMs?: number;
  /** Hard timeout for the whole interaction. Default 300000ms (5 min). Exit code 124 on expiry. */
  maxMs?: number;
  /** Idle timeout: max ms of no output after session established. Default 30000ms. Exit code 124. */
  idleTimeoutMs?: number;
  /** Inject a custom PTY spawner (used in tests to avoid spawning real processes). */
  spawner?: PtySpawner;
}

export async function runUnderPty(
  prompt: string,
  passthroughArgs: string[],
  opts?: PtyRunOptions
): Promise<PtyRunResult> {
  const {
    initialDelayMs = 2000,
    settleMs = 5000,
    maxMs = 300000,
    idleTimeoutMs = 30000,
    spawner,
  } = opts ?? {};

  // Lazy-load so passthrough invocations never touch the native module.
  const pty = spawner === undefined ? await import("node-pty") : null;
  const defaultSpawner: PtySpawner = (cmd, args, opts) =>
    pty!.spawn(cmd, args, opts) as unknown as IMinimalPty;
  const actualSpawner = spawner ?? defaultSpawner;
  const startTime = Date.now();
  const cmd = spawner !== undefined ? "" : resolveRealClaude();

  return new Promise((resolve) => {
    let rawOutput = "";
    let done = false;
    let promptSent = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const spawnArgs = [
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
      if (idleTimer) clearTimeout(idleTimer);
      if (maxTimer) clearTimeout(maxTimer);
    };

    const finishOk = (exitCode: number) => {
      if (done) return;
      done = true;
      cleanup();
      const { reply } = extractReply(rawOutput);
      resolve({ ok: true, rawOutput, reply, exitCode });
    };

    const finishFail = (reason: "overall" | "idle") => {
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
      try { ptyProcess.write("\x03"); } catch {}
      setTimeout(() => {
        try { ptyProcess.kill(); } catch {}
        const { reply } = extractReply(rawOutput);
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

    ptyProcess.onData((data: string) => {
      rawOutput += data;
      if (promptSent && !done) {
        resetSettle();
        resetIdle();
        if (rawOutput.includes(SENTINEL)) {
          terminate(0);
        }
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      finishOk(exitCode ?? 0);
    });

    setTimeout(() => {
      if (done) return;
      promptSent = true;
      ptyProcess.write(prompt + "\n");
      resetSettle();
      resetIdle();
    }, initialDelayMs);
  });
}

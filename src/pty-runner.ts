import * as pty from "node-pty";
import { resolveRealClaude } from "./real-claude-resolver.js";

export interface PtyRunResult {
  rawOutput: string;
  exitCode: number;
}

export interface PtyRunOptions {
  /** Delay before sending the prompt, to let the TUI initialize. Default 2000ms. */
  initialDelayMs?: number;
  /** How long to wait with no new output before considering the response done. Default 5000ms. */
  settleMs?: number;
  /** Hard timeout for the whole interaction. Default 120000ms. */
  maxMs?: number;
}

/**
 * Spawns the real `claude` binary under a PTY, sends `prompt` as keystrokes,
 * waits for the output to settle, then terminates the session and returns the
 * raw PTY byte stream (ANSI escapes and all).
 */
export async function runUnderPty(
  prompt: string,
  passthroughArgs: string[],
  opts?: PtyRunOptions
): Promise<PtyRunResult> {
  const {
    initialDelayMs = 2000,
    settleMs = 5000,
    maxMs = 120000,
  } = opts ?? {};

  const realClaude = resolveRealClaude();

  return new Promise((resolve, reject) => {
    let rawOutput = "";
    let done = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const ptyProcess = pty.spawn(realClaude, passthroughArgs, {
      name: "xterm-256color",
      cols: 200,
      rows: 50,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    const finish = (exitCode: number) => {
      if (done) return;
      done = true;
      if (settleTimer) clearTimeout(settleTimer);
      if (maxTimer) clearTimeout(maxTimer);
      resolve({ rawOutput, exitCode });
    };

    const terminate = () => {
      // Try to exit gracefully, then force kill
      try {
        ptyProcess.write("\x03"); // Ctrl-C
      } catch {}
      setTimeout(() => {
        try {
          ptyProcess.kill();
        } catch {}
        finish(0);
      }, 1000);
    };

    const resetSettle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(terminate, settleMs);
    };

    maxTimer = setTimeout(() => {
      if (!done) {
        try {
          ptyProcess.kill();
        } catch {}
        reject(new Error(`PTY invocation timed out after ${maxMs}ms`));
      }
    }, maxMs);

    ptyProcess.onData((data: string) => {
      rawOutput += data;
      // Only run settle logic after prompt has been sent
      if (settleTimer !== null) {
        resetSettle();
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      finish(exitCode ?? 0);
    });

    // Wait for TUI to initialize, then send the prompt
    setTimeout(() => {
      if (done) return;
      ptyProcess.write(prompt + "\n");
      resetSettle(); // start watching for output to settle
    }, initialDelayMs);
  });
}

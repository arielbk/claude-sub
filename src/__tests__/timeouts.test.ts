import { describe, it, expect } from "vitest";
import { runUnderPty, IMinimalPty, PtySpawner } from "../pty-runner.js";
import { formatDiagnostic } from "../diagnostic-formatter.js";
import { SENTINEL } from "../output-extractor.js";

class FakePty implements IMinimalPty {
  private dataCbs: ((data: string) => void)[] = [];
  private exitCbs: ((e: { exitCode: number | undefined }) => void)[] = [];

  onData(cb: (data: string) => void) {
    this.dataCbs.push(cb);
    return {};
  }

  onExit(cb: (e: { exitCode: number | undefined }) => void) {
    this.exitCbs.push(cb);
    return {};
  }

  write(_data: string) {}
  kill(_signal?: string) {}

  emit(data: string) {
    this.dataCbs.forEach((cb) => cb(data));
  }

  exit(code?: number) {
    this.exitCbs.forEach((cb) => cb({ exitCode: code }));
  }
}

function makeSpawner(fake: FakePty): PtySpawner {
  return () => fake;
}

describe("runUnderPty — transcript-driven happy path", () => {
  it(
    "resolves with the clean reply once the transcript carries the sentinel",
    async () => {
      const fake = new FakePty();
      let transcript: string | null = null;
      const p = runUnderPty("what is 2 plus 2?", [], {
        initialDelayMs: 0,
        settleMs: 30000,
        idleTimeoutMs: 30000,
        maxMs: 30000,
        pollIntervalMs: 10,
        spawner: makeSpawner(fake),
        readTranscript: () => transcript,
      });
      // Terminal emits chrome (which must NOT leak into the reply).
      fake.emit("\x1b[2J╭── Claude Code v2.1.167 ──╮ welcome");
      // Then the transcript gains the completed assistant turn.
      setTimeout(() => {
        transcript = JSON.stringify({
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: `4.\n${SENTINEL}` }] },
        });
      }, 30);
      const result = await p;
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reply).toBe("4.");
        expect(result.reply).not.toContain("Claude Code");
        expect(result.reply).not.toContain(SENTINEL);
      }
    },
    2000
  );

  it(
    "pins the provided session id into the spawn args as --session-id",
    async () => {
      const fake = new FakePty();
      let captured: string[] = [];
      const spawner: PtySpawner = (_cmd, args) => {
        captured = args;
        return fake;
      };
      const p = runUnderPty("hi", [], {
        initialDelayMs: 0,
        maxMs: 60,
        idleTimeoutMs: 30000,
        settleMs: 30000,
        spawner,
        sessionId: "fixed-session-123",
        readTranscript: () => null,
      });
      await p;
      expect(captured).toContain("--session-id");
      expect(captured[captured.indexOf("--session-id") + 1]).toBe("fixed-session-123");
    },
    2000
  );

  it(
    "submits the prompt followed by a carriage return (Enter), not a line feed",
    async () => {
      const fake = new FakePty();
      const writes: string[] = [];
      const origWrite = fake.write.bind(fake);
      fake.write = (d: string) => {
        writes.push(d);
        origWrite(d);
      };
      const p = runUnderPty("hello world", [], {
        initialDelayMs: 0,
        maxMs: 80,
        idleTimeoutMs: 30000,
        settleMs: 30000,
        spawner: makeSpawner(fake),
        readTranscript: () => null,
      });
      await p;
      expect(writes).toContain("hello world\r");
      expect(writes).not.toContain("hello world\n");
    },
    2000
  );
});

describe("runUnderPty — overall timeout", () => {
  it(
    "resolves ok:false reason:'overall' when sentinel never arrives within maxMs",
    async () => {
      const fake = new FakePty();
      const result = await runUnderPty("hello", [], {
        initialDelayMs: 0,
        maxMs: 100,
        idleTimeoutMs: 30000,
        settleMs: 30000,
        spawner: makeSpawner(fake),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("overall");
        expect(result.elapsedMs).toBeGreaterThanOrEqual(90);
      }
    },
    2000
  );

  it(
    "includes pre-timeout rawOutput in the failure result",
    async () => {
      const fake = new FakePty();
      const p = runUnderPty("hello", [], {
        initialDelayMs: 0,
        maxMs: 150,
        idleTimeoutMs: 30000,
        settleMs: 30000,
        spawner: makeSpawner(fake),
      });
      fake.emit("partial output before timeout");
      const result = await p;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("overall");
        expect(result.rawOutput).toContain("partial output before timeout");
      }
    },
    2000
  );
});

describe("runUnderPty — idle timeout", () => {
  it(
    "resolves ok:false reason:'idle' when no bytes arrive within idleTimeoutMs after session start",
    async () => {
      const fake = new FakePty();
      const result = await runUnderPty("hello", [], {
        initialDelayMs: 0,
        idleTimeoutMs: 80,
        maxMs: 30000,
        settleMs: 30000,
        spawner: makeSpawner(fake),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("idle");
        expect(result.elapsedMs).toBeGreaterThanOrEqual(70);
      }
    },
    2000
  );

  it(
    "captures rawOutput emitted before the idle timer was started",
    async () => {
      const fake = new FakePty();
      const p = runUnderPty("hello", [], {
        initialDelayMs: 0,
        idleTimeoutMs: 80,
        maxMs: 30000,
        settleMs: 30000,
        spawner: makeSpawner(fake),
      });
      fake.emit("some partial response");
      const result = await p;
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("idle");
        expect(result.rawOutput).toContain("some partial response");
      }
    },
    2000
  );

  it(
    "idle fires before overall when idleTimeoutMs < maxMs",
    async () => {
      const fake = new FakePty();
      const result = await runUnderPty("hello", [], {
        initialDelayMs: 0,
        idleTimeoutMs: 80,
        maxMs: 10000,
        settleMs: 30000,
        spawner: makeSpawner(fake),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("idle");
      }
    },
    2000
  );

  it(
    "overall fires before idle when maxMs < idleTimeoutMs",
    async () => {
      const fake = new FakePty();
      const result = await runUnderPty("hello", [], {
        initialDelayMs: 0,
        idleTimeoutMs: 10000,
        maxMs: 80,
        settleMs: 30000,
        spawner: makeSpawner(fake),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("overall");
      }
    },
    2000
  );
});

describe("formatDiagnostic", () => {
  it("includes reason, elapsed time, raw bytes section, and ANSI-stripped section", () => {
    const diag = formatDiagnostic("overall", 1234, "raw\x1b[32mbytes\x1b[0m");
    expect(diag).toContain("overall");
    expect(diag).toContain("1234ms");
    expect(diag).toContain("elapsed:");
    expect(diag).toContain("raw\x1b[32mbytes\x1b[0m");
    expect(diag).toContain("rawbytes");
    expect(diag).toContain("raw PTY");
    expect(diag).toContain("ANSI-stripped");
  });

  it("labels idle reason correctly", () => {
    const diag = formatDiagnostic("idle", 5000, "");
    expect(diag).toContain("idle");
    expect(diag).toContain("5000ms");
  });

  it("truncates rawOutput to last 4KB in the raw section", () => {
    // Use 'z' — doesn't appear in the section headers
    const big = "z".repeat(8192);
    const diag = formatDiagnostic("overall", 1000, big);
    const rawSectionStart = diag.indexOf("--- raw PTY");
    const rawSectionEnd = diag.indexOf("--- ANSI-stripped");
    const rawSection = diag.slice(rawSectionStart, rawSectionEnd);
    // Exactly 4096 'z' chars in the raw section (last 4KB of 8KB input)
    expect(rawSection.split("z").length - 1).toBe(4096);
  });

  it("ANSI-stripped section shows cleaned content", () => {
    const diag = formatDiagnostic("overall", 100, "hello\x1b[0mworld");
    const strippedStart = diag.indexOf("--- ANSI-stripped");
    const strippedSection = diag.slice(strippedStart);
    expect(strippedSection).toContain("helloworld");
    expect(strippedSection).not.toContain("\x1b[0m");
  });
});

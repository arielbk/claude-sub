import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readState, writeState, stateFilePath } from "../state.js";

let tmpConfigHome: string;

beforeEach(() => {
  tmpConfigHome = join(tmpdir(), `state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  process.env.XDG_CONFIG_HOME = tmpConfigHome;
});

afterEach(() => {
  delete process.env.XDG_CONFIG_HOME;
  if (existsSync(tmpConfigHome)) {
    rmSync(tmpConfigHome, { recursive: true, force: true });
  }
});

describe("readState", () => {
  it("returns defaults when file is absent", async () => {
    const state = await readState();
    expect(state).toEqual({ enabled: false, interceptCount: 0, bypassCount: 0 });
  });

  it("returns persisted values after a write", async () => {
    await writeState({ enabled: true, interceptCount: 7, bypassCount: 2 });
    const state = await readState();
    expect(state).toEqual({ enabled: true, interceptCount: 7, bypassCount: 2 });
  });

  it("merges partial write — only touched fields change", async () => {
    await writeState({ enabled: true });
    await writeState({ interceptCount: 3 });
    await writeState({ bypassCount: 1 });
    const state = await readState();
    expect(state).toEqual({ enabled: true, interceptCount: 3, bypassCount: 1 });
  });

  it("returns defaults when file contains malformed JSON", async () => {
    const fp = stateFilePath();
    mkdirSync(fp.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(fp, "{ bad json %%% }");
    const state = await readState();
    expect(state).toEqual({ enabled: false, interceptCount: 0, bypassCount: 0 });
  });

  it("returns defaults when file contains non-object JSON", async () => {
    const fp = stateFilePath();
    mkdirSync(fp.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(fp, "null");
    const state = await readState();
    expect(state).toEqual({ enabled: false, interceptCount: 0, bypassCount: 0 });
  });
});

describe("writeState", () => {
  it("creates parent directories as needed", async () => {
    await writeState({ enabled: true });
    expect(existsSync(stateFilePath())).toBe(true);
  });

  it("atomic write: no tmp file lingers and content is valid JSON", async () => {
    await writeState({ enabled: false, interceptCount: 42, bypassCount: 6 });
    const fp = stateFilePath();
    const dir = fp.replace(/\/[^/]+$/, "");
    const files = readdirSync(dir);
    expect(files.filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
    const parsed = JSON.parse(readFileSync(fp, "utf8"));
    expect(parsed).toEqual({ enabled: false, interceptCount: 42, bypassCount: 6 });
  });
});

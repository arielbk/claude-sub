import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export interface State {
  enabled: boolean;
  interceptCount: number;
  bypassCount: number;
}

const DEFAULTS: State = { enabled: false, interceptCount: 0, bypassCount: 0 };

export function stateFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configHome, "claude-sub", "state.json");
}

export async function readState(): Promise<State> {
  const fp = stateFilePath();
  if (!existsSync(fp)) return { ...DEFAULTS };
  try {
    const raw = await readFile(fp, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULTS };
    }
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULTS.enabled,
      interceptCount:
        typeof parsed.interceptCount === "number" ? parsed.interceptCount : DEFAULTS.interceptCount,
      bypassCount: typeof parsed.bypassCount === "number" ? parsed.bypassCount : DEFAULTS.bypassCount,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeState(partial: Partial<State>): Promise<void> {
  const fp = stateFilePath();
  const dir = fp.replace(/\/[^/]+$/, "");
  await mkdir(dir, { recursive: true });

  const current = await readState();
  const next: State = { ...current, ...partial };

  const tmp = join(dir, `.tmp-${randomBytes(6).toString("hex")}.json`);
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(tmp, fp);
}

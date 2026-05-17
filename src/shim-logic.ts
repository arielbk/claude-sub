import { readState, writeState } from "./state.js";

export function resolveUsePty(envVar: string | undefined, stateEnabled: boolean): boolean {
  if (envVar === "1") return true;
  if (envVar === "0") return false;
  return stateEnabled;
}

export async function incrementInterceptCount(): Promise<void> {
  const state = await readState();
  await writeState({ interceptCount: state.interceptCount + 1 });
}

# claude-sub implementation log

---

## package-rename — 2026-05-17

**Slice:** `package-rename`
**Status:** done

### What changed

- `package.json`: renamed `"name"` from `"claude-plan-wrapper"` to `"claude-sub"`; added `"csub": "./dist/shim.js"` to `"bin"` (kept existing `"claude"` entry); updated description.
- `src/__tests__/publish.test.ts`: updated `TARBALL_NAME` constant to `claude-sub-0.1.0.tgz`; added `pkg.bin.csub` assertion to the bin field test; added new test `"package.json declares name as claude-sub"`.

### Test results

- `publish.test.ts`: 11/11 pass (was 10/10 before, +1 new test).
- Pre-existing failures in `shim.test.ts` (3) and `timeouts.test.ts` (module load error) unchanged.

---

## state-module — 2026-05-17

**Slice:** `state-module`
**Status:** done

### What changed

- `src/state.ts`: new module exporting `readState()`, `writeState(partial)`, and `stateFilePath()`. Reads/writes `~/.config/claude-sub/state.json` (XDG-aware via `XDG_CONFIG_HOME`). Atomic write uses a `.tmp-<random>.json` file then `rename`. Malformed or non-object JSON silently returns defaults `{ enabled: false, interceptCount: 0 }`.
- `src/__tests__/state.test.ts`: 7 unit tests covering: defaults on missing file, round-trip read/write, partial merge, malformed JSON, non-object JSON, directory auto-creation, and atomic write (no lingering tmp file).

### Test results

- `state.test.ts`: 7/7 pass (new).
- Pre-existing failures in `shim.test.ts` (3) and `timeouts.test.ts` (module load error) unchanged.

---

## shim-consults-state — 2026-05-17

**Slice:** `shim-consults-state`
**Status:** done

### What changed

- `src/shim-logic.ts`: new module exporting `resolveUsePty(envVar, stateEnabled)` (pure routing function) and `incrementInterceptCount()` (reads state, writes back with +1).
- `src/shim.ts`: imports `readState` from `./state.js` and `resolveUsePty`, `incrementInterceptCount` from `./shim-logic.js`. Replaces `CLAUDE_USE_SUB === "1"` with `resolveUsePty(process.env.CLAUDE_USE_SUB, state.enabled)`. Calls `incrementInterceptCount()` on successful PTY interception.
- `src/__tests__/shim.test.ts`: added `vi.mock('../state.js', ...)`, imported `resolveUsePty` and `incrementInterceptCount` from `shim-logic.js`. Added 4 pure unit tests for `resolveUsePty` (all four routing combinations) and 1 mocked test verifying `writeState` is called with `{ interceptCount: old + 1 }`.

### Test results

- 5 new tests in `shim.test.ts` all pass.
- Total: 51 passed, 3 pre-existing failures unchanged (node-pty native module / real claude path issues in integration tests).

---

## cli-on-off-status — 2026-05-17

**Slice:** `cli-on-off-status`
**Status:** done

### What changed

- `src/cli.ts`: new module exporting `cmdOn()`, `cmdOff()`, `cmdStatus()`. Each returns `{ exitCode: number, output?: string }`. `cmdOn`/`cmdOff` call `writeState({ enabled: true/false })`. `cmdStatus` calls `readState()` and `stateFilePath()` and formats output as "Status: on/off", "State file: <path>", "Intercepted N calls".
- `src/csub.ts`: new entry point (`#!/usr/bin/env node`) that parses `process.argv[2]` as subcommand, dispatches to handlers, writes output to stdout, and exits with the returned exit code. Unknown commands print usage to stderr and exit 1.
- `package.json`: updated `"csub"` bin entry from `"./dist/shim.js"` to `"./dist/csub.js"`.
- `src/__tests__/cli.test.ts`: 9 unit tests covering: `cmdOn` writes `enabled: true` and returns exit code 0; `cmdOff` writes `enabled: false` and returns exit code 0; `cmdStatus` with `enabled: true` outputs "on"; `cmdStatus` with `enabled: false` outputs "off"; output includes state file path; output includes intercept count; exit code 0.
- `src/__tests__/publish.test.ts`: updated `csub` bin assertion from `/dist\/shim\.js/` to `/dist\/csub\.js/` to reflect the new entry point.

### Test results

- `cli.test.ts`: 9/9 pass (new).
- `publish.test.ts`: 11/11 pass (updated csub bin assertion).
- Total: 60 passed, 3 pre-existing failures unchanged (node-pty native module / real claude path issues in integration tests).

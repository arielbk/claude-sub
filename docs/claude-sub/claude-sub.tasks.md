# claude-sub

Wrap the existing `claude -p` PTY shim with a file-based on/off switch and a one-shot sandbox installer, published as `claude-sub` (bin `csub`).

## Slices

### `package-rename` — Rename package to claude-sub

**Status:** done

**Outside-in:** `npm pack` produces `claude-sub-<version>.tgz`; the tarball's `package.json` declares `"name": "claude-sub"` and `"bin": { "csub": "./dist/shim.js" }`.

**Feedback loop:** Existing test suite (`pnpm test`) still passes. New unit test in `src/__tests__/publish.test.ts` asserts the package name and bin entry.

**Human checkpoint:** no

**Depends on:** none

---

### `state-module` — State module

**Status:** done

**Outside-in:** `readState()` returns `{ enabled: boolean, interceptCount: number }`; `writeState(partial)` merges and persists. Backed by `~/.config/claude-sub/state.json` (XDG-aware: respects `$XDG_CONFIG_HOME`).

**Feedback loop:** Unit tests in `src/__tests__/state.test.ts` cover: round-trip read/write, missing file returns defaults (`enabled: false`, `interceptCount: 0`), malformed JSON returns defaults without throwing, atomic-ish write (tmp file + rename).

**Human checkpoint:** no

**Depends on:** none

---

### `shim-consults-state` — Shim consults state file

**Status:** not-started

**Outside-in:** `claude -p "..."` invocation: when `CLAUDE_USE_SUB` env var is set it wins (existing behaviour); when unset, the shim reads the state file and routes through interactive Claude iff `enabled: true`. On successful interception the shim increments `interceptCount`.

**Feedback loop:** Unit tests in `src/__tests__/shim.test.ts` adding cases for: env-unset + state-on → PTY path taken; env-unset + state-off → pass-through; env=1 + state-off → PTY path; env=0 + state-on → pass-through. Counter increment verified via mocked state writer.

**Human checkpoint:** no

**Depends on:** state-module

---

### `cli-on-off-status` — csub on/off/status

**Status:** not-started

**Outside-in:** `csub on` writes `enabled: true` and exits 0; `csub off` writes `enabled: false` and exits 0; `csub status` prints on/off, state file path, and "intercepted N calls" and exits 0.

**Feedback loop:** Unit tests in `src/__tests__/cli.test.ts` invoke each subcommand handler with a mocked state module; assert state transitions and exit codes. Output strings asserted as substring matches (not exact format) to keep tests resilient.

**Human checkpoint:** no

**Depends on:** state-module

---

### `cli-doctor` — csub doctor

**Status:** not-started

**Outside-in:** `csub doctor` exits 0 when the shim wins on PATH and the real claude is discoverable behind it; exits non-zero with a remediation message (including the exact `export PATH=...` line) otherwise. `csub on` also runs the doctor and reports inline.

**Feedback loop:** Unit tests in `src/__tests__/doctor.test.ts` feed mocked `which -a claude` results (shim-first, real-first, missing entirely) and assert the structured diagnostic object plus exit code. `csub on` integration test asserts doctor output is included.

**Human checkpoint:** no

**Depends on:** state-module

---

### `install-sandbox` — csub install-sandbox

**Status:** not-started

**Outside-in:** `csub install-sandbox <name>` shells out to `docker sandbox exec <name>` to: install the package's compiled shim inside the sandbox, replace `/home/agent/.local/bin/claude` with a wrapper that resolves the real claude at `/home/agent/.local/share/claude/versions/*/cli.js`, and write the state file with `enabled: true`. Idempotent — running twice is a no-op the second time.

**Feedback loop:** Unit test in `src/__tests__/install-sandbox.test.ts` snapshots the generated bash payload. End-to-end test executed by the implementing agent (which itself runs inside a sandbox): run `csub install-sandbox <self>`, then `claude -p "say OK"`, assert output begins with `OK` and `csub status` shows incremented counter inside the sandbox.

**Human checkpoint:** no

**Depends on:** package-rename, shim-consults-state

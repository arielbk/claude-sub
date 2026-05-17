# claude-plan-wrapper

A PATH-shim that, when `CLAUDE_USE_PLAN=1` is set, intercepts `claude -p` invocations and routes them through an interactive Claude session under a PTY — so the call bills against the user's Claude plan instead of API credits. Opt-in by default; installing the shim changes nothing unless the env var is set.

## Execution notes

Slices will be executed via `/ralph`, which spawns each iteration inside a Docker sandbox with no access to the host machine. Slices marked with `**Host verification:**` need the orchestrator (running outside the sandbox) to perform the post-iteration check — the sandbox iteration is responsible for getting the slice into a state where the orchestrator's verification step will pass. `Human checkpoint:` is `no` everywhere; escalation is machine-to-machine, not waiting on a human.

## Slices

### `scaffold-and-passthrough` — Scaffold project and passthrough shim

**Status:** done

**Outside-in:** After `pnpm install && pnpm build && pnpm link --global` (or equivalent), `which claude` resolves to the shim binary, and every invocation (`claude --help`, `claude`, `claude -p "..."`) behaves identically to the real `claude` because the shim unconditionally `exec`s the real binary in this slice.

**Feedback loop:** In-sandbox — `pnpm build` succeeds; vitest passes a smoke test that invokes the built `claude` binary as a subprocess with `--help` and asserts the output matches running the real `claude --help` directly (sandbox has authenticated `claude` available).

**Host verification:** Orchestrator runs `pnpm link --global` (or installs the packed tarball) on the host, then verifies `which -a claude` lists the shim's path *before* the real `claude` path, and that `claude --help`, `claude --version`, and a no-arg `claude` invocation all behave identically to the real binary.

**Human checkpoint:** no

**Depends on:** none

---

### `opt-in-branch-with-flag-mapping` — Opt-in detection + flag allowlist

**Status:** done

**Outside-in:** `CLAUDE_USE_PLAN=1 claude -p "hello"` with a supported flag set (e.g. `--model sonnet`) prints a stub reply on stdout and exits 0. Passing an unsupported flag (e.g. `--output-format json`) exits non-zero with a clear stderr message naming the unsupported flag and listing the supported set. With `CLAUDE_USE_PLAN` unset, behavior is identical to slice 1's passthrough regardless of `-p`.

**Feedback loop:** In-sandbox — vitest unit tests for `flag-mapper` covering: each supported flag accepted, each unsupported flag rejected with the expected error message, prompt extracted correctly from positional/`-p`-value forms, `CLAUDE_USE_PLAN` unset → passthrough branch. Integration test invokes the built `claude` shim as a subprocess and asserts both branches.

**Human checkpoint:** no

**Depends on:** scaffold-and-passthrough

---

### `pty-roundtrip-raw` — PTY spawn + raw output dump

**Status:** done

**Outside-in:** `CLAUDE_USE_PLAN=1 claude -p "reply with the single word OK"` spawns interactive Claude under node-pty, sends the prompt as keystrokes, waits for the session to settle, and dumps the raw PTY byte stream (ANSI escapes and all) to stdout. The output is messy but contains the substring `OK`.

**Feedback loop:** In-sandbox — integration test (gated on `CLAUDE_USE_PLAN_E2E=1`) invokes the shim with a deterministic prompt and asserts the captured stdout contains the expected substring. Sandbox has authenticated `claude`, so the roundtrip runs end-to-end there.

**Host verification:** Orchestrator runs `CLAUDE_USE_PLAN=1 claude -p "reply with the single word OK"` directly on the host (where the real `claude` is the one the user normally uses) and visually inspects that the output contains `OK`. Confirms the PTY spawn works against the host's real interactive Claude, not just the sandbox's copy.

**Human checkpoint:** no

**Depends on:** opt-in-branch-with-flag-mapping

---

### `sentinel-and-clean-extraction` — Sentinel injection + clean output extractor

**Status:** done

**Outside-in:** `CLAUDE_USE_PLAN=1 claude -p "reply with the single word OK"` prints exactly `OK\n` to stdout — no ANSI escapes, no TUI chrome, no sentinel token, no trailing whitespace beyond a single terminating newline. The spawned interactive Claude is started with `--append-system-prompt` carrying the sentinel instruction; the extractor watches the byte stream, strips ANSI, detects the sentinel token on its own line, and returns the cleaned reply.

**Feedback loop:** In-sandbox — vitest unit tests for `output-extractor` with recorded PTY-output fixtures covering: clean reply with sentinel at end, sentinel split across two read chunks, ANSI escape sequences interleaved with content, trailing whitespace stripped, content coincidentally containing a sentinel prefix substring but not the full token. Integration test (gated as in slice 3) asserts the cleaned output matches the expected reply exactly.

**Host verification:** Orchestrator runs the shim end-to-end on the host with a known prompt and confirms stdout is just the reply text — byte-for-byte identical to what `claude -p` would produce (modulo provider-side variation in wording).

**Human checkpoint:** no

**Depends on:** pty-roundtrip-raw

---

### `timeouts-and-diagnostics` — Overall + idle timeouts with diagnostic dumps

**Status:** done

**Outside-in:** A wrapper invocation that never emits the sentinel within `CLAUDE_USE_PLAN_TIMEOUT_MS` (default 5 minutes) is killed, exits with a non-zero status (suggest exit `124` to match GNU `timeout`), and writes a diagnostic dump to stderr containing (a) the elapsed time, (b) the last ~4KB of raw PTY bytes, and (c) an ANSI-stripped view of the same. A per-byte idle timeout (default ~30s of zero output after the session is established) triggers the same failure path with an "idle timeout" reason.

**Feedback loop:** In-sandbox — vitest tests using a fake PTY runner that emits no sentinel (or stops emitting bytes) and asserts: correct exit code, stderr contains the elapsed time, raw-bytes section, and ANSI-stripped section. Timeout values are injectable via constructor for fast tests (e.g. 100ms overall, 50ms idle). No real `claude` involved.

**Human checkpoint:** no

**Depends on:** sentinel-and-clean-extraction

---

### `publish-prep` — Publish prep: README, bin, packaged install

**Status:** needs-review

**Host verification (2026-05-17):** PARTIAL.

Resolver recursion bug — FIXED. `real-claude-resolver.ts` now detects shell-wrapper bins by reading the candidate's contents and looking for our package's identity (`claude-plan-wrapper` + `shim.js`), in addition to the existing symlink-realpath check. Two unit tests added covering both detection paths. Passthrough verified end-to-end: `pnpm pack` → `pnpm add ./tgz` in a fresh temp dir → `claude --version` returns `2.1.143 (Claude Code)` instead of infinite-looping.

Remaining host-only issues (not blocking the resolver fix, but blocking a true e2e PASS):
1. `node-pty`'s prebuilt `spawn-helper` ships without the executable bit when installed from the packed tarball via pnpm — first PTY spawn fails with `posix_spawnp failed`. After `chmod +x` the spawn works. Likely a pnpm-pack-on-darwin permissions issue; a postinstall hook on this package that chmods node-pty's spawn-helper would close it.
2. With the chmod fix, the PTY launches and the prompt is typed into the interactive Claude TUI, but the prompt is never submitted (no Enter, or Enter ignored before the TUI is ready). The session times out (or in one run, exited 0 with raw TUI bytes on stdout — the extractor never observed the sentinel). This is a regression-or-incompatibility against the current host Claude version (`2.1.143`) — slice 3/4 sandbox tests presumably passed against the sandbox's Claude. Needs the pty-runner to wait for the TUI prompt to be ready before keystrokes, and the keystroke stream needs a verified submit.

**Outside-in:** `pnpm pack` produces a tarball; `pnpm add -g ./<tarball>` in a fresh directory installs a `claude` binary on PATH; `CLAUDE_USE_PLAN=1 claude -p "reply with the single word OK"` works end-to-end against the user's real Claude install. README documents: install steps, `PATH` ordering requirement, `CLAUDE_USE_PLAN` opt-in semantics, supported flag allowlist, and known limitations (no JSON output, no `--resume`, etc.).

**Feedback loop:** In-sandbox — `pnpm pack` succeeds; a smoke test inspects the tarball contents (asserts `bin/claude`, `dist/`, `package.json` with correct `bin` field are present); README lint (e.g. markdown-lint or a simple presence-check that required sections exist).

**Host verification:** Orchestrator installs the packed tarball in a fresh temporary directory on the host (`mkdir /tmp/cpw-verify && cd /tmp/cpw-verify && pnpm init -y && pnpm add ./path/to/tarball`), ensures the local `node_modules/.bin` is on PATH, runs `CLAUDE_USE_PLAN=1 claude -p "reply with the single word OK"`, and confirms clean output. Then uninstalls and confirms the host's PATH/`claude` returns to its prior state.

**Human checkpoint:** no

**Depends on:** timeouts-and-diagnostics

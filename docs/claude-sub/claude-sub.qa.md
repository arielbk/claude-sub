# QA Plan: claude-sub

## What was built

`claude-sub` (bin `csub`) wraps the existing `claude -p` PTY shim with a file-based on/off switch, a `doctor` PATH check, and a one-shot `install-sandbox <name>` installer. Routing is controlled by `~/.config/claude-sub/state.json` (XDG-aware), with the existing `CLAUDE_USE_SUB` env var still winning when set.

## Already verified by the agent

These were run during implementation and passed. Listed for confidence, not action.

- [x] `publish.test.ts` — 11/11 pass; tarball name is `claude-sub-0.1.0.tgz`, `bin.csub` points at `dist/csub.js`.
- [x] `state.test.ts` — 7/7 pass; round-trip, defaults on missing file, malformed JSON, atomic write, XDG-aware path, directory auto-creation.
- [x] `shim.test.ts` — 5 new tests pass covering all four `resolveUsePty` routing combinations and the intercept-count increment.
- [x] `cli.test.ts` — 9/9 pass; `cmdOn`/`cmdOff`/`cmdStatus` state transitions and output formatting (substring asserts).
- [x] `doctor.test.ts` — 9/9 pass; `analyzePaths` across shim-first / real-first / missing / shim-only / real-only, plus `cmdDoctor` exit codes and `cmdOn`-with-doctor integration.
- [x] `install-sandbox.test.ts` — 7/7 pass; snapshot of `buildInstallPayload()`, idempotency marker, symlink creation, state-file content, PATH prepend, bash shebang + strict mode, `/tmp/csub-dist` staging.
- [x] Full suite — 76 passed at end of `install-sandbox`, 69 at end of `cli-doctor` (last reported total). 3 pre-existing failures unchanged throughout (see "Watch closely").

## Human verification required

- [x] **End-to-end sandbox install.** Ran `csub install-sandbox claude-claude-workaround`, then `claude -p "say OK..."` inside the sandbox. Shim intercepted (PTY took over, real `claude` launched), `state.json` went `interceptCount: 0 → 1`, and `csub status` reported "Intercepted 1 calls". *Note: surfaced two bugs in the original implementation — `docker exec`/`docker cp` instead of `docker sandbox exec`, and no node_modules shipped to the sandbox so node-pty was missing. Both fixed in a follow-up commit; the install now tars `dist/` + `package.json` over `docker sandbox exec -i tar`, then runs `npm install --omit=dev` inside the sandbox so the native binding matches the sandbox arch.*
- [x] **`csub doctor` against a real PATH.** Verified in the sandbox across three PATH shapes: shim-first → exit 0, "OK"; real-first → exit 1, prints exactly `export PATH="/home/agent/.local/lib/claude-sub/bin:$PATH"`; missing entirely → exit 1, "claude not found on PATH". Pasting the remediation line and re-running flips the result to OK.
- [x] **`csub on` doctor integration on a real PATH.** Inline doctor output in `csub on` matches `csub doctor` standalone verbatim (both printed `OK — shim is first on PATH and real claude is discoverable` in the shim-first sandbox). No drift.
- [x] **State file location on a non-XDG host.** With `XDG_CONFIG_HOME` unset on the macOS host: `~/.config/claude-sub/state.json`. With it set to `/tmp/custom-xdg-NNN`: `/tmp/custom-xdg-NNN/claude-sub/state.json`. Resolution is correct.
- [x] **`bin.claude` entry still works.** `npm pack` produces `claude-sub-0.1.0.tgz`; `package/package.json` declares `bin: { claude: ./dist/shim.js, csub: ./dist/csub.js }`; both target files are present in the tarball under `package/dist/`. No collision with the pre-existing `claude` because consumers of this package opt in via `npm install` / `npx`.

## Watch closely

- [x] **2 pre-existing test failures persist on HEAD** — `shim.test.ts > "matches real claude --help"` and `> "CLAUDE_USE_SUB=1 without -p passes through to real claude"`. Both fail identically (`expected +0 to be null`) at the pre-ralph baseline (`3522586`), confirming they predate this work. Root cause: those tests spawn the *real* claude binary and the test environment returns `status: null` (process didn't cleanly exit within the 15s timeout), while the shim cleanly returns `0`. The ralph log's "3 failures" total included a 3rd in `timeouts.test.ts` that no longer fires (now skipped via vitest's skip path). Not introduced or worsened by the rename/refactor.
- [x] **`cmdDoctor` placed in `cli.ts` rather than `doctor.ts`** — placement is intentional and clean: `doctor.ts` owns the engine (`runDoctor`, `analyzePaths`, `isShimBinary`, `DiagnosticResult`), `cli.ts` owns the thin command-result adapter (`cmdDoctor` translates `DiagnosticResult → CommandResult { exitCode, output }`). The split matches the dispatch/engine layering the other `cmd*` functions already use. Not a smell.
- [x] **Idempotency of `install-sandbox`** — ran twice against `claude-claude-workaround`. Both invocations short-circuited with `claude-sub: already installed`. `~/.bashrc` has exactly **1** `claude-sub` PATH line (no duplicate). Symlink intact at `dist/shim.js`. **Crucially: `interceptCount` was preserved across the second install** (stayed at 1, not reset to 0) because the idempotent fast-path returns before the `cat > state.json` step.
- [ ] **`incrementInterceptCount` race** — the shim reads-then-writes state on every successful interception. If two `claude -p` invocations run concurrently inside the same sandbox, the counter could under-count. Not a correctness bug for the routing itself; left unchecked as accepted behaviour.

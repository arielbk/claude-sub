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

- [ ] **End-to-end sandbox install.** The `install-sandbox` slice's outside-in spec required running `csub install-sandbox <self>` inside a sandbox, then `claude -p "say OK"` and asserting output begins with `OK` and `csub status` shows an incremented counter. The log only records the unit/snapshot tests — the live e2e was not run. Spin up a sandbox, run the install, fire one `claude -p`, and confirm the counter ticked.
- [ ] **`csub doctor` against a real PATH.** Unit tests mock `which -a claude`. On a real machine, run `csub doctor` both before and after putting the shim ahead of the real `claude` on PATH; confirm exit code flips and the printed `export PATH=...` remediation actually fixes it when pasted.
- [ ] **`csub on` doctor integration on a real PATH.** Confirm the inline doctor output in `csub on` matches what `csub doctor` prints standalone (no drift between the two surfaces).
- [ ] **State file location on a non-XDG host.** Verify `csub status` prints a sensible path on a machine with `$XDG_CONFIG_HOME` unset (should fall back to `~/.config/claude-sub/state.json`).
- [ ] **`bin.claude` entry still works.** `package.json` kept the existing `"claude"` bin alongside the new `"csub"`. Confirm `npx claude-sub` / a linked install still exposes both binaries and nothing collides with a pre-existing `claude` on PATH.

## Watch closely

- [ ] **3 pre-existing test failures persisted across every slice** — `shim.test.ts` (3 failures) and `timeouts.test.ts` (module load error), attributed in the log to node-pty native module / real-claude path issues in integration tests. Confirm these were truly pre-existing (compare against pre-ralph `main`) and not silently introduced or worsened by the rename/refactor.
- [ ] **`cmdDoctor` placed in `cli.ts` rather than `doctor.ts`** — log notes this was done "to allow clean cross-module mock in tests." Worth a sanity read to make sure the placement is intentional and not a test-driven layering smell.
- [ ] **Idempotency of `install-sandbox`** — unit-tested via snapshot + a marker check, but real idempotency only shows up by running the installer twice against the same sandbox. Confirm the second run is a true no-op (no duplicated PATH entries in `~/.bashrc`, symlink unchanged).
- [ ] **`incrementInterceptCount` race** — the shim reads-then-writes state on every successful interception. If two `claude -p` invocations run concurrently inside the same sandbox, the counter could under-count. Not a correctness bug for the routing itself, but worth noting.

# QA Plan: expand-supported-flags

## What was built

`claude-plan-wrapper` / `claude-sub` flag handling was expanded to cover the orchestrator flags used by Ralph and dispatch. The shim now allowlists additional scalar and variadic flags, persists a `bypassCount`, detects PTY-incompatible print-mode/session flags, and loudly routes those calls to the real `claude` with the original argv so plan-mode billing is not silently assumed.

## Already verified by the agent

These were run during implementation and passed. Listed for confidence, not action.

- [x] `flag-mapper.test.ts` — 35 tests pass after adding non-variadic allowlist coverage for `--append-system-prompt`, `--system-prompt`, `--permission-mode`, `--settings`, `--agent`, `--agents`, `--dangerously-skip-permissions`, `--strict-mcp-config`, `--bare`, and supported-flag error guidance.
- [x] `flag-mapper.test.ts` — 25 tests pass after adding variadic parsing for `--add-dir`, `--mcp-config`, `--allowedTools`/`--allowed-tools`, `--disallowedTools`/`--disallowed-tools`, `--tools`, and repeatable `--plugin-dir`.
- [x] `state.test.ts` and `cli.test.ts` — pass after adding `bypassCount` defaults, read/write round-trip, partial-write preservation, malformed JSON fallback, and written JSON coverage.
- [x] `fail-open-detector.test.ts` — passes after adding pure detection for PTY-incompatible flags, including `--flag=value` forms, while leaving unknown flags on the existing hard-error path.
- [x] `shim.test.ts`, `state.test.ts`, and `fail-open-detector.test.ts` — 38 tests pass with 1 skipped E2E test after wiring fail-open routing, stderr warning, real-claude invocation with original argv, exit-code preservation, and `bypassCount` incrementing.
- [x] `npm run build` — passes in every implementation iteration that reported handoff verification.

## Human verification required

None. Every completed slice in `expand-supported-flags.tasks.md` has `Human checkpoint: no`, and the log does not describe browser, device, or subjective UX checks.

## Watch closely

- [ ] **`non-variadic-allowlist` log status says `needs-review`** — the task DAG marks the slice `done`, but the log entry still says `needs-review`; its tests and build passed, and the remaining issue was inability to commit because the sandbox cannot write under `.git`.
- [ ] **Full test suite was not clean in the variadic iteration** — the focused flag-mapper tests and build passed, but full `npm test` hit unrelated sandbox failures: npm cache writes under `/Users/arielbk/.npm/_cacache/tmp` and two real-`claude` shim passthrough tests returning `status === null`.
- [ ] **Variadic parsing uses dash-token termination** — values stop at the next token beginning with `-`, and missing values keep the existing `Flag {flag} requires a value` parse-failure shape.
- [ ] **`readState()` now always returns `bypassCount`** — TypeScript fixtures or callers constructing `State` directly must include the new field.
- [ ] **Fail-open intentionally ignores unknown flags** — `detectFailOpen` returns `bypass: false` for unknown flags so the existing unknown-flag hard-error path still owns that behavior.
- [ ] **Implementation logs note missing `/implement` resource files** — two iterations could not find `tdd-loop.md` / `log-format.md` and followed the local TDD skill plus existing log format instead.

# srt-stream-heartbeat — Implementation Log

---

## [docs-prime-time] 2026-06-06

**Status:** done

**What was implemented:**
- Removed the stale `--output-format` (streaming JSON) entry from the README "Known limitations" section; the remaining `--output-format json` / `--json` limitations now accurately reflect that only `stream-json` is emulated
- Added a "Streaming JSON output" section documenting the emulated NDJSON stream, an example invocation, the three event types (`heartbeat`, `assistant`, `result`) with their exact shapes, the ~10s activity-gated heartbeat semantics, and the `jq` filters that consumers (ralph) use
- Added an `--output-format stream-json` row to the supported-flags table, noting it is consumed by the shim rather than forwarded

**Feedback loop result:** Human review. Verified the documented event shapes against `src/stream-json-emitter.ts`, the heartbeat default (`heartbeatIntervalMs = 10000`, fires only when bytes arrived) against `src/pty-runner.ts`, and the supported/unsupported `--output-format` behavior against `src/flag-mapper.ts`. `pnpm build` and `pnpm test` remain green (160 passing, 2 E2E-gated skipped) — docs-only change, no code touched.

**Notes:**
- Slice taken over by the orchestrator (Claude) directly rather than a ralph-codex iteration; the implementation slices were delegated to the Codex loop.

## `srt-acceptance` — 2026-06-06 19:31:52

**Status:** needs-review

**Summary:** Reclaimed the remaining acceptance checkpoint and verified the automated structural gates available in this environment. The existing sandbox installer stages `dist/` plus `package.json`, installs runtime dependencies inside the sandbox for the node-pty native binding, writes enabled state, exposes `claude`/`csub` on PATH, and the stream-json/heartbeat paths remain covered by the full build and test suite.

**Deviations:** The slice is a declared human checkpoint, so no code change was made. `srt` and `ralph.sh` are not present on PATH in this shell; `docker` and `jq` are present.

**Handoff:** `pnpm build` passed and `pnpm test` passed with 162 passing tests and 2 existing E2E-gated tests skipped. Human QA still needs a real `ralph.sh <feature>` run under `srt` with `csub on`, heartbeat visibility confirmed on the stream, and out-of-band usage-dashboard confirmation that billing stayed on-plan.

---

## [activity-heartbeat] 2026-06-06

**Status:** done

**What was implemented:**
- Added activity heartbeat options to `runUnderPty`: a configurable interval and callback that fires only when new PTY bytes arrived since the prior interval
- Wired stream-json plan-mode runs to emit parseable `{"type":"heartbeat"}` NDJSON events while the PTY is active, before the final assistant/result events
- Added focused tests for the activity-gated runner behavior and heartbeat event formatting

**Feedback loop result:** `pnpm build` clean; `pnpm test` clean — 162 passing tests, 2 existing E2E-gated tests skipped.

**Notes:**
- The real long-running `claude -p --output-format stream-json` manual watch was not run in this AFK iteration; the runner unit test uses an injected PTY and fake timers to verify the activity-gated timing behavior.

---

## [stream-json-output] 2026-06-06

**Status:** done

**What was implemented:**
- Added `src/stream-json-emitter.ts` to format the clean PTY reply as NDJSON with an `assistant` event carrying `message.content[].text` and a final `result` event carrying `.result`
- Updated `src/flag-mapper.ts` so `--output-format stream-json` and `--output-format=stream-json` select stream-json mode without forwarding the flag to the real Claude PTY invocation; other output formats still fail with a parser error
- Updated `src/fail-open-detector.ts` so stream-json stays on the plan-mode PTY path while unsupported output formats and existing fail-open flags still bypass
- Updated `src/shim.ts` so plan-mode `-p --output-format stream-json` writes parseable NDJSON and does not print the API-bypass warning
- Added/updated unit and subprocess tests covering the Ralph jq-visible event shape, parser support, fail-open routing, and shim-level NDJSON output

**Feedback loop result:** `pnpm build` clean; `pnpm test` clean — 160 passing tests, 2 existing E2E-gated tests skipped.

**Notes:**
- The real `claude -p --output-format stream-json "say OK"` manual check was not run in this AFK iteration to avoid invoking an external Claude session; the subprocess shim test uses a fake real `claude` binary under the PTY path and verifies the emitted NDJSON events.

---

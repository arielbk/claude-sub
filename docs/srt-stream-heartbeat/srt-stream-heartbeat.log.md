# srt-stream-heartbeat — Implementation Log

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

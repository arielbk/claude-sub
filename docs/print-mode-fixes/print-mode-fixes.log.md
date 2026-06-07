# Print-mode fixes — implementation log

## `output-format-json` — 2026-06-07 12:36:50

**Status:** done
**Summary:** Added `json` as a first-class output mode end-to-end: `output-mode-parser` now recognises `json` and returns `{ kind: "json" }` (alongside `stream-json`); `output-renderer` emits a single `{"type":"result","result":"..."}` object on finish with no activity output; `fail-open-detector` exempts `--output-format json` from bypass (same exemption as `stream-json`); `flag-mapper` accepts `json`, removes it from argv, records `outputMode: "json"`, and lists it in `SUPPORTED_FLAGS_LIST`; the error message for other unsupported `--output-format` values now reads "only supports stream-json or json". Added an end-to-end shim integration test confirming `--output-format json` stays on the subscription path, emits one parseable JSON object, and does not warn about API billing. Suite grew from 196 → 204 tests.
**Deviations:** The existing `shim.test.ts` unit test and integration test that asserted `--output-format json` was a bypass flag were updated to use `--input-format stream-json` instead (a real bypass flag), since `json` is now on the subscription path.
**Handoff:** `OutputMode` type is now `"plain" | "stream-json" | "json"` — any downstream slice that switches on `OutputMode` must handle all three cases. The `json` renderer emits raw JSON with no trailing newline — `jq -r .result` parses it cleanly. `SUPPORTED_FLAGS_LIST` now has 19 entries ending with both `--output-format stream-json` and `--output-format json`.

## `prompt-after-flags` — 2026-06-07 12:31:30

**Status:** done
**Summary:** Fixed the print-flag handler in `src/flag-mapper.ts` so `-p`/`--print` no longer steals a following flag as the prompt: the next argument is only taken as the prompt when it doesn't start with `-`; otherwise the prompt is picked up later as the first positional. Added 4 flag-mapper tests (flag-then-positional in both space and `=` forms, flags-only errors, bare `-p` errors).
**Deviations:** The old `Flag -p requires a value` error for a trailing bare `-p` is gone — that case now falls through to the standard `No prompt provided` error, which is more accurate (the prompt may legitimately arrive as a positional elsewhere in argv). No test depended on the old message.
**Handoff:** The print handler keeps the first prompt seen (`prompt === undefined` guard), consistent with the "first positional is the prompt" rule. Prompts that themselves start with `-` cannot follow `-p` directly — same limitation as upstream flag parsing. Full suite green (196 passed), `tsc` clean. Work happens on feature branch `print-mode-fixes`, one logical commit per slice, PR at the end.

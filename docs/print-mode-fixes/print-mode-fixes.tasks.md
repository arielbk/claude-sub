# Print-mode fixes

Fix the `-p` prompt-stealing bug, add `--output-format json` support, and rename "plan mode" copy to "subscription mode" with a unified `csub:` stderr prefix. PRD: `print-mode-fixes.prd.md` (same directory).

## Slices

### `prompt-after-flags` — Stop stealing flags as the prompt

**Status:** done

**Outside-in:** `claude -p --output-format stream-json "question"` sends "question" as the prompt regardless of flag/prompt ordering; `claude -p --output-format stream-json` with no positional exits non-zero with a missing-prompt error instead of silently sending a flag name to Claude.

**Feedback loop:** Flag-mapper unit tests: `-p` followed by `--output-format stream-json` (and the `=` form) then a positional extracts the positional as the prompt; `-p` followed only by flags errors. Full suite stays green.

**Human checkpoint:** no

**Depends on:** none

### `output-format-json` — Support `--output-format json` end-to-end

**Status:** done

**Outside-in:** `claude -p "hi" --output-format json` (both `--output-format json` and `--output-format=json` forms) prints exactly one parseable JSON object `{"type":"result","result":"..."}` on completion and nothing before it; `jq -r .result` recovers the reply. Stays on the subscription path (no API-billing bypass).

**Feedback loop:** Unit tests: output-mode parser accepts `json` (other values still rejected); json renderer emits one JSON object on finish and nothing on activity ticks; fail-open detector keeps `--output-format json` on the subscription path; supported-flags error text lists both `json` and `stream-json`. Full suite stays green.

**Human checkpoint:** no

**Depends on:** none

### `subscription-mode-copy` — Rename "plan mode" → "subscription mode", unify `csub:` prefix

**Status:** done

**Outside-in:** Rejection stderr reads e.g. `csub: Flag "--json" is not supported in subscription mode.` — no user-facing string says "plan mode", and every shim stderr line is prefixed `csub:` (no more `claude-plan-wrapper:` prefix).

**Feedback loop:** Test asserting no user-facing string contains "plan mode"; existing prefix/copy assertions updated to `csub:`; doctor and real-claude-resolver tests still recognize the on-disk `claude-plan-wrapper` header marker (backward compat untouched). Full suite stays green.

**Human checkpoint:** no

**Depends on:** none

### `original-transcript-demo` — Re-run the original failing transcript

**Status:** done

**Outside-in:** The three invocations from the original bug report, run live: `claude -p "..." --json` and `claude -p "..." --stream-json` are rejected with the new subscription-mode copy, `claude -p --output-format stream-json "what are the first 20 numbers in the fibonacci sequence doubled?"` returns a real fibonacci answer, and `claude -p "same question" --output-format json` yields one parseable result object.

**Feedback loop:** Manual: run the four commands and check stderr copy, prompt fidelity, and `jq` parseability of the json output.

**Human checkpoint:** yes

**Depends on:** prompt-after-flags, output-format-json, subscription-mode-copy

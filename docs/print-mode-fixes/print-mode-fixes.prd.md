# PRD: Print-mode fixes

## Problem Statement

Scripting `claude -p` through the csub shim trips over three rough edges:

1. **Silent prompt mangling.** `claude -p --output-format stream-json "question"` sends the literal string `--output-format` to Claude as the prompt and drops the real question. No error is raised — the call "succeeds" with garbage, and the user only finds out when the reply says "all I received was `--output-format`".
2. **No single-result JSON output.** Upstream `claude` supports `--output-format json` (one JSON object on completion), but the shim rejects every value except `stream-json`. Users reaching for machine-readable output in scripts hit a wall even when they use the correct upstream syntax.
3. **Confusing "plan mode" copy.** Error messages say things like `Flag "--json" is not supported in plan mode`. Claude Code has its own, unrelated "plan mode" (the permission mode), so the copy reads as nonsense. The shim means *subscription* mode — routing print calls through the user's Claude subscription instead of API billing. Compounding this, stderr messages carry two different prefixes (`claude-plan-wrapper:` and `csub:`) depending on which code path emits them.

## Solution

The shim parses print-mode invocations correctly regardless of flag/prompt ordering, supports `--output-format json` by synthesizing a single result object (the same way it already synthesizes stream-json events), and consistently describes itself as operating in **subscription mode** with a single `csub:` stderr prefix.

## User Stories

1. As a developer scripting csub, I want `claude -p --output-format stream-json "question"` to send "question" as the prompt, so that flag ordering doesn't silently corrupt my request.
2. As a developer scripting csub, I want a mis-parsed invocation to fail loudly rather than succeed with a mangled prompt, so that I never act on a reply to the wrong question.
3. As a developer scripting csub, I want `--output-format json` to emit one JSON result object, so that my scripts can `JSON.parse` the output without consuming an NDJSON stream.
4. As a developer scripting csub, I want `--output-format=json` (equals form) to behave identically to the space-separated form, so that both upstream syntaxes work.
5. As a developer reading a rejection error, I want it to say "subscription mode" instead of "plan mode", so that I don't confuse it with Claude Code's permission-mode feature.
6. As a developer reading stderr, I want every shim message prefixed `csub:`, so that I can tell at a glance which tool is talking.
7. As an existing csub user, I want my already-installed shim to keep being detected by `csub doctor` and the real-claude resolver after upgrading, so that the rename doesn't break my installation.

## Implementation Decisions

- **Prompt extraction fix** lives in the flag mapper's print-flag handler: after `-p`/`--print`, the next argument must not be treated as the prompt if it is itself a flag. The prompt is the first non-flag positional remaining after known flags (and their values) are consumed. If no prompt remains, error out rather than passing a flag name through as the prompt.
- **Output-mode vocabulary** stays single-owner in the output-mode parser: the `OutputMode` union gains a `json` member, and the parse result distinguishes `json` from `stream-json` and from unsupported values. The fail-open detector consumes the same parse, so `--output-format json` no longer triggers the API-billing bypass path.
- **JSON rendering** follows the existing renderer seam: a `json`-mode renderer whose finish hook emits a single `{"type":"result","result":<reply>}` object via the emitter module. Its activity hook is a no-op — JSON mode is silent until completion, matching upstream behavior (heartbeats would corrupt a single-document output).
- **Envelope is minimal by design**, consistent with the existing synthesized stream-json events: no `cost_usd`, `usage`, or `session_id` fields, since the shim does not have upstream's metadata.
- **Copy rename**: every user-facing occurrence of "plan mode" becomes "subscription mode"; the supported-flags error text updates to list `--output-format` with both `json` and `stream-json`. The stderr prefix unifies on `csub:` everywhere.
- **Detection markers stay backward-compatible**: the doctor and real-claude resolver continue to recognize the `claude-plan-wrapper` header marker in already-installed shims (alongside `claude-sub`). Newly written shims may carry updated header text, but recognition of the old marker is not removed.

## Testing Decisions

Existing prior art: the flag-mapper unit suite (38 tests) and the shim-logic suite both drive parsing through pure functions with injected writers — new tests follow the same shape. Required new coverage:

- Flag mapper: `-p` followed by `--output-format stream-json` then a positional extracts the positional as the prompt (the regression case); same for the `json` value and the `=` form; `-p` followed only by flags and no positional errors rather than stealing a flag as the prompt.
- Output-mode parser: `json` parses as supported; unsupported values still rejected.
- Output renderer/emitter: `json` mode emits exactly one parseable JSON object containing the reply, and emits nothing on activity ticks.
- Fail-open detector: `--output-format json` stays on the subscription path (no bypass).
- Copy: no user-facing string contains "plan mode"; stderr prefix assertions updated to `csub:`.
- The full existing suite continues to pass.

## Out of Scope

- `--json` / `--stream-json` aliases — they do not exist upstream; rejection stands.
- `--output-format text` — remains rejected; only `json` is being added in this task.
- Upstream-fidelity JSON envelope (cost, usage, session id, subtype).
- Renaming or removing the `claude-plan-wrapper` on-disk detection marker from the resolver/doctor recognition logic.

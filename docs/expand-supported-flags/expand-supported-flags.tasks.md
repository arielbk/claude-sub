# Expand supported flags

Expand `claude-plan-wrapper`'s flag allowlist to cover what orchestrators (ralph, dispatch) actually pass, and add loud fail-open routing for PTY-incompatible flags so users are never silently bypassed off plan-mode billing.

## Slices

### `non-variadic-allowlist` — Non-variadic allowlist additions

**Status:** done

**Outside-in:** `CLAUDE_USE_SUB=1 claude -p "prompt" --append-system-prompt "extra" --permission-mode acceptEdits --bare` parses successfully and forwards the flags to the spawned interactive `claude`.

**Feedback loop:** Unit tests in `src/__tests__/flag-mapper.test.ts`: one case per new flag (`--append-system-prompt`, `--system-prompt`, `--permission-mode`, `--dangerously-skip-permissions`, `--settings`, `--agent`, `--agents`, `--strict-mcp-config`, `--bare`) confirming it lands in `passthroughArgs`; one case confirming the updated supported-flags list appears in the unknown-flag error message.

**Human checkpoint:** no

**Depends on:** none

### `variadic-allowlist` — Variadic parsing + variadic flags

**Status:** done

**Outside-in:** `CLAUDE_USE_SUB=1 claude -p "prompt" --add-dir a b c --mcp-config x.json y.json --allowedTools "Bash(git *)" Edit --plugin-dir A --plugin-dir B` parses successfully and forwards each variadic group correctly.

**Feedback loop:** Unit tests covering: variadic flag with one value, with multiple values, with values followed by another flag, end-of-argv termination, and `--plugin-dir` specified twice (repeatable). One case per variadic flag (`--add-dir`, `--mcp-config`, `--allowedTools`/`--allowed-tools`, `--disallowedTools`/`--disallowed-tools`, `--tools`, `--plugin-dir`) confirming it lands in `passthroughArgs`.

**Human checkpoint:** no

**Depends on:** none

### `state-bypass-count` — State gains bypassCount

**Status:** done

**Outside-in:** `readState()` returns `{ enabled, interceptCount, bypassCount }`; `writeState({ bypassCount: 1 })` persists alongside existing fields. Fresh state defaults `bypassCount` to `0`.

**Feedback loop:** Unit tests in `src/__tests__/state.test.ts`: defaults case includes `bypassCount: 0`; round-trip write + read preserves `bypassCount`; malformed state file falls back to `bypassCount: 0`.

**Human checkpoint:** no

**Depends on:** none

### `fail-open-detector` — Pure fail-open detector

**Status:** done

**Outside-in:** `detectFailOpen(argv: string[])` returns `{ bypass: false }` or `{ bypass: true, reason: string }` where `reason` is the offending flag name. Pure function, no I/O.

**Feedback loop:** Unit tests: one case per fail-open flag (`--output-format`, `--input-format`, `--include-partial-messages`, `--include-hook-events`, `--replay-user-messages`, `--json-schema`, `--resume`, `-r`, `--continue`, `-c`, `--session-id`, `--fork-session`, `--from-pr`, `--no-session-persistence`, `--max-budget-usd`) confirming detection; a case with only allowlisted flags confirms `bypass: false`; a case with an unknown flag confirms `bypass: false` (so the hard-error path still fires); `--flag=value` form is detected the same as `--flag value`.

**Human checkpoint:** no

**Depends on:** none

### `fail-open-routing` — Wire fail-open into the shim entry

**Status:** done

**Outside-in:** `CLAUDE_USE_SUB=1 claude -p "prompt" --output-format stream-json` exec's the real `claude` with the original argv, emits `csub: --output-format is not supported under plan mode; this call will bill against API` to stderr, increments `bypassCount`, and exits with the real `claude`'s exit code.

**Feedback loop:** Integration test mocking `real-claude-resolver` and the exec call: with `CLAUDE_USE_SUB=1` plus a fail-open flag, assert real-claude is invoked with the unmodified argv, the stderr warning matches the expected format and names the offending flag, and `bypassCount` increments by 1. A counter-case with only allowlisted flags asserts the PTY path runs and `bypassCount` does not increment.

**Human checkpoint:** no

**Depends on:** state-bypass-count, fail-open-detector

# PRD: Expand supported flags

## Problem Statement

`claude-plan-wrapper` currently forwards only `--model`/`-m` and `--verbose`/`-v` from `claude -p` invocations through to the PTY-routed plan-mode session. Every other flag — including ones orchestrators like ralph and dispatch rely on heavily (`--append-system-prompt`, `--add-dir`, `--permission-mode`, `--allowedTools`, `--mcp-config`, `--agents`, etc.) — hard-errors with an "unsupported flag" message.

This means that today, opting into `CLAUDE_USE_SUB=1` for any non-trivial orchestrator workflow is impractical: ralph and dispatch can't run, and the shim's plan-mode billing benefit is unreachable for the workflows that would benefit most. With roughly a month of runway before Anthropic restricts plan-mode billing for `-p`, expanding coverage now is the highest-leverage change.

A secondary concern: some `claude -p` flags genuinely can't be supported under a plaintext PTY (`--output-format stream-json`, `--resume`, etc.). Hard-erroring on these breaks orchestrators outright; silently bypassing them traps users into thinking they're billing against their plan when they're not.

## Solution

Expand the shim's allowlist to cover the flags orchestrators actually use, forwarded as startup CLI args to the spawned interactive `claude`. For flags that are structurally incompatible with the PTY (structured I/O, session continuity), implement **loud fail-open** routing: detect them up front, exec the real `claude` with the original argv, write a one-line stderr warning so the user knows the call did not bill against their plan, and increment a bypass counter in the state file so usage can be inspected later.

Unknown flags continue to hard-error with the supported-list message — existing behavior preserved.

## User Stories

1. As an orchestrator (ralph, dispatch) running many `claude -p` calls, I want my `--append-system-prompt`, `--add-dir`, `--permission-mode`, `--allowedTools`, `--mcp-config`, and `--agents` flags forwarded to the PTY session, so my workflow runs under plan-mode billing without code changes.
2. As an orchestrator using `--output-format stream-json` for progress parsing, I want the shim to fall back to the real `claude -p` for that call so my parser keeps working, even if that call bills against API.
3. As a user who opted into `CLAUDE_USE_SUB=1`, I want to be told (via stderr) when a call falls back to API billing, so I'm never surprised by usage that didn't route through my plan.
4. As a user, I want unsupported / unknown flags to keep hard-erroring loudly, so typos and unsupported flags don't silently degrade to API mode.
5. As a user, I want variadic flags like `--add-dir dir1 dir2 dir3` and `--mcp-config a.json b.json` to be parsed correctly so I can pass multiple values the way `claude` itself accepts them.
6. As an operator, I want the bypass count tracked in the state file so I can later inspect how often calls escape plan mode and why.
7. As a maintainer, I don't want the shim to re-encode `claude`'s value enums (e.g. valid `--permission-mode` choices) — let `claude` validate, so the shim doesn't drift when upstream changes.

## Implementation Decisions

### Flag categories

Three behaviors, decided up front per flag:

**Forward to PTY (v1 allowlist additions, in addition to existing `--model`/`-m`, `--verbose`/`-v`):**
- `--append-system-prompt <prompt>`
- `--system-prompt <prompt>`
- `--add-dir <directories...>` (variadic)
- `--permission-mode <mode>`
- `--allowedTools` / `--allowed-tools <tools...>` (variadic)
- `--disallowedTools` / `--disallowed-tools <tools...>` (variadic)
- `--dangerously-skip-permissions`
- `--mcp-config <configs...>` (variadic)
- `--settings <file-or-json>`
- `--agent <agent>`
- `--agents <json>`
- `--plugin-dir <path>` (repeatable)
- `--strict-mcp-config`
- `--bare`
- `--tools <tools...>` (variadic)

**Loud fail-open (detect → exec real `claude` with original argv → stderr warning → bump counter):**
- Structured I/O: `--output-format`, `--input-format`, `--include-partial-messages`, `--include-hook-events`, `--replay-user-messages`, `--json-schema`
- Session continuity: `--resume`/`-r`, `--continue`/`-c`, `--session-id`, `--fork-session`, `--from-pr`, `--no-session-persistence`
- Print-only / billing-incompatible: `--max-budget-usd`

**Hard error (existing behavior):** Anything else starting with `-`.

### Modules to modify

- **`flag-mapper.ts`** — Extend `parseArgs` to handle variadic flags (slurp tokens until the next `-`-prefixed arg) and to expand `SUPPORTED_VALUE_FLAGS` / `SUPPORTED_BOOL_FLAGS` to cover the v1 allowlist. No value validation against `claude`'s enums.
- **New module: fail-open detector** — A pre-parse pass over raw argv that returns either `{bypass: false}` or `{bypass: true, reason: "<flag-name>"}`. Lives separately from `parseArgs` because it must run *before* parsing, on the original argv, and must not depend on the allowlist logic.
- **Routing path (likely `shim.ts` / `shim-logic.ts`)** — When `CLAUDE_USE_SUB=1` and the fail-open detector returns `bypass: true`: write one stderr line (`csub: <flag> is not supported under plan mode; this call will bill against API`), bump bypass counter via `state.ts`, exec the real `claude` resolved by `real-claude-resolver.ts` with original argv, exit with its exit code. Otherwise, fall through to existing parse + PTY path.
- **`state.ts`** — Add `bypassCount: number` field to `State` interface with default `0`; persist alongside `interceptCount`. No reader UI in this PRD — exposing it via `doctor` or a new subcommand is out of scope.

### Forwarding mechanism

All forwarded flags pass through as **CLI args to the spawned interactive `claude` process**, the same path `--model`/`--verbose` use today via `passthroughArgs`. No slash-command injection inside the PTY for any flag.

### Variadic parsing rule

For flags in a `VARIADIC_FLAGS` set: after consuming the flag token, collect subsequent tokens into the value list until either (a) the next token starts with `-`, or (b) end of argv. Then continue parsing from that token. Repeatable flags (`--plugin-dir A --plugin-dir B`) work without special-casing because each occurrence is parsed independently.

### Error message

Unknown / unsupported-without-fail-open flags continue to produce the existing message format, but the "Supported flags" list grows. Keep the message generated from the source-of-truth allowlist constant so it stays in sync.

## Testing Decisions

Existing test patterns live under `src/__tests__/`. Mirror those.

- **`flag-mapper` unit tests:** one case per new flag confirming it lands in `passthroughArgs`; variadic cases for `--add-dir`, `--mcp-config`, `--allowedTools`, `--disallowedTools`, `--tools` (single value, multiple values, value followed by another flag); repeatable case for `--plugin-dir`; negative case for an unknown flag still erroring; positive case confirming the supported-flags list is rendered in the error.
- **Fail-open detector unit tests:** one case per fail-open flag confirming detection; a case confirming an allowlisted flag does *not* trigger bypass; a case confirming an unknown flag does *not* trigger bypass (it should hit the hard-error path instead).
- **Routing-path test:** with `CLAUDE_USE_SUB=1` and a fail-open flag in argv, assert that real `claude` is exec'd, the stderr warning is emitted, and `bypassCount` increments. Mock `real-claude-resolver` and the exec call following existing test patterns.
- **State test:** `bypassCount` persists across reads/writes and defaults to `0` for fresh state.

No end-to-end PTY test for each new flag — the forwarding mechanism is already covered by the existing `--model`/`--verbose` PTY tests, and adding 15 more PTY round-trips slows the suite without proportional value. Spot-check one or two of the more complex flags (`--mcp-config`, `--agents`) end-to-end.

## Out of Scope

- `--effort`, `--fallback-model`, `--setting-sources`, `--plugin-url`, `--name`/`-n`, `--debug`/`--debug-file`, `--ide`, `--worktree`, `--tmux`, `--remote-control`, `--betas`, `--exclude-dynamic-system-prompt-sections`, `--disable-slash-commands`, `--file`, `--chrome`/`--no-chrome`, `--allow-dangerously-skip-permissions`, `--brief` — niche or non-orchestrator; defer to a v2.
- Slash-command injection inside the PTY for any flag.
- A `csub status` or `doctor`-extension UI to surface `bypassCount` — counter is written now, reader UI deferred.
- Re-encoding `claude`'s value enums in the shim.
- Supporting piped stdin with `--input-format stream-json` (covered by fail-open, but no attempt to make it work under PTY).
- Any changes to `pty-runner.ts` beyond what's needed to pass the expanded `passthroughArgs` (which should be zero — it already forwards whatever it's given).

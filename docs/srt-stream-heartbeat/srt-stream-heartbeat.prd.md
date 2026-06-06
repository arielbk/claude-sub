# PRD: srt-aware stream-json with activity-gated heartbeat

## Problem Statement

`claude-sub` exists so that `claude -p` calls bill against a Claude subscription
instead of API credits. The real consumer is the `ralph` skill's loop
(`ralph.sh`), which now runs each iteration as
`claude -p --dangerously-skip-permissions --verbose --output-format stream-json`
inside Anthropic's `srt` sandbox-runtime (Seatbelt/bubblewrap).

Two things stop this from being the promised drop-in:

1. **`--output-format stream-json` is treated as unsupported.** With `csub on`,
   the shim's fail-open detector sees `--output-format` and bypasses straight to
   the real `claude`, printing a stderr warning that the call "will bill against
   API." So ralph iterations under the sandbox keep billing API — the exact leak
   claude-sub was built to close — even though routing is enabled.

2. **A PTY produces plain text, not a JSON event stream.** ralph's `jq` pipeline
   parses stream-json: it echoes assistant text live and sentinel-checks the
   final `result` event for `<promise>COMPLETE</promise>`. claude-sub has no way
   to feed that pipeline, and there is no liveness signal during a multi-minute
   iteration — the only thing the host learns today is whether the call errored.

The user wants confidence that ralph-on-`srt` works as a true drop-in, billing
on-plan, across the circumstances they actually run.

## Solution

Teach claude-sub to **emulate** stream-json, not reject it — the same philosophy
that already makes it emulate interactive mode for a non-interactive call.

When routing is on and the invocation requests `--output-format stream-json`, the
shim runs its normal PTY session but emits a Claude-compatible NDJSON event
stream on stdout:

- **During the run:** a heartbeat event, emitted at most once every ~10s and only
  when new bytes have actually arrived from the PTY. This is a real proof-of-life
  — when interactive Claude genuinely stalls, the stream goes quiet, so a watcher
  (the user or a spawning agent) can decide to intervene. Nothing acts on the
  heartbeat automatically.
- **At the end:** the final assistant message event plus the single `result`
  event carrying the full clean reply (from the existing extractor), which is what
  ralph sentinel-checks.

The result: ralph runs **unmodified** under `srt` with `csub on`, its `jq`
pipeline is satisfied, and iterations bill against the plan.

## User Stories

1. As a ralph user, I want `claude -p --output-format stream-json` to route
   through my subscription when `csub on`, so my sandboxed loop iterations stop
   billing API.
2. As a ralph user, I want the shim to emit a stream-json stream ralph's existing
   `jq` filters can parse (`assistant` text events and a final `result` event),
   so I don't have to fork or edit `ralph.sh`.
3. As a watcher of a running iteration, I want a heartbeat on the stream that
   appears only while the model is actually producing output, so I can tell the
   difference between "still working" and "wedged."
4. As a watcher, I want the heartbeat to never falsely report life during a hang,
   so I can trust it enough to intervene (try another avenue, kill the process).
5. As a claude-sub user, I want the final `result` event to carry the same clean,
   sentinel-stripped text the plain-text path already produces, so output quality
   doesn't regress.
6. As a ralph user running inside `srt`, I want claude-sub to spawn its PTY
   session successfully under the sandbox's filesystem/network restrictions, so
   routing works in the environment I actually run in.
7. As a claude-sub user, I want every non-stream-json invocation (plain `-p`,
   passthrough, genuinely unsupported flags like `--resume`) to behave exactly as
   it does today, so this change is additive.

## Implementation Decisions

**Flag parsing (`flag-mapper`).** Recognize `--output-format stream-json` as a
*supported* invocation rather than rejecting it. Parse the requested output mode
out of the args and surface it on the parse result (e.g. `plain` vs
`stream-json`), so the shim knows which emitter to use. The `--output-format`
value is consumed by the shim, not passed through to interactive Claude (the PTY
session is always plain-text internally). `--verbose` continues to pass through.
Values other than `stream-json` (e.g. `json`) remain unsupported for now.

**Fail-open detection (`fail-open-detector`).** Stop bypassing when
`--output-format`'s value is `stream-json`. The flag must no longer be a blanket
member of the bypass set; the decision becomes value-aware. All other fail-open
flags (`--resume`, `--continue`, `--session-id`, …) keep bypassing unchanged.

**Stream-json emitter (new deep module).** Encapsulate the Claude stream-json
event schema behind a small interface so nothing else in the codebase hard-codes
JSON shapes. Responsibilities:
- format a heartbeat event,
- format the final assistant message event from the clean reply,
- format the terminal `result` event from the clean reply.
The event shapes must satisfy ralph's filters: live echo selects
`.type=="assistant" → .message.content[] → .type=="text" → .text`; the outcome
check selects `.type=="result" → .result`. This module is pure
string/object-shaping and is unit-testable in isolation.

**PTY runner (`pty-runner`).** Add an optional activity callback invoked when new
bytes arrive from the PTY, throttled so it fires at most once per heartbeat
interval (~10s) and only on genuine new output. Existing behavior — settle/idle
timers, sentinel detection, final `extractReply` — is unchanged; the callback is
purely observational. Plain-text callers pass no callback and see no difference.

**Shim orchestration (`shim`).** When the parsed output mode is `stream-json`:
wire the PTY runner's activity callback to write heartbeat events to stdout as
they occur, and on success write the final assistant + `result` events instead of
the plain reply line. On timeout/idle failure, surface the failure in a way
consistent with stream-json consumers (diagnostic to stderr; non-zero exit as
today). When the mode is `plain`, the existing single-line stdout path is
untouched.

**`srt` sandbox compatibility.** Expected to be primarily a verification task
rather than new shim code: under `srt`, claude-sub runs on the host filesystem, so
node-pty's native binding and the real `claude` binary are already present. The
open risk is whether the sandbox's allow-list grants what a PTY-spawned
interactive Claude needs — pseudo-terminal device access, node-pty's
`spawn-helper` execution, interactive session-state writes, and `*.anthropic.com`
network. If the ralph-generated settings fall short, the deliverable is the
minimal settings additions (and, if useful, documentation of them) — not a
redesign.

## Testing Decisions

Prior art: tests live in `src/__tests__` (vitest). `pty-runner` already supports
an injected `spawner` for deterministic tests without real processes, and there
are snapshot tests in the suite — both patterns apply here.

- **Stream-json emitter** — unit tests asserting the emitted event objects match
  the Claude schema and, concretely, that ralph's two `jq` extractions
  (`assistant` text, `result.result`) recover the expected strings. This is the
  highest-value module to test because ralph's correctness depends on the exact
  shape.
- **Flag mapper** — `--output-format stream-json` parses to the stream-json mode
  and is not rejected; other `--output-format` values and unsupported flags still
  error; existing supported flags unaffected.
- **Fail-open detector** — `--output-format stream-json` no longer bypasses;
  `--resume` and the rest still do.
- **PTY runner heartbeat** — with an injected spawner emitting bytes over time and
  fake timers, assert the activity callback fires only on new output and is
  throttled to the interval; assert silence produces no heartbeat.
- **Acceptance (manual, the "done when")** — a full `ralph.sh` run under `srt`
  with `csub on` completing end-to-end: no flag rejection / API-bypass warning,
  sentinel detected, heartbeat visible on the stream, no fallback to API.

## Out of Scope

- Deeper Docker-sandbox support — the existing `install-sandbox.ts` path is left
  as-is.
- Real per-frame incremental text extraction — the heartbeat is liveness, not the
  actual partial reply; the full text arrives in the final `result` event.
- Any automatic action on the heartbeat (idle-kill, retries) — it is purely
  observational.
- Programmatic proof that iterations billed on-plan — the on-plan property follows
  from the unchanged PTY-routes-through-interactive mechanism; verify out of band
  via the usage dashboard if needed.
- `--output-format json` (single non-streaming JSON) — only `stream-json` is in
  scope.

## Open Questions

- **Heartbeat event type & visibility.** Should the heartbeat be an `assistant`
  text event (flows through ralph's existing live echo, but risks polluting the
  visible transcript) or a distinct event type (clean, but invisible to ralph's
  current text-only `jq` echo, so a watcher of ralph's terminal output wouldn't
  see it)? Recommendation to validate: an `assistant` text event with a minimal
  marker so liveness is visible without noise.
- **PTY idle/overall timeouts vs long iterations.** `pty-runner` defaults to a 30s
  idle timeout and 5-min overall max. Long ralph iterations with quiet "thinking"
  stretches could trip a false idle failure under `srt`. Confirm whether these
  defaults hold in practice or need adjusting for confidence.
- **`srt` settings sufficiency.** Confirm empirically whether ralph's generated
  sandbox settings already permit PTY allocation + node-pty `spawn-helper`, or
  whether a minimal allow-list addition is required.

# PRD: Output-mode seam (srt-stream-heartbeat architecture cleanup)

## Problem Statement

The srt-stream-heartbeat work taught `claude-sub` to emulate
`--output-format stream-json`. It works and is well-tested, but the knowledge of
*"the caller asked for stream-json"* ended up smeared across three modules
instead of living in one place:

1. **Two parsers independently read `--output-format`.** Both the flag mapper
   (which decides the requested mode) and the fail-open detector (which decides
   whether to bypass to the real `claude`) re-implement the same value
   extraction — the `--output-format value` vs `--output-format=value` split —
   and both hard-code the `"stream-json"` literal. They must agree, but nothing
   makes them agree; they're kept in lockstep by hand. Adding a future supported
   value, or changing how the flag is tokenized, means editing both in step.

2. **The shim branches on the mode twice.** The orchestrator conditionally wires
   the heartbeat callback, then later conditionally picks the final-output shape.
   It knows both rendering shapes (plain reply line vs heartbeat + assistant +
   result events) inline. The "how do I render a PTY run's lifecycle to stdout"
   strategy has no home — it's two `if`s in the shim.

This is friction, not a bug. The behavior is correct and shipping; the cost is
locality (one concept, three edit sites) and testability (the render shapes are
only exercised through full subprocess shim tests).

## Solution

Make **output mode** a first-class concept that is *parsed once* and *rendered
once*.

- **Parsed once:** a single module owns reading `--output-format` from argv and
  answering what was requested (absent / stream-json / unsupported value /
  missing value). The flag mapper and the fail-open detector both consume that
  one answer instead of each re-deriving it. The supported-values policy lives in
  exactly one place.

- **Rendered once:** a stdout renderer seam, chosen once from the resolved mode.
  Two adapters satisfy it — a `plain` renderer (no-op on activity; writes the
  reply line on finish) and a `stream-json` renderer (writes a heartbeat event on
  activity; writes the assistant + result events on finish). The shim selects the
  renderer once and stops knowing the shapes; the existing `stream-json-emitter`
  stays as the pure JSON-schema layer beneath the stream-json adapter.

This is a quality-only refactor. No observable behavior changes: same flags
supported, same bypass decisions, same bytes on stdout/stderr, same exit codes.

## User Stories

1. As a maintainer adding a future `--output-format` value, I want one module to
   edit so the flag mapper and fail-open detector can't drift out of agreement.
2. As a maintainer, I want the supported-output-values policy to be the test
   surface of a single small module, rather than asserted indirectly through two
   parsers.
3. As a maintainer adding a future output rendering, I want to write one new
   renderer adapter and touch the shim's selection point once — not add a third
   `if` to the orchestrator.
4. As a maintainer, I want the plain and stream-json render shapes unit-testable
   through the renderer interface, not only through full subprocess shim tests.
5. As a user of `claude-sub`, I want this change to be invisible — every existing
   invocation (plain `-p`, stream-json, unsupported `--output-format`,
   passthrough, fail-open flags) behaves exactly as before.

## Implementation Decisions

**Output-mode parser (new deep module).** Owns the `--output-format` vocabulary.
Given argv, returns a discriminated result distinguishing: no flag present, a
supported stream-json request, a present-but-unsupported value (carrying the
value for error/diagnostic messages), and a present-but-missing value. This is
pure argv-in / answer-out and unit-testable in isolation. It also exports the
`OutputMode` type (`plain | stream-json`) used downstream.

**Flag mapper.** Consumes the output-mode parser for both the mode decision and
its `--output-format` error messages, and stops re-implementing value extraction.
Its loop keeps responsibility only for *tokenization* — skipping the
`--output-format` flag (and its value, in either syntax) so it isn't forwarded to
the real `claude` PTY invocation. The parse result surfaces the resolved mode.
Consider replacing the optional `outputFormat?: "stream-json"` field with a
non-optional `outputMode: OutputMode` defaulting to `plain`, to remove the
undefined-vs-value ambiguity — only if the test churn stays small.

**Fail-open detector.** Consumes the output-mode parser to decide the
`--output-format`-specific bypass (bypass on unsupported / missing value; don't
bypass on stream-json or absent). `--output-format` leaves the generic fail-open
flag set; all other fail-open flags (`--resume`, `--continue`, `--session-id`, …)
keep bypassing exactly as today.

**Output renderer (new module / seam).** A small interface — an activity hook and
a finish(reply) hook — with two adapters selected from the resolved mode. The
plain adapter is a no-op on activity and writes `${reply}\n` on finish; the
stream-json adapter writes a heartbeat event on activity and the assistant +
result events on finish, delegating shape to the existing emitter. The renderer
writes through an injected `write` function so it's testable without a real
stdout.

**Shim orchestration.** Resolves the mode from the parse result, builds the
renderer once, passes `renderer`'s activity hook as the PTY runner's `onActivity`,
and calls `renderer.finish(result.reply)` on success. No per-mode `if`s remain in
the shim. Wiring a no-op activity hook in plain mode is acceptable: the PTY
runner already runs its heartbeat timer unconditionally and optional-chains the
callback, so a no-op changes nothing observable.

**PTY runner.** Unchanged. The heartbeat timer, activity gating, transcript
polling, and `extractReply`/transcript resolution are untouched by this refactor.

## Testing Decisions

Prior art: vitest suites in `src/__tests__`, pure-function unit tests for the
flag mapper and fail-open detector, an injected `spawner` for the PTY runner, and
subprocess tests for the shim.

- **Output-mode parser** — direct unit tests for each result variant: absent,
  `--output-format stream-json`, `--output-format=stream-json`, an unsupported
  value, and a missing value. This becomes the single home for the
  supported-values policy.
- **Flag mapper / fail-open detector** — existing tests stay green; they now
  exercise the shared parser transitively. Adjust only assertions tied to a
  renamed field (`outputFormat` → `outputMode`) if that rename is taken.
- **Output renderer** — new unit tests driving each adapter through the interface
  with an injected `write`, asserting: plain emits nothing on activity and one
  reply line on finish; stream-json emits a heartbeat event on activity and the
  assistant + result events on finish (the same shapes ralph's two `jq`
  extractions already depend on).
- **Shim** — existing subprocess tests stay green unchanged; they are the
  regression guard proving no observable behavior changed.

The bar for "done": full `pnpm build` + `pnpm test` green with the same test
count (plus the new parser/renderer unit tests), and no diff in stdout/stderr/exit
behavior for any existing invocation.

## Out of Scope

- Any change to the heartbeat timing, transcript polling, or reply extraction in
  the PTY runner.
- Supporting additional `--output-format` values (e.g. `json`) — the refactor
  makes that a one-module change later, but does not do it now.
- Changing the stream-json event schema or the emitter's output.
- `srt` sandbox settings, README/docs content, or anything outside the five
  modules named above.

## Open Questions

- Whether to rename `outputFormat?: "stream-json"` to `outputMode: OutputMode` on
  the parse result, or keep the existing field name to minimize test churn.
  Decide during implementation based on how many assertions move.

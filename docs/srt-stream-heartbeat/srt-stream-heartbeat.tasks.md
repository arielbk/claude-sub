# srt-aware stream-json with activity-gated heartbeat

Make `claude-sub` a true drop-in inside Anthropic's `srt` sandbox-runtime: emulate
`--output-format stream-json` over the PTY (final assistant + `result` events) with
an activity-gated heartbeat, so `ralph.sh` runs unmodified and bills against the
plan instead of the API.

## Slices

### `stream-json-output` — Route stream-json through the plan and emit a parseable stream

**Status:** done

**Outside-in:** `claude -p --output-format stream-json "say OK"` under `csub on` exits 0 and prints NDJSON whose final `result` event's `.result` is the clean reply (and an `assistant` event whose `.message.content[].text` carries it) — no "will bill against API" bypass warning.

**Feedback loop:** Unit tests on the new emitter (ralph's two `jq` extractions — `.type=="assistant"|.message.content[]|select(.type=="text").text` and `.type=="result"|.result` — recover the expected strings); flag-mapper test that `--output-format stream-json` parses to stream-json mode and is not rejected; fail-open-detector test that `stream-json` no longer bypasses while `--resume` et al. still do; manual: real `claude -p --output-format stream-json "say OK"` piped through `jq` yields a result event containing OK.

**Human checkpoint:** no

**Depends on:** none

### `activity-heartbeat` — Activity-gated heartbeat events during the run

**Status:** done

**Outside-in:** A long-running `claude -p --output-format stream-json` invocation emits heartbeat events on the stream while the model is producing output, and goes quiet when the PTY genuinely stalls.

**Feedback loop:** pty-runner unit test with an injected spawner + fake timers asserting the activity callback fires at most once per ~10s interval and only when new bytes arrived (silence → no heartbeat); manual: watch a real iteration and confirm periodic heartbeats, then confirm a stalled session stops emitting.

**Human checkpoint:** no

**Depends on:** stream-json-output

### `srt-acceptance` — Full ralph-on-srt run bills on-plan

**Status:** needs-review

**Outside-in:** `ralph.sh <feature>` run under `srt` with `csub on` completes end-to-end — no API-bypass warning, `<promise>COMPLETE</promise>` sentinel detected, heartbeat visible on the stream, no fallback to the API.

**Feedback loop:** Manual acceptance — a real ralph run goes green under the sandbox; if PTY allocation / node-pty `spawn-helper` exec / interactive session-state writes are blocked, add the minimal `srt` settings additions to unblock and re-run; eyeball the usage dashboard out of band to confirm on-plan billing.

**Human checkpoint:** yes

**Depends on:** stream-json-output, activity-heartbeat

### `docs-prime-time` — README matches reality

**Status:** needs-review

<!-- RESERVED: the orchestrator (Claude) owns this slice and will implement it
     directly after the ralph-codex loop finishes the implementation slices.
     Held as needs-review so the loop treats it as settled and steps past it. -->


**Outside-in:** README no longer lists `--output-format stream-json` under "Known limitations"; it documents stream-json support, the heartbeat behavior, and what events are emitted.

**Feedback loop:** Human review — README reflects the shipped behavior; the supported-flags table and limitations section are accurate against slices 1–2.

**Human checkpoint:** no

**Depends on:** stream-json-output, activity-heartbeat

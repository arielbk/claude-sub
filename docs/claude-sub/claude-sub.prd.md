# PRD: claude-sub

## Resources

- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) — Anthropic support article describing the June 15, 2026 change that moves `claude -p` and Agent SDK usage off main plan limits and onto a separate monthly credit (Pro $20, Max 5x $100, Max 20x $200, Team Standard $20, Team Premium $100, Enterprise $20/$200). This is the load-bearing motivation for the project.
- Existing host-side shim source: `src/shim.ts`, `src/pty-runner.ts`, `src/real-claude-resolver.ts`, `src/flag-mapper.ts`, `src/output-extractor.ts`, `src/diagnostic-formatter.ts` — the PTY-based `claude -p` interceptor that this PRD wraps with the on/off switch.
- Ralph skill that motivates the sandbox install path: `~/Projects/sandbox/arielbk-skills/skills/engineering/ralph/` (`ralph.sh`, `SKILL.md`).
- Docker sandbox CLI: `docker sandbox` (template image `docker/sandbox-templates:claude-code`, Ubuntu 25.10 + node 20).

## Problem Statement

Today the shim works but is too friction-heavy to actually adopt: a user has to globally install it, manually verify PATH ordering, export `CLAUDE_USE_SUB=1` in their shell profile, and remember to unset it. There is no easy "on" or "off." Ralph users, who are the most obvious beneficiaries, additionally run `claude -p` inside a Docker sandbox where the shim isn't even on the PATH.

This becomes urgent on June 15, 2026, when `claude -p` stops counting against the main plan usage limits and starts drawing from a small monthly Agent SDK credit (as little as $20/mo on Pro) that can be drained by a single Ralph run. Without a low-friction switch, paid-plan users running agentic `-p` loops will hit a hard wall.

## Solution

Ship `claude-sub` — an npm package that wraps the existing shim with a file-based on/off switch and a one-shot sandbox installer. A user runs `npm i -g claude-sub`, then `csub on` to route every subsequent `claude -p` invocation through interactive Claude (main plan budget), and `csub off` to revert. Ralph scripts and any other `-p` consumers keep working without modification — the switch is environmental, not API-level.

For Docker-sandbox users, `csub install-sandbox <sandbox-name>` performs the same setup inside the sandbox VM so loops that run there also route through the plan.

## User Stories

1. As a Pro-plan user running long Ralph loops, I want a single command to turn the shim on before a session and off after, so I don't have to edit my shell profile or remember environment variables.
2. As a Max-plan power user whose `-p` workloads exceed my monthly SDK credit, I want my existing Ralph scripts to keep working unmodified once the switch is on, so adoption costs nothing.
3. As a first-time installer, I want a `csub doctor` command that tells me whether the shim actually intercepts `claude -p`, so I learn about a misordered PATH immediately instead of silently burning SDK credit.
4. As a Ralph user running inside a Docker sandbox, I want a single `csub install-sandbox` command that sets up the shim inside my existing sandbox, so I don't have to manually shell in and patch the sandbox's `claude` binary.
5. As a user who occasionally wants to bypass the switch for one run (e.g. to deliberately use SDK credit), I want an environment variable override that wins against the file state, so I don't have to toggle and re-toggle the global switch.
6. As a user who has forgotten the current state, I want `csub status` to tell me whether the switch is on or off and how many calls have been intercepted recently, so I can verify the tool is doing what I expect.
7. As a maintainer of the package, I want the existing `claude-plan-wrapper` package name retired cleanly (no users yet, no migration story) so the published surface area matches the new name.

## Implementation Decisions

**Package and naming.** Package name: `claude-sub`. Bin: `csub`. Env var (unchanged from today): `CLAUDE_USE_SUB`. The current `claude-plan-wrapper@0.1.0` is unpublished — rename in `package.json` and publish fresh under the new name; no deprecation shim.

**On/off state.** A small JSON file at `~/.config/claude-sub/state.json` (XDG-compliant; same path inside sandbox). Presence of `{ "enabled": true }` means on, absence (or `false`) means off. Optional counter field for `status` reporting. The shim reads this file on every invocation.

**Precedence.** If `CLAUDE_USE_SUB` is explicitly set in the process environment, it wins. Otherwise the state file decides. This preserves the existing one-off invocation pattern (`CLAUDE_USE_SUB=0 ralph foo`).

**CLI surface.** Four subcommands:
- `csub on` — write the state file with `enabled: true`, then run the doctor check and report.
- `csub off` — write the state file with `enabled: false` (or delete it).
- `csub status` — print on/off, the state file path, and an "intercepted N calls since X" line from the counter.
- `csub doctor` — verify `which -a claude` resolves the shim first, that the real claude is discoverable behind it, and that the state file is readable. Print remediation lines (specifically: the exact `export PATH=...` line to add to the user's shell profile) when something is wrong. Never edit the user's shell profile automatically.
- `csub install-sandbox <name>` — shell out to `docker sandbox exec <name>` to install the shim inside the sandbox VM, replacing `/home/agent/.local/bin/claude` with a wrapper that resolves the real claude at `/home/agent/.local/share/claude/versions/*/cli.js`. Node 20 inside the sandbox is the build target.

**Shim behaviour.** Unchanged from today except for one read of the state file. When the switch is off, pass through to the real `claude -p` exactly as today's default-passthrough mode does. When on, route through PTY interactive Claude exactly as today's `CLAUDE_USE_SUB=1` mode does. Increment the counter on successful interception.

**No automatic PATH editing.** `csub on` and `csub doctor` both stop short of writing to shell profiles. They surface the exact line to add and let the user own that change.

**No process wrapping, no Ralph awareness.** The CLI does not spawn subprocesses around user commands. It is purely a state toggle. Ralph (and every other `-p` consumer) keeps running exactly as before.

**Module sketch.**
- `state` — read/write the JSON state file. Single source of truth, mocked freely in tests.
- `cli` — argv parsing and subcommand dispatch.
- `doctor` — PATH and real-claude discovery; returns a structured diagnostic (good/bad + remediation strings) that the CLI prints.
- `sandbox-installer` — shells out to `docker sandbox exec`, handles node 20 / native-module concerns, idempotent.
- `shim` (existing) — gains one new branch that consults `state` when the env var is unset.

## Testing Decisions

The shim already has a test suite (`src/__tests__/`); reuse the pattern. New tests:

- `state` module: round-trip read/write, missing file behaviour, malformed JSON behaviour.
- `cli` subcommand handlers: each subcommand against a mocked state module — assertions on state transitions and exit codes only, not on print output.
- `doctor`: feed in mocked `which -a claude` results (shim-first, real-first, missing entirely) and assert the structured diagnostic.
- `shim` integration: env-var-set, env-var-unset-state-on, env-var-unset-state-off — each must produce the existing observable behaviour (pass-through vs PTY interception).
- `sandbox-installer`: smoke-test against a real sandbox in a follow-up e2e test (gated behind an env flag like the existing `CLAUDE_USE_SUB_E2E`). Unit-test the bash payload generation independently.

No need to re-test the existing PTY runner, flag mapper, or output extractor — they don't change.

## Out of Scope

- Custom Docker sandbox image / template publication. Acknowledged as nice-to-have for a future major version; explicitly not v1.
- Ralph-specific CLI, process wrapping (`csub -- <cmd>`), or any feature that requires modifying users' existing Ralph scripts.
- Per-call budget banner on stderr. Counter-via-`csub status` covers the transparency need without spamming stderr.
- Automatic PATH editing in `~/.zshrc` / `~/.bashrc` / `~/.config/fish/config.fish`.
- Support for users on free or API-key-only accounts — the project's value proposition is plan-based billing and that requires a paid plan.
- Telemetry beyond a local-only counter.
- Resume/state-of-loop tracking for Ralph (lives in Ralph, not here).

## Open Questions

- None outstanding. Implementation can begin from this PRD.

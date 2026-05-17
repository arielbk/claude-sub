# PRD: claude-plan-wrapper

## Resources

- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) — Anthropic support article describing the upcoming billing change that motivates this project. SDK and `claude -p` (non-interactive) usage will be billed at API pricing, while interactive `claude` sessions remain on the user's Claude plan.

## Problem Statement

Starting next month, Anthropic will bill `claude -p` and Claude Agent SDK usage at API pricing, separately from the user's existing Claude Max/Pro plan. Users who run automated agents and scripts via `claude -p` will see their costs shift from a flat subscription to per-token API charges, even though they are already paying for a Claude plan that allows interactive use.

Interactive `claude` sessions continue to be covered by the plan. There is no built-in mechanism for routing `-p`-style one-shot prompts through the interactive code path.

## Solution

A small wrapper that, when explicitly opted-in via an environment variable, intercepts `claude -p "prompt"` invocations and serves them by spawning an *interactive* Claude session under a pseudo-terminal (PTY), feeding it the prompt, scraping the assistant's reply, and printing it to stdout — so the call behaves identically to `claude -p` from the caller's perspective but bills against the user's Claude plan.

The wrapper is installed as a PATH shim that appears earlier in `PATH` than the real `claude` binary. It only activates when `CLAUDE_USE_PLAN=1` is set. When unset (the default), the shim passes through to the real `claude` unchanged — installing the wrapper does not alter any default behavior.

Response completion is detected via a sentinel token. The wrapper spawns interactive Claude with `--append-system-prompt` instructing the model to emit a unique token on its own line at the end of every response. The wrapper reads PTY output until it sees the sentinel, strips it, and returns the cleaned reply.

## User Stories

1. As an agent author, I want my existing `claude -p "..."` scripts to route through my Claude plan when I opt in, so that I do not pay API rates for usage my subscription already covers.
2. As an agent author, I want the wrapper off by default after installation, so that installing it never silently re-routes my billing or changes behavior I did not ask for.
3. As an agent author, I want a single env var (`CLAUDE_USE_PLAN=1`) to opt in, so I can toggle billing modes per-command, per-shell, or globally without reconfiguring anything.
4. As an agent author, I want concurrent `claude -p` invocations to run in parallel (not serialized behind a lock), so that fan-out workloads keep their throughput.
5. As an agent author, I want `--model` and `--add-dir` to pass through to the interactive session, so that scripts pinning a model or working directory still work.
6. As an agent author, I want unsupported `-p` flags to fail loudly with a clear error, so I never silently get different behavior than I asked for.
7. As an agent author, I want a generous-but-finite timeout on each call, so a hung session fails fast as a verification error rather than blocking the orchestrator forever.
8. As an agent author, I want stdin-piped prompts (`echo "..." | claude -p`) to work, so existing shell pipelines do not need to be rewritten.
9. As an agent author, I want invocations without `-p` (interactive `claude`, `claude --help`, etc.) to pass through to the real binary unchanged regardless of `CLAUDE_USE_PLAN`, so the shim is invisible to non-`-p` usage.
10. As an agent author, I want the wrapper to exit with a non-zero status and an informative diagnostic when the sentinel never appears, so failures are machine-detectable.

## Implementation Decisions

**Language and runtime:** Node + TypeScript, distributed as an npm package installable via `pnpm add -g`. Justified by ecosystem alignment with Claude Code itself, best-in-class PTY support via `node-pty`, and the author's familiarity with the stack.

**Package manager:** pnpm, single-package layout (no monorepo). Five internal modules live as files under `src/` rather than as separate packages — they have one consumer (the shim), one release, and no independent value. Promote to a monorepo only if a module gains an external consumer.

**Module sketch:**

- **shim** — entrypoint. Parses argv, detects `-p` and `CLAUDE_USE_PLAN`. If both present, delegates to the wrapper pipeline; otherwise `exec`s the real `claude` with original argv intact.
- **real-claude-resolver** — locates the real `claude` binary by walking `PATH` and skipping the shim's own directory. Cached per-process.
- **flag-mapper** — translates the supported subset of `-p` flags (initially `--model`, `--add-dir`, and the prompt itself) into their interactive equivalents. Rejects any unknown flag with a clear error pointing to the supported list.
- **pty-runner** — spawns interactive `claude` under `node-pty` with mapped flags plus `--append-system-prompt` carrying the sentinel instruction. Writes the user's prompt as keystrokes into the PTY. Returns a readable stream of raw bytes.
- **output-extractor** — accumulates PTY bytes, strips ANSI escape sequences, watches for the sentinel token on its own line, and returns the cleaned reply with the sentinel and any trailing whitespace removed. Enforces an overall timeout (configurable, default suggested: 5 minutes) and a per-byte idle timeout as a secondary safety net.

**Sentinel design:** A unique token chosen at install time and persisted in the wrapper's config (e.g. `<<<CWEND_8f3a9b2c>>>` with a random suffix), so it is vanishingly unlikely to collide with any legitimate response content. The `--append-system-prompt` text instructs the model to emit the token on its own line at the end of every response and to not mention the instruction.

**Opt-in semantics:** The shim's default behavior (env unset) is to `exec` the real `claude` immediately, with zero parsing of `-p`. Only when `CLAUDE_USE_PLAN=1` is set does the shim inspect argv for `-p` and engage the wrapper. Non-`-p` invocations always passthrough regardless of the env var.

**Concurrency:** Each invocation is self-contained — its own PTY, its own interactive Claude process, its own sentinel — so concurrent calls run in parallel with no locking.

**Timeouts:** Two layers. (a) An overall wall-clock timeout per invocation (default 5 minutes, configurable via `CLAUDE_USE_PLAN_TIMEOUT_MS`); exceeding it kills the PTY, exits non-zero, and writes a diagnostic dump (raw recent bytes, ANSI-stripped view) to stderr. (b) A per-byte idle timeout as a defense against a stuck-but-not-yet-overall-timed-out session.

**Install mechanism:** The published npm package's `bin` field installs a `claude` executable into the user's pnpm global bin directory. Users must ensure that directory appears in `PATH` before the directory containing the real `claude` for the shim to take effect. The README will explain how to verify ordering (`which -a claude`).

**Failure modes that exit non-zero with diagnostics:**
- Sentinel never appears within the overall timeout.
- Interactive `claude` exits before emitting the sentinel.
- Unsupported flag passed.
- Real `claude` binary cannot be located on PATH.

## Testing Decisions

**Unit-tested:**
- `output-extractor` — pure function over byte streams; highest correctness risk. Cover: clean reply with sentinel at end, sentinel split across two read chunks, ANSI escape sequences interleaved with content, sentinel never arrives (timeout path), trailing whitespace/newlines stripped correctly, content that coincidentally contains text resembling the sentinel prefix but not the full token.
- `flag-mapper` — deterministic; cover the supported allowlist, each rejection case, and the prompt-extraction path.

**Integration-tested:**
- `pty-runner` round-trip — spawn a real interactive `claude`, send a trivial prompt (e.g. `"reply with the single word OK"`), assert the captured reply contains `OK` and nothing else (after extractor). Gated by an env var so it only runs locally / in environments with a logged-in `claude`.
- `shim` end-to-end — invoke the built shim binary as a subprocess with `-p` both with and without `CLAUDE_USE_PLAN=1`; assert correct passthrough vs wrapper behavior.

**Test framework:** vitest (fast, TypeScript-native, watch mode). `tsx` for dev runs.

**No prior art in this codebase** — fresh project.

## Out of Scope

- Full Claude Agent SDK protocol emulation: no `--output-format json` or `--output-format stream-json` (text output only), no SDK-style tool-use round-trip handling, no synthesized JSON envelope with `session_id`/`total_cost_usd`/etc.
- Session continuity: no `--resume` or `--continue` support; every invocation is a fresh interactive session.
- Daemon mode: no long-lived background Claude process to amortize startup cost. Every call pays the interactive-Claude boot time (~2–5s).
- Full flag passthrough: only the supported allowlist (`--model`, `--add-dir` initially) is honored; unsupported flags error out.
- Permission UI handling beyond what `--dangerously-skip-permissions` or pre-configured settings can provide; the wrapper does not interactively answer permission prompts.
- Cross-platform parity: initial target is macOS + Linux. Windows support is not in scope for v1.
- Auto-installation into `PATH`: users are responsible for ensuring the shim's directory precedes the real `claude` in `PATH`. The README explains how.

## Open Questions

- Should the wrapper auto-pass `--dangerously-skip-permissions` to interactive Claude to keep sessions non-blocking, or should it require the user to pre-configure permissions via `.claude/settings.json`? The former is more convenient but expands the blast radius of any prompt; the latter is safer but more setup. Defer until first real integration test reveals which prompts actually block.
- What is the right default overall timeout? 5 minutes is a generous starting point but may be too short for long tool-use chains. Revisit after observing real-world distributions.
- Does the sentinel need to be unique per-install, or is a single hardcoded constant token sufficient? A hardcoded token is simpler; a per-install random suffix is strictly safer against collision. Lean toward hardcoded with a sufficiently unlikely string until a collision is observed.

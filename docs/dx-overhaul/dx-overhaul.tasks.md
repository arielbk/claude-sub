# DX Overhaul

Rename the package to `claude-sub`, switch dev + install to pnpm, kill the env-var toggle in favor of `csub on`/`off`, ship a one-command `npx claude-sub setup`/`uninstall` flow that handles PATH, and rewrite the README around the new UX with a ToS disclaimer.

## Slices

### `rename-and-pnpm` — Rename package and switch to pnpm

**Status:** done

**Outside-in:** `package.json` `name` is `claude-sub`; repo builds with `pnpm install && pnpm build`; `pnpm-lock.yaml` is tracked; `package-lock.json` is removed; `packageManager` field pins pnpm.

**Feedback loop:** `pnpm install && pnpm build && pnpm test` all green on a clean clone.

**Human checkpoint:** no

**Depends on:** none

---

### `remove-env-toggle` — Remove CLAUDE_USE_SUB env-var as toggle

**Status:** done

**Outside-in:** `resolveUsePty(envVar, stateEnabled)` returns `stateEnabled` regardless of `envVar`. The shim consults only the state file for the enable/disable decision. `CLAUDE_USE_SUB_TIMEOUT_MS` stays (it's a timeout config, not a toggle).

**Feedback loop:** Existing unit tests for `resolveUsePty` updated to assert env var no longer overrides state; full vitest suite green.

**Human checkpoint:** no

**Depends on:** none

---

### `setup-command` — `csub setup` / `npx claude-sub setup`

**Status:** not-started

**Outside-in:** Running `npx claude-sub setup` (or `csub setup` post-install) detects the user's shell (`zsh` / `bash` / `fish`), prints the planned rc-file edit as a diff, prompts `[y/N]`, writes the line (with a marker comment so `uninstall` can reverse it) on confirmation, then verifies `which claude` resolves to the shim and prints success or a remediation hint. Leaves enabled state `false`. Supports `--non-interactive` to skip the prompt.

**Feedback loop:** Unit tests for the setup module covering: zsh / bash / fish detection; rc file missing vs present; marker line already present (idempotent no-op); user declines confirmation (no write); `--non-interactive` path. Manual smoke on a fresh shell: `npx claude-sub setup` from the local tarball produces a working `which claude` → shim.

**Human checkpoint:** yes — review the diff/confirmation UX (wording, default answer, marker comment format) before merging.

**Depends on:** rename-and-pnpm

---

### `uninstall-command` — `csub uninstall` / `npx claude-sub uninstall`

**Status:** not-started

**Outside-in:** Running `npx claude-sub uninstall` removes the rc-file line identified by the marker comment written by `setup`, uninstalls the global package, and confirms each step with the user. No-op cleanly if the marker line is absent or the global package isn't installed.

**Feedback loop:** Unit tests covering: marker present and removed cleanly; marker missing (no-op); global package present vs absent. Manual smoke: round-trip `setup` → `uninstall` leaves the rc file byte-identical to its pre-setup state.

**Human checkpoint:** no

**Depends on:** setup-command

---

### `readme-rewrite` — README terminology, ToS, install rewrite

**Status:** in-progress

> Reserved for Claude (orchestrator) — Codex iterations must skip this slice. The user wants prose written by Claude directly.

**Outside-in:** README opens with a one-line description, then a one-sentence ToS disclaimer (names Anthropic ToS, links to Anthropic Claude Code docs), then a short "what it does" paragraph. Install section is the single command `npx claude-sub setup`. Usage section explains `csub on`/`off`/`status`. PATH troubleshooting and manual install path move to a Troubleshooting section. The words "plan" / "plan mode" / "plan wrapper" no longer appear as references to this project (prose uses "subscription"; identifiers stay "sub"). The "CLAUDE_USE_SUB opt-in" section is removed.

**Feedback loop:** Human review: a stranger reading the README top-to-bottom can get from zero to a working `claude -p` call in one command, with no PATH-ordering or env-var steps required. `grep -i "plan mode\|plan wrapper" README.md` returns nothing.

**Human checkpoint:** yes — README content is judgment-driven; user signs off before merge.

**Depends on:** remove-env-toggle, setup-command

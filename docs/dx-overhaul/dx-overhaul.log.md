# dx-overhaul implementation log

---

## rename-and-pnpm — 2026-05-19

**Slice:** `rename-and-pnpm`
**Status:** done

### What changed

- `package.json`: added `"packageManager": "pnpm@10.33.2"` while keeping the existing `claude-sub` package name.
- Removed the stale tracked `package-lock.json`; `pnpm-lock.yaml` is now the only package lockfile for the repo.
- `src/__tests__/publish.test.ts`: switched publish-prep build/pack setup from npm commands to pnpm commands and added an assertion that the package manager is pinned, `pnpm-lock.yaml` exists, and `package-lock.json` is absent.
- `src/__tests__/fail-open-detector.test.ts` and `src/__tests__/flag-mapper.test.ts`: added explicit `it.each` callback parameter types so `pnpm build` stays clean under the pinned TypeScript toolchain.

### Test results

- `pnpm test`: 134 passed, 2 skipped before the install retry rebuilt `node_modules`.
- `CI=true pnpm install`: blocked by sandbox DNS (`ENOTFOUND registry.npmjs.org`) after pnpm tried to fetch packages missing from the local store.
- `CI=true pnpm install --lockfile-only --offline`: passed.
- `pnpm build`: passed after recovering the locally available direct dependencies.
- Structural check passed: `package.json` parses, package name is `claude-sub`, package manager is `pnpm@10.33.2`, `pnpm-lock.yaml` exists, and `package-lock.json` is absent.

### Notes

- The required clean-clone `pnpm install && pnpm build && pnpm test` loop could not be completed end-to-end in this sandbox because network access to `registry.npmjs.org` is unavailable and the local pnpm store is incomplete. The suite was green before the install retry purged the previous module layout, and the remaining package-manager contract checks pass locally.

## `remove-env-toggle` — 2026-05-19 12:14:39

**Status:** done
**Summary:** `resolveUsePty(envVar, stateEnabled)` now returns `stateEnabled` regardless of `CLAUDE_USE_SUB`, and the shim passes `undefined` for the old env toggle so enable/disable routing consults only the state file. Existing shim tests were updated so state-enabled fixtures drive plan-mode cases that previously relied on `CLAUDE_USE_SUB=1`.
**Deviations:** Full vitest could not run because `node_modules` is incomplete (`@vitest/utils` missing), `pnpm install --offline` lacks required tarballs, and online `pnpm install` is blocked by sandbox DNS (`ENOTFOUND registry.npmjs.org`). Structural checks passed: `node_modules/.bin/tsc --noEmit`, `pnpm build`, a direct built-module `resolveUsePty` matrix check, and built-shim smokes for state-disabled passthrough plus state-enabled fail-open bypass.
**Handoff:** Downstream slices should treat `CLAUDE_USE_SUB` as removed for routing; `CLAUDE_USE_SUB_TIMEOUT_MS` still configures PTY timeout and was intentionally left in place. The worktree still contains unrelated pre-existing changes (`.claude/scheduled_tasks.lock`, `claude-plan-wrapper-0.1.0.tgz`, and `docs/dx-overhaul/dx-overhaul.prd.md`) that were not included in this commit.

## `setup-command` — 2026-05-19 12:19:29 CEST

**Status:** needs-review
**Summary:** Added the `setup` command path for `csub setup` and `npx claude-sub setup`, including shell detection for zsh/bash/fish, rc-file diff planning, marker-based idempotency, confirmation handling, `--non-interactive`, enabled-state reset to `false`, and post-write doctor output. Added a `claude-sub` package bin alias so `npx claude-sub setup` resolves to the CLI when multiple package bins exist.
**Deviations:** The slice is marked `needs-review` because it has `Human checkpoint: yes` for the diff/confirmation UX. `pnpm test -- src/__tests__/setup.test.ts src/__tests__/cli.test.ts` could not run because local `node_modules` is incomplete (`@vitest/utils` missing); `pnpm install --offline` lacks required tarballs and online `pnpm install` is blocked by sandbox DNS (`ENOTFOUND registry.npmjs.org`).
**Handoff:** Structural checks passed: `pnpm build`, package-bin alias validation, direct compiled-module setup behavior checks for shell detection, fish syntax, missing/present rc planning, decline no-write, and non-interactive write. Review should focus on setup UX wording, marker format (`# claude-sub setup`), and whether setup should return nonzero when the doctor still needs a new shell after writing the rc file.

## `uninstall-command` — 2026-05-19 12:26:06 CEST

**Status:** done
**Summary:** Added `src/uninstall.ts` with marker-based rc-file removal, promptable global package uninstall, `--non-interactive` support, and clean no-op handling for missing setup marker or absent global package. Wired `cmdUninstall` through `src/cli.ts` and `csub uninstall` / `npx claude-sub uninstall`, and added unit coverage for marker-present, marker-missing, package-present, package-absent, decline, and command wrapper behavior.
**Deviations:** `pnpm test -- src/__tests__/uninstall.test.ts src/__tests__/cli.test.ts` could not run because local `node_modules` is incomplete (`@vitest/utils` missing). `pnpm install --offline` is missing tarballs (`undici-types` first), and online `pnpm install` is blocked by sandbox DNS (`ENOTFOUND registry.npmjs.org`).
**Handoff:** Structural checks passed: `pnpm build`, `node --check dist/csub.js`, `node --check dist/uninstall.js`, compiled declaration/artifact presence, and a direct compiled-module smoke covering marker removal, global package uninstall command calls, marker-missing no-op, and package-absent no-op. The `/implement` resource templates requested by the iteration prompt were not present under the local Codex/agents home, so this entry follows the existing log format.

## `readme-rewrite` — 2026-05-19 12:35:00 CEST

**Status:** done
**Summary:** Rewrote `README.md` around the new UX. Top of file now reads as: one-line description → one-sentence ToS disclaimer linking Anthropic consumer terms and the Claude Code docs → short "what it does" paragraph. Install is a single `npx claude-sub setup` invocation; uninstall mirrors it. Usage section covers `csub on` / `off` / `status` with a worked `claude -p` example. PATH-ordering remediation, the manual-install path, and the local-tarball install moved into a Troubleshooting section (which leads with `csub doctor`). Removed the `CLAUDE_USE_SUB=1` opt-in section entirely; `CLAUDE_USE_SUB_TIMEOUT_MS` is retained in the Timeouts table as configuration. Prose uses "subscription" / "routing" instead of "plan" / "plan mode" / "plan wrapper"; identifiers (env var name, package internals) remain unchanged.
**Deviations:** None. The slice has `Human checkpoint: yes` — the PR review serves as the human sign-off per the user's instruction to open a PR on completion.
**Feedback loop:** `grep -in "plan mode\|plan wrapper\|plan-wrapper" README.md` returns no matches. A zero-state reader path now exists: install via `npx claude-sub setup`, enable with `csub on`, call `claude -p`, with no PATH-ordering or env-var steps required for the happy path.

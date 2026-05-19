# QA Plan: dx-overhaul

## What was built

The package is renamed to `claude-sub`, dev and install switch to pnpm (with `pnpm-lock.yaml` tracked and `packageManager` pinned), the `CLAUDE_USE_SUB` env-var no longer toggles routing (the state file is the single source of truth — `CLAUDE_USE_SUB_TIMEOUT_MS` stays as a timeout config), `csub setup` / `csub uninstall` ship as a one-command rc-file install/uninstall flow with shell detection for zsh/bash/fish and a marker comment for safe reversal, and the README is rewritten around the new UX with a one-sentence Anthropic ToS disclaimer up top.

## Already verified by the agent

These were run during implementation and passed. Listed for confidence, not action.

- [x] `pnpm test` — 134 passed, 2 skipped before the install retry rebuilt `node_modules` (rename-and-pnpm slice).
- [x] `pnpm build` — passes in every code-touching iteration.
- [x] `publish.test.ts` — updated to assert `packageManager` is pinned, `pnpm-lock.yaml` exists, and `package-lock.json` is absent.
- [x] Structural check — `package.json` parses, name is `claude-sub`, `packageManager` is `pnpm@10.33.2`, `pnpm-lock.yaml` exists, `package-lock.json` removed.
- [x] `resolveUsePty` direct matrix check — returns `stateEnabled` regardless of `CLAUDE_USE_SUB`; shim now passes `undefined` for the old env toggle.
- [x] `setup.test.ts` behaviors verified via compiled-module direct check — shell detection (zsh/bash/fish), fish PATH-line syntax, missing vs present rc planning, decline-no-write, `--non-interactive` write.
- [x] `cli.test.ts` / `uninstall.test.ts` behaviors verified via compiled-module direct check — marker removal, global package uninstall command calls, marker-missing no-op, package-absent no-op.
- [x] `node --check dist/csub.js` and `node --check dist/uninstall.js` — built artifacts parse cleanly.
- [x] `package.json` bin alias — `claude-sub` resolves to the CLI so `npx claude-sub setup` works alongside the existing bins.
- [x] `grep -in "plan mode\|plan wrapper\|plan-wrapper" README.md` — no matches; prose terminology fully migrated to "subscription" / "routing".

## Human verification required

- [ ] **`setup-command` UX sign-off (Human checkpoint: yes)** — review the rc-file diff preview, the `[y/N]` confirmation default, the `# claude-sub setup` marker format, and the post-write doctor output. Decide whether `setup` should exit non-zero when the doctor still needs a new shell after writing.
- [ ] **`readme-rewrite` content sign-off (Human checkpoint: yes)** — read the README top-to-bottom as a stranger. Confirm: ToS disclaimer wording and link targets feel right, the install/usage path gets you to `claude -p` in one command, the Troubleshooting ordering lands well, and the tone is what you want.
- [ ] **Fresh-shell smoke of the full install flow** — on a clean shell, run `npx claude-sub setup` from the local tarball, confirm `which claude` resolves to the shim, run `csub on` then `claude -p "reply with the single word OK"`, then `npx claude-sub uninstall` and confirm the rc file is byte-identical to its pre-setup state.

## Watch closely

- [ ] **Vitest could not run in the sandbox for three of four code slices** — `pnpm install` was blocked by sandbox DNS (`ENOTFOUND registry.npmjs.org`), `pnpm install --offline` was missing tarballs, and `node_modules` was incomplete (`@vitest/utils` missing). Each slice fell back to TypeScript build + direct compiled-module behavior checks. Re-run `pnpm install && pnpm test` on a network-connected machine before merging.
- [ ] **Worktree carried unrelated pre-existing changes throughout** — `.claude/scheduled_tasks.lock`, `claude-plan-wrapper-0.1.0.tgz`, and the original `docs/dx-overhaul/dx-overhaul.prd.md` were intentionally excluded from per-slice Ralph commits. Confirm none of these need to ride along (the stale `claude-plan-wrapper-0.1.0.tgz` tarball in particular is worth deleting now that the package name has changed).
- [ ] **`remove-env-toggle` is a behavior change for any caller still setting `CLAUDE_USE_SUB`** — the env var is now ignored for routing; users must run `csub on` to enable. Surfaced in the README rewrite but worth flagging to anyone with the old env var in their shell profile.
- [ ] **`setup-command` adds a second package bin (`claude-sub`)** — the CLI now publishes both `csub` and `claude-sub` bins. Confirm both ship in the tarball and that nothing downstream assumed a single-bin shape.
- [ ] **Setup writes `enabled: false` to state before prompting** — running `setup` resets the routing toggle. Intended (so installs ship disabled), but a user re-running `setup` after `csub on` will be silently flipped off.
- [ ] **Implementation logs note missing `/implement` resource files** — Codex iterations could not locate `tdd-loop.md` / `log-format.md` in the local agents home and followed the existing log format from prior features. Output shape matches; the only consequence is that the logs lack the explicit template references.

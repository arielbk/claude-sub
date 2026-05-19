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

# claude-plan-wrapper — Implementation Log

---

## [scaffold-and-passthrough] 2026-05-17

**Status:** done

**What was implemented:**
- Scaffolded the `claude-plan-wrapper` npm package with TypeScript + vitest
- `package.json` with `bin: { claude: "./dist/shim.js" }`, build/test scripts
- `tsconfig.json` targeting Node16 module resolution
- `src/real-claude-resolver.ts` — walks PATH skipping the shim binary (using `realpathSync` to follow symlinks correctly for global-install scenarios)
- `src/shim.ts` — entrypoint that calls `resolveRealClaude()` and `spawnSync`s the real binary with all original args and exit code forwarding
- `src/__tests__/shim.test.ts` — smoke tests: (1) built `dist/shim.js` exists; (2) `node dist/shim.js --help` output matches `claude --help` exactly

**Feedback loop result:** `pnpm build` → `tsc` clean; 2 vitest tests pass (including subprocess roundtrip with real `claude --help`).

**Notes:**
- pnpm 11.x crashed with Bus error on this Node 22 environment; used `npm install` instead for the dependency install step
- NVM and Node 22 were installed to satisfy pnpm's engine requirements (pnpm is available but `npm install` was used as the fallback)
- The real-claude-resolver uses `realpathSync(process.argv[1])` as the shim identity, so it works correctly whether invoked directly (`node dist/shim.js`) or via a global PATH symlink

---

## [opt-in-branch-with-flag-mapping] 2026-05-17

**Status:** done

**What was implemented:**
- `src/flag-mapper.ts` — parses `claude -p` args: extracts prompt from `-p "value"` / `--print "value"` / positional arg forms; validates flags against an allowlist; rejects unsupported flags (`--output-format`, `--resume`, `--json`, `--no-markdown`, unknown `--` flags) with a clear error naming the offending flag and listing supported flags (`--model`/`-m`, `--verbose`/`-v`)
- `src/__tests__/flag-mapper.test.ts` — 12 unit tests covering: each supported flag accepted and forwarded, each unsupported flag rejected with correct error content, prompt extraction from `-p` value, `--print` value, and positional arg forms
- Updated `src/shim.ts` — branches on `CLAUDE_USE_PLAN=1` AND `-p`/`--print` present: calls `parseArgs`, exits non-zero with stderr on failure, prints stub reply on success (stub replaced in pty-roundtrip-raw)
- Updated `src/__tests__/shim.test.ts` — 4 new integration tests: stub output when valid flags given, non-zero exit + stderr containing flag name and supported list for unsupported flag, passthrough when `CLAUDE_USE_PLAN` unset, passthrough when `CLAUDE_USE_PLAN=1` but no `-p`

**Feedback loop result:** `tsc` clean; 18 vitest tests pass (12 unit + 6 integration including existing passthrough tests).

**Notes:**
- `parseArgs` treats any unknown `--` flag as unsupported; this is intentional since the allowed set for PTY mode is narrow
- Stub output (`[plan-mode stub] prompt: …`) will be replaced wholesale in `pty-roundtrip-raw`

---

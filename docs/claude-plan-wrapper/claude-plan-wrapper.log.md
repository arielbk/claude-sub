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

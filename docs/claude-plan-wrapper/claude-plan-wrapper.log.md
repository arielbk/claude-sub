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

## [pty-roundtrip-raw] 2026-05-17

**Status:** done

**What was implemented:**
- Installed `node-pty` (required installing `g++`/`make` via apt for native bindings to compile)
- `src/pty-runner.ts` — `runUnderPty(prompt, passthroughArgs, opts?)` spawns the real `claude` binary under a PTY (xterm-256color, 200×50), waits `initialDelayMs` (default 2s) for the TUI to initialize, sends the prompt as keystrokes followed by `\n`, then watches for the output to settle (`settleMs` default 5s of no new data), and terminates with Ctrl-C / kill before returning the raw PTY byte stream and exit code
- `src/__tests__/pty-runner.e2e.test.ts` — integration test gated on `CLAUDE_USE_PLAN_E2E=1`; invokes the built shim subprocess with `CLAUDE_USE_PLAN=1 -p "reply with the single word OK"` and asserts `stdout` contains `OK` and `status === 0`
- Updated `src/shim.ts` — replaced the stub with `await runUnderPty(parsed.prompt, parsed.passthroughArgs)` using top-level await; writes `rawOutput` to stdout and exits with `exitCode`; PTY errors go to stderr with exit 1
- Updated `src/__tests__/shim.test.ts` — gated the plan-mode integration test under `CLAUDE_USE_PLAN_E2E=1` since it now invokes real Claude via PTY

**Feedback loop result:** `tsc` clean; `npm test` (non-e2e): 17 pass, 2 skipped; `CLAUDE_USE_PLAN_E2E=1 npm test`: 19 pass in ~9s (PTY roundtrip completed in ~8s).

**Notes:**
- `node-pty` requires native compilation; installed `g++`/`make` via apt-get in the sandbox
- The settle heuristic (5s of no new PTY bytes after sending the prompt) is intentionally conservative; it will be superseded by sentinel-based detection in `sentinel-and-clean-extraction`
- Raw PTY output includes ANSI escapes and TUI chrome; `OK` is present in the stream, satisfying the slice's outside-in requirement

---

## [sentinel-and-clean-extraction] 2026-05-17

**Status:** done

**What was implemented:**
- `src/output-extractor.ts` — exports `SENTINEL` (`__PLAN_MODE_DONE_7a3b9f__`), `SENTINEL_SYSTEM_PROMPT` (the `--append-system-prompt` instruction Claude will receive), `stripAnsi(raw)` (strips ANSI/VT escape sequences and normalises `\r\n`/`\r` to `\n`), and `extractReply(raw)` (finds sentinel line, returns cleaned text before it with trailing whitespace stripped; returns `found:false` with clean text if sentinel absent)
- `src/__tests__/output-extractor.test.ts` — 12 unit tests covering: plain text passthrough, SGR strip, cursor-movement strip, `\r\n`/`\r` normalisation, clean reply with sentinel, sentinel split across chunks (accumulated buffer), ANSI interleaved with content, trailing whitespace stripped, sentinel-prefix substring not matching full token, no-sentinel case, multi-line reply
- Updated `src/pty-runner.ts` — prepends `["--append-system-prompt", SENTINEL_SYSTEM_PROMPT]` to spawn args; terminates the PTY early when `rawOutput.includes(SENTINEL)`; `PtyRunResult` gains a `reply` field (result of `extractReply(rawOutput).reply`)
- Updated `src/shim.ts` — writes `reply + "\n"` to stdout instead of `rawOutput`, so callers receive clean text
- Updated `src/__tests__/pty-runner.e2e.test.ts` — E2E test now asserts: no ANSI in stdout, no sentinel token in stdout, `stdout.trim() === "OK"`

**Feedback loop result:** `tsc` clean; 29 vitest tests pass, 2 E2E-gated tests skipped (require `CLAUDE_USE_PLAN_E2E=1`).

**Notes:**
- Sentinel-based early termination supersedes the settle heuristic for happy-path responses; settle still acts as a fallback if Claude doesn't emit the sentinel
- `--append-system-prompt` is a real `claude` CLI flag; it injects an extra system prompt suffix without modifying the user's configured system prompt
- The `extractReply` sentinel scan operates on the fully accumulated PTY buffer, so "split across chunks" is handled naturally by the caller accumulating before calling the function

---

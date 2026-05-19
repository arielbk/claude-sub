## `variadic-allowlist` — 2026-05-19 10:52:02

**Status:** done
**Summary:** Added variadic flag parsing for `--add-dir`, `--mcp-config`, `--allowedTools`/`--allowed-tools`, `--disallowedTools`/`--disallowed-tools`, `--tools`, and `--plugin-dir`. Variadic groups now forward all values until the next flag or end of argv, and repeated groups are preserved.
**Deviations:** Full `npm test` was attempted but hit unrelated environment failures: `npm pack` cannot write to `/Users/arielbk/.npm/_cacache/tmp`, and two shim passthrough tests compare against a real `claude` subprocess with `status === null` in this sandbox.
**Handoff:** `npm test -- --run src/__tests__/flag-mapper.test.ts` passes with 25 tests, and `npm run build` passes. Variadic values are delimited by the next token beginning with `-`; missing values use the existing `Flag {flag} requires a value` parse failure shape.

## `state-bypass-count` — 2026-05-19 11:10:30

**Status:** done
**Summary:** Added `bypassCount` to the persisted `State` shape with a default of `0`, read-time fallback for missing or malformed values, and partial-write preservation through the existing merge path. Updated state tests to cover defaults, round-trip persistence, partial writes, malformed JSON fallback, and written JSON content.
**Deviations:** The `/implement` resource lookup was slow but the required templates were eventually found and read; no implementation deviations.
**Handoff:** `readState()` now always returns `bypassCount`, so TypeScript callers constructing `State` fixtures must include it. `npm test -- --run src/__tests__/state.test.ts src/__tests__/cli.test.ts` and `npm run build` pass.

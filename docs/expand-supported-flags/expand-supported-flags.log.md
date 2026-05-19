## `variadic-allowlist` — 2026-05-19 10:52:02

**Status:** done
**Summary:** Added variadic flag parsing for `--add-dir`, `--mcp-config`, `--allowedTools`/`--allowed-tools`, `--disallowedTools`/`--disallowed-tools`, `--tools`, and `--plugin-dir`. Variadic groups now forward all values until the next flag or end of argv, and repeated groups are preserved.
**Deviations:** Full `npm test` was attempted but hit unrelated environment failures: `npm pack` cannot write to `/Users/arielbk/.npm/_cacache/tmp`, and two shim passthrough tests compare against a real `claude` subprocess with `status === null` in this sandbox.
**Handoff:** `npm test -- --run src/__tests__/flag-mapper.test.ts` passes with 25 tests, and `npm run build` passes. Variadic values are delimited by the next token beginning with `-`; missing values use the existing `Flag {flag} requires a value` parse failure shape.

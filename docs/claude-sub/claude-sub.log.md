# claude-sub implementation log

---

## package-rename — 2026-05-17

**Slice:** `package-rename`
**Status:** done

### What changed

- `package.json`: renamed `"name"` from `"claude-plan-wrapper"` to `"claude-sub"`; added `"csub": "./dist/shim.js"` to `"bin"` (kept existing `"claude"` entry); updated description.
- `src/__tests__/publish.test.ts`: updated `TARBALL_NAME` constant to `claude-sub-0.1.0.tgz`; added `pkg.bin.csub` assertion to the bin field test; added new test `"package.json declares name as claude-sub"`.

### Test results

- `publish.test.ts`: 11/11 pass (was 10/10 before, +1 new test).
- Pre-existing failures in `shim.test.ts` (3) and `timeouts.test.ts` (module load error) unchanged.

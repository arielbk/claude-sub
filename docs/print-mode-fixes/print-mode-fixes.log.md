# Print-mode fixes — implementation log

## `prompt-after-flags` — 2026-06-07 12:31:30

**Status:** done
**Summary:** Fixed the print-flag handler in `src/flag-mapper.ts` so `-p`/`--print` no longer steals a following flag as the prompt: the next argument is only taken as the prompt when it doesn't start with `-`; otherwise the prompt is picked up later as the first positional. Added 4 flag-mapper tests (flag-then-positional in both space and `=` forms, flags-only errors, bare `-p` errors).
**Deviations:** The old `Flag -p requires a value` error for a trailing bare `-p` is gone — that case now falls through to the standard `No prompt provided` error, which is more accurate (the prompt may legitimately arrive as a positional elsewhere in argv). No test depended on the old message.
**Handoff:** The print handler keeps the first prompt seen (`prompt === undefined` guard), consistent with the "first positional is the prompt" rule. Prompts that themselves start with `-` cannot follow `-p` directly — same limitation as upstream flag parsing. Full suite green (196 passed), `tsc` clean. Work happens on feature branch `print-mode-fixes`, one logical commit per slice, PR at the end.

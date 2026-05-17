#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveRealClaude } from "./real-claude-resolver.js";

const realClaude = resolveRealClaude();
const args = process.argv.slice(2);

// In this slice, unconditionally exec the real claude with all original args.
// Future slices will add the CLAUDE_USE_PLAN opt-in branch here.
const result = spawnSync(realClaude, args, {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? (result.signal ? 1 : 0));

#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveRealClaude } from "./real-claude-resolver.js";
import { parseArgs } from "./flag-mapper.js";

const args = process.argv.slice(2);
const usePlan = process.env.CLAUDE_USE_PLAN === "1";
const hasPrintFlag = args.some((a) => a === "-p" || a === "--print");

if (usePlan && hasPrintFlag) {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    process.stderr.write(`claude-plan-wrapper: ${parsed.error}\n`);
    process.exit(1);
  }

  // Stub output: replaced by actual PTY invocation in pty-roundtrip-raw slice
  process.stdout.write(`[plan-mode stub] prompt: ${parsed.prompt}\n`);
  process.exit(0);
}

const realClaude = resolveRealClaude();
const result = spawnSync(realClaude, args, {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? (result.signal ? 1 : 0));

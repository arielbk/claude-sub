#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveRealClaude } from "./real-claude-resolver.js";
import { parseArgs } from "./flag-mapper.js";
import { runUnderPty } from "./pty-runner.js";

const args = process.argv.slice(2);
const usePlan = process.env.CLAUDE_USE_PLAN === "1";
const hasPrintFlag = args.some((a) => a === "-p" || a === "--print");

if (usePlan && hasPrintFlag) {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    process.stderr.write(`claude-plan-wrapper: ${parsed.error}\n`);
    process.exit(1);
  }

  try {
    const { reply, exitCode } = await runUnderPty(
      parsed.prompt,
      parsed.passthroughArgs
    );
    process.stdout.write(reply + "\n");
    process.exit(exitCode);
  } catch (err) {
    process.stderr.write(`claude-plan-wrapper: PTY error: ${err}\n`);
    process.exit(1);
  }
}

const realClaude = resolveRealClaude();
const result = spawnSync(realClaude, args, {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? (result.signal ? 1 : 0));

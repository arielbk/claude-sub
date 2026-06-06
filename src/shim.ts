#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveRealClaude } from "./real-claude-resolver.js";
import { parseArgs } from "./flag-mapper.js";
import { runUnderPty } from "./pty-runner.js";
import { formatDiagnostic } from "./diagnostic-formatter.js";
import { readState } from "./state.js";
import { resolveUsePty, incrementInterceptCount, maybeRunFailOpenBypass } from "./shim-logic.js";
import { createOutputRenderer } from "./output-renderer.js";

const args = process.argv.slice(2);
const state = await readState();
const usePlan = resolveUsePty(undefined, state.enabled);
const hasPrintFlag = args.some((a) => a === "-p" || a === "--print");

if (usePlan && hasPrintFlag) {
  const failOpen = await maybeRunFailOpenBypass(args);
  if (failOpen.bypassed) {
    process.exit(failOpen.exitCode);
  }

  const parsed = parseArgs(args);
  if (!parsed.ok) {
    process.stderr.write(`claude-plan-wrapper: ${parsed.error}\n`);
    process.exit(1);
  }

  const timeoutMs = process.env.CLAUDE_USE_SUB_TIMEOUT_MS
    ? parseInt(process.env.CLAUDE_USE_SUB_TIMEOUT_MS, 10)
    : undefined;

  const renderer = createOutputRenderer(parsed.outputMode, (chunk) =>
    process.stdout.write(chunk)
  );

  try {
    const result = await runUnderPty(parsed.prompt, parsed.passthroughArgs, {
      maxMs: timeoutMs,
      onActivity: () => renderer.onActivity(),
    });
    if (!result.ok) {
      process.stderr.write(formatDiagnostic(result.reason, result.elapsedMs, result.rawOutput));
      process.exit(124);
    }
    await incrementInterceptCount();
    renderer.finish(result.reply);
    process.exit(result.exitCode);
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

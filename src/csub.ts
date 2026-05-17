#!/usr/bin/env node
import { cmdOn, cmdOff, cmdStatus } from "./cli.js";

const [, , cmd, ...rest] = process.argv;

if (rest.length > 0) {
  process.stderr.write(`csub: unexpected arguments: ${rest.join(" ")}\n`);
  process.exit(1);
}

let result: { exitCode: number; output?: string };

if (cmd === "on") {
  result = await cmdOn();
} else if (cmd === "off") {
  result = await cmdOff();
} else if (cmd === "status") {
  result = await cmdStatus();
} else {
  process.stderr.write(`csub: unknown command: ${cmd ?? "(none)"}\nUsage: csub on|off|status\n`);
  process.exit(1);
}

if (result.output) process.stdout.write(result.output + "\n");
process.exit(result.exitCode);

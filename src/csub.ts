#!/usr/bin/env node
import { cmdOn, cmdOff, cmdStatus, cmdDoctor, cmdInstallSandbox } from "./cli.js";

const [, , cmd, ...rest] = process.argv;

let result: { exitCode: number; output?: string };

if (cmd === "install-sandbox") {
  if (rest.length !== 1) {
    process.stderr.write("csub: install-sandbox requires exactly one argument: <sandbox-name>\nUsage: csub install-sandbox <name>\n");
    process.exit(1);
  }
  result = await cmdInstallSandbox(rest[0]);
} else {
  if (rest.length > 0) {
    process.stderr.write(`csub: unexpected arguments: ${rest.join(" ")}\n`);
    process.exit(1);
  }
  if (cmd === "on") {
    result = await cmdOn();
  } else if (cmd === "off") {
    result = await cmdOff();
  } else if (cmd === "status") {
    result = await cmdStatus();
  } else if (cmd === "doctor") {
    result = await cmdDoctor();
  } else {
    process.stderr.write(`csub: unknown command: ${cmd ?? "(none)"}\nUsage: csub on|off|status|doctor|install-sandbox <name>\n`);
    process.exit(1);
  }
}

if (result.output) process.stdout.write(result.output + "\n");
process.exit(result.exitCode);

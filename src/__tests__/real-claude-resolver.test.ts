import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIG_PATH = process.env.PATH;
const ORIG_ARGV1 = process.argv[1];

let tmp: string;

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "resolver-test-")));
});

afterEach(() => {
  process.env.PATH = ORIG_PATH;
  process.argv[1] = ORIG_ARGV1;
  rmSync(tmp, { recursive: true, force: true });
});

async function freshResolver() {
  vi.resetModules();
  const mod = await import("../real-claude-resolver.js");
  return mod.resolveRealClaude as () => string;
}

function makeExecutable(path: string, contents: string) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

describe("resolveRealClaude", () => {
  it("skips a shell-wrapper candidate that re-execs our shim.js", async () => {
    const shimPath = join(tmp, "shim.js");
    writeFileSync(shimPath, "// shim");
    process.argv[1] = shimPath;

    const wrapperDir = join(tmp, "wrapper-bin");
    const realDir = join(tmp, "real-bin");
    const wrapper = join(wrapperDir, "claude");
    const real = join(realDir, "claude");

    writeFileSync(join(tmp, "wrapper-bin-marker"), "");
    writeFileSync(join(tmp, "real-bin-marker"), "");
    // mkdtempSync doesn't create children; make them.
    require("node:fs").mkdirSync(wrapperDir);
    require("node:fs").mkdirSync(realDir);

    makeExecutable(
      wrapper,
      `#!/bin/sh\nbasedir=$(dirname "$0")\nexec node "$basedir/../.pnpm/claude-plan-wrapper@x/node_modules/claude-plan-wrapper/dist/shim.js" "$@"\n`
    );
    makeExecutable(real, "#!/bin/sh\necho real\n");

    process.env.PATH = `${wrapperDir}:${realDir}`;

    const resolve = await freshResolver();
    expect(resolve()).toBe(real);
  });

  it("skips a symlink candidate that resolves to our shim", async () => {
    const shimPath = join(tmp, "shim.js");
    writeFileSync(shimPath, "// shim");
    chmodSync(shimPath, 0o755);
    process.argv[1] = shimPath;

    const linkDir = join(tmp, "link-bin");
    const realDir = join(tmp, "real-bin");
    require("node:fs").mkdirSync(linkDir);
    require("node:fs").mkdirSync(realDir);

    symlinkSync(shimPath, join(linkDir, "claude"));
    const real = join(realDir, "claude");
    makeExecutable(real, "#!/bin/sh\necho real\n");

    process.env.PATH = `${linkDir}:${realDir}`;

    const resolve = await freshResolver();
    expect(resolve()).toBe(real);
  });
});

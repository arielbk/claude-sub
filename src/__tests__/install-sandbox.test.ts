import { describe, it, expect } from "vitest";
import { buildInstallPayload } from "../install-sandbox.js";

describe("buildInstallPayload", () => {
  it("matches snapshot", () => {
    expect(buildInstallPayload()).toMatchSnapshot();
  });

  it("includes idempotency check with 'already installed' marker", () => {
    const payload = buildInstallPayload();
    expect(payload).toContain("already installed");
    expect(payload).toContain("exit 0");
  });

  it("creates symlink bin/claude -> dist/shim.js", () => {
    const payload = buildInstallPayload();
    expect(payload).toContain("ln -sf");
    expect(payload).toContain("shim.js");
    expect(payload).toContain("$BIN_DIR/claude");
  });

  it("writes state.json with enabled: true and interceptCount: 0", () => {
    const payload = buildInstallPayload();
    expect(payload).toContain('"enabled": true');
    expect(payload).toContain('"interceptCount": 0');
  });

  it("prepends install bin dir to PATH in .bashrc", () => {
    const payload = buildInstallPayload();
    expect(payload).toContain(".bashrc");
    expect(payload).toContain("PATH");
    expect(payload).toContain("claude-sub");
  });

  it("starts with bash shebang and strict mode", () => {
    const payload = buildInstallPayload();
    expect(payload).toMatch(/^#!\/bin\/bash\n/);
    expect(payload).toContain("set -euo pipefail");
  });

  it("copies dist files from /tmp/csub-dist staging area", () => {
    const payload = buildInstallPayload();
    expect(payload).toContain("/tmp/csub-dist");
    expect(payload).toContain("cp -r");
  });
});

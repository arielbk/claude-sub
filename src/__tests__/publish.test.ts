import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const PROJECT_ROOT = join(import.meta.dirname, "../..");
const TARBALL_NAME = "claude-plan-wrapper-0.1.0.tgz";
const TARBALL_PATH = join(PROJECT_ROOT, TARBALL_NAME);

describe("publish-prep", () => {
  beforeAll(() => {
    // Build first, then pack
    execSync("npm run build", { cwd: PROJECT_ROOT, stdio: "pipe" });
    if (existsSync(TARBALL_PATH)) {
      execSync(`rm -f ${TARBALL_NAME}`, { cwd: PROJECT_ROOT });
    }
    execSync("npm pack", { cwd: PROJECT_ROOT, stdio: "pipe" });
  });

  afterAll(() => {
    if (existsSync(TARBALL_PATH)) {
      execSync(`rm -f ${TARBALL_NAME}`, { cwd: PROJECT_ROOT });
    }
  });

  it("pnpm pack produces a tarball", () => {
    expect(existsSync(TARBALL_PATH)).toBe(true);
  });

  it("tarball contains dist/shim.js", () => {
    const contents = execSync(`tar -tf ${TARBALL_NAME}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    expect(contents).toMatch(/package\/dist\/shim\.js/);
  });

  it("tarball contains package.json with correct bin field", () => {
    const contents = execSync(`tar -tf ${TARBALL_NAME}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    expect(contents).toMatch(/package\/package\.json/);

    const pkg = JSON.parse(
      execSync(`tar -xOf ${TARBALL_NAME} package/package.json`, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
      })
    );
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.claude).toMatch(/dist\/shim\.js/);
  });

  it("tarball contains README.md", () => {
    const contents = execSync(`tar -tf ${TARBALL_NAME}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    expect(contents).toMatch(/package\/README\.md/);
  });

  it("tarball does not contain src/ or test files", () => {
    const contents = execSync(`tar -tf ${TARBALL_NAME}`, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    expect(contents).not.toMatch(/package\/src\//);
    expect(contents).not.toMatch(/\.test\./);
  });

  describe("README sections", () => {
    let readme: string;

    beforeAll(() => {
      readme = readFileSync(join(PROJECT_ROOT, "README.md"), "utf8");
    });

    it("documents install steps", () => {
      expect(readme).toMatch(/install/i);
      expect(readme).toMatch(/pnpm|npm/i);
    });

    it("documents PATH ordering requirement", () => {
      expect(readme).toMatch(/PATH/);
    });

    it("documents CLAUDE_USE_SUB opt-in semantics", () => {
      expect(readme).toMatch(/CLAUDE_USE_SUB/);
    });

    it("documents supported flag allowlist", () => {
      expect(readme).toMatch(/--model/);
      expect(readme).toMatch(/--verbose/);
    });

    it("documents known limitations", () => {
      expect(readme).toMatch(/limitation|not supported|unsupported/i);
      expect(readme).toMatch(/--output-format|--resume/);
    });
  });
});

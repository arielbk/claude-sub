import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn(),
}));

vi.mock("../state.js", () => ({
  writeState: vi.fn(),
}));

import { runDoctor } from "../doctor.js";
import { writeState } from "../state.js";
import {
  detectShell,
  pathLineForShell,
  planSetup,
  rcFileForShell,
  setup,
} from "../setup.js";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runDoctor).mockResolvedValue({
    ok: true,
    message: "OK — shim is first on PATH",
  });
  vi.mocked(writeState).mockResolvedValue(undefined);
});

describe("detectShell", () => {
  it("detects zsh from SHELL", () => {
    expect(detectShell({ SHELL: "/bin/zsh" })).toBe("zsh");
  });

  it("detects bash from SHELL", () => {
    expect(detectShell({ SHELL: "/usr/local/bin/bash" })).toBe("bash");
  });

  it("detects fish from SHELL", () => {
    expect(detectShell({ SHELL: "/opt/homebrew/bin/fish" })).toBe("fish");
  });
});

describe("rcFileForShell", () => {
  it("maps zsh, bash, and fish to their rc files", () => {
    expect(rcFileForShell("zsh", "/home/me")).toBe("/home/me/.zshrc");
    expect(rcFileForShell("bash", "/home/me")).toBe("/home/me/.bashrc");
    expect(rcFileForShell("fish", "/home/me")).toBe("/home/me/.config/fish/config.fish");
  });
});

describe("planSetup", () => {
  it("plans a diff when the rc file is missing", async () => {
    const homeDir = await tempHome();
    const plan = await planSetup({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      binDir: "/pkg/bin",
    });

    expect(plan.alreadyPresent).toBe(false);
    expect(plan.diff).toContain(`--- ${homeDir}/.zshrc`);
    expect(plan.diff).toContain('+export PATH="/pkg/bin:$PATH" # claude-sub setup');
  });

  it("plans a diff when the rc file exists without the marker", async () => {
    const homeDir = await tempHome();
    await writeFile(join(homeDir, ".bashrc"), "alias ll='ls -la'\n", "utf8");

    const plan = await planSetup({
      env: { SHELL: "/bin/bash" },
      homeDir,
      binDir: "/pkg/bin",
    });

    expect(plan.alreadyPresent).toBe(false);
    expect(plan.diff).toContain('+export PATH="/pkg/bin:$PATH" # claude-sub setup');
  });

  it("is an idempotent no-op when the marker line already exists", async () => {
    const homeDir = await tempHome();
    await writeFile(
      join(homeDir, ".zshrc"),
      'export PATH="/pkg/bin:$PATH" # claude-sub setup\n',
      "utf8"
    );

    const plan = await planSetup({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      binDir: "/pkg/bin",
    });

    expect(plan.alreadyPresent).toBe(true);
    expect(plan.diff).toContain("already contains # claude-sub setup");
  });

  it("uses fish syntax for fish config", async () => {
    expect(pathLineForShell("fish", "/pkg/bin")).toBe(
      "fish_add_path --prepend '/pkg/bin' # claude-sub setup"
    );
  });
});

describe("setup", () => {
  it("does not write when the user declines confirmation", async () => {
    const homeDir = await tempHome();

    const result = await setup({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      binDir: "/pkg/bin",
      confirm: async () => false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.wrote).toBe(false);
    await expect(readFile(join(homeDir, ".zshrc"), "utf8")).rejects.toThrow();
    expect(runDoctor).not.toHaveBeenCalled();
    expect(writeState).toHaveBeenCalledWith({ enabled: false });
  });

  it("writes without prompting in non-interactive mode", async () => {
    const homeDir = await tempHome();
    const confirm = vi.fn(async () => false);

    const result = await setup({
      env: { SHELL: "/bin/bash" },
      homeDir,
      binDir: "/pkg/bin",
      nonInteractive: true,
      confirm,
    });

    expect(result.exitCode).toBe(0);
    expect(result.wrote).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    await expect(readFile(join(homeDir, ".bashrc"), "utf8")).resolves.toBe(
      'export PATH="/pkg/bin:$PATH" # claude-sub setup\n'
    );
    expect(writeState).toHaveBeenCalledWith({ enabled: false });
  });

  it("does not duplicate an existing marker line", async () => {
    const homeDir = await tempHome();
    const rcFile = join(homeDir, ".zshrc");
    await writeFile(rcFile, 'export PATH="/pkg/bin:$PATH" # claude-sub setup\n', "utf8");

    const result = await setup({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      binDir: "/pkg/bin",
      nonInteractive: true,
    });

    expect(result.wrote).toBe(false);
    await expect(readFile(rcFile, "utf8")).resolves.toBe(
      'export PATH="/pkg/bin:$PATH" # claude-sub setup\n'
    );
  });

  it("returns exit 0 when the rc line is written even if doctor flags the current shell", async () => {
    const homeDir = await tempHome();
    vi.mocked(runDoctor).mockResolvedValue({
      ok: false,
      message: "csub shim not found on PATH — run: npm install -g claude-sub",
    });

    const result = await setup({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      binDir: "/pkg/bin",
      nonInteractive: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.wrote).toBe(true);
    expect(result.output).toContain("Open a new shell, then run: csub doctor");
  });
});

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "claude-sub-setup-"));
}

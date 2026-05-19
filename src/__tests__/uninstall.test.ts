import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { planUninstall, uninstall } from "../uninstall.js";

describe("planUninstall", () => {
  it("plans marker removal when the rc file contains the setup line", async () => {
    const homeDir = await tempHome();
    await writeFile(
      join(homeDir, ".zshrc"),
      ['alias ll="ls -la"', 'export PATH="/pkg/bin:$PATH" # claude-sub setup', ""].join("\n"),
      "utf8"
    );

    const plan = await planUninstall({ env: { SHELL: "/bin/zsh" }, homeDir });

    expect(plan.markerPresent).toBe(true);
    expect(plan.diff).toContain('-export PATH="/pkg/bin:$PATH" # claude-sub setup');
  });

  it("is a no-op when the marker is missing", async () => {
    const homeDir = await tempHome();
    await writeFile(join(homeDir, ".bashrc"), "alias ll='ls -la'\n", "utf8");

    const plan = await planUninstall({ env: { SHELL: "/bin/bash" }, homeDir });

    expect(plan.markerPresent).toBe(false);
    expect(plan.diff).toContain("does not contain # claude-sub setup");
  });
});

describe("uninstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the marker line and uninstalls the global package", async () => {
    const homeDir = await tempHome();
    const rcFile = join(homeDir, ".zshrc");
    await writeFile(
      rcFile,
      ['alias ll="ls -la"', 'export PATH="/pkg/bin:$PATH" # claude-sub setup', "export EDITOR=vim", ""].join("\n"),
      "utf8"
    );
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "/pkg/lib/node_modules/claude-sub\n" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "removed\n" });

    const result = await uninstall({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      confirm: async () => true,
      runCommand,
    });

    expect(result.removedMarker).toBe(true);
    expect(result.uninstalledPackage).toBe(true);
    await expect(readFile(rcFile, "utf8")).resolves.toBe('alias ll="ls -la"\nexport EDITOR=vim\n');
    expect(runCommand).toHaveBeenNthCalledWith(1, "npm", [
      "ls",
      "-g",
      "claude-sub",
      "--depth=0",
      "--parseable",
    ]);
    expect(runCommand).toHaveBeenNthCalledWith(2, "npm", ["uninstall", "-g", "claude-sub"]);
  });

  it("does not edit the rc file when the marker is absent", async () => {
    const homeDir = await tempHome();
    const rcFile = join(homeDir, ".bashrc");
    await writeFile(rcFile, "alias ll='ls -la'\n", "utf8");
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "/pkg/lib/node_modules/claude-sub\n" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "removed\n" });

    const result = await uninstall({
      env: { SHELL: "/bin/bash" },
      homeDir,
      nonInteractive: true,
      runCommand,
    });

    expect(result.removedMarker).toBe(false);
    await expect(readFile(rcFile, "utf8")).resolves.toBe("alias ll='ls -la'\n");
  });

  it("skips package uninstall when the global package is absent", async () => {
    const homeDir = await tempHome();
    await writeFile(
      join(homeDir, ".zshrc"),
      'export PATH="/pkg/bin:$PATH" # claude-sub setup\n',
      "utf8"
    );
    const runCommand = vi.fn().mockResolvedValueOnce({ exitCode: 1, stdout: "" });

    const result = await uninstall({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      nonInteractive: true,
      runCommand,
    });

    expect(result.packagePresent).toBe(false);
    expect(result.uninstalledPackage).toBe(false);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("does not change anything when the user declines marker removal", async () => {
    const homeDir = await tempHome();
    const rcFile = join(homeDir, ".zshrc");
    await writeFile(rcFile, 'export PATH="/pkg/bin:$PATH" # claude-sub setup\n', "utf8");
    const runCommand = vi.fn().mockResolvedValueOnce({ exitCode: 1, stdout: "" });

    const result = await uninstall({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      confirm: async () => false,
      runCommand,
    });

    expect(result.exitCode).toBe(1);
    expect(result.removedMarker).toBe(false);
    await expect(readFile(rcFile, "utf8")).resolves.toBe(
      'export PATH="/pkg/bin:$PATH" # claude-sub setup\n'
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("removes the rc file when removing the marker line leaves it empty", async () => {
    const homeDir = await tempHome();
    const rcFile = join(homeDir, ".zshrc");
    await writeFile(rcFile, 'export PATH="/pkg/bin:$PATH" # claude-sub setup\n', "utf8");
    const runCommand = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "" });

    await uninstall({
      env: { SHELL: "/bin/zsh" },
      homeDir,
      confirm: async () => true,
      runCommand,
    });

    await expect(access(rcFile, constants.F_OK)).rejects.toThrow();
  });
});

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "claude-sub-uninstall-"));
}

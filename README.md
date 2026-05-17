# claude-plan-wrapper

A PATH shim that intercepts `claude -p` invocations and routes them through an interactive Claude session under a PTY — so the call bills against your Claude plan instead of API credits. Opt-in via `CLAUDE_USE_SUB=1`; installing the shim changes nothing unless the env var is set.

## Install

```bash
npm install -g claude-plan-wrapper
```

Or install from a local tarball:

```bash
npm pack  # produces claude-plan-wrapper-<version>.tgz
npm install -g ./claude-plan-wrapper-<version>.tgz
```

After global installation, verify the shim is on your PATH and appears before the real `claude` binary:

```bash
which -a claude
# /path/to/global/node_modules/.bin/claude  ← shim (must be first)
# /usr/local/bin/claude                      ← real claude
```

## PATH ordering requirement

The shim binary must appear **before** the real `claude` binary in your `PATH`. Global npm installs typically place binaries in `~/.npm-global/bin` or `/usr/local/lib/node_modules/.bin`. If `which claude` resolves to the real binary instead of the shim, prepend the npm global bin directory to your `PATH`:

```bash
export PATH="$(npm bin -g):$PATH"
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.) to make it permanent.

## Usage

### Without CLAUDE_USE_SUB (default passthrough)

All invocations behave identically to the real `claude` binary:

```bash
claude --help
claude --version
claude -p "summarise this file" < input.txt
```

### CLAUDE_USE_SUB opt-in

Set `CLAUDE_USE_SUB=1` to route `-p`/`--print` invocations through an interactive Claude session instead of the API:

```bash
CLAUDE_USE_SUB=1 claude -p "reply with the single word OK"
# OK
```

The shim spawns interactive Claude under a PTY, sends the prompt as keystrokes, waits for the response, extracts the clean text, and writes it to stdout. Exit code is `0` on success, `124` on timeout.

Set `CLAUDE_USE_SUB` in your shell profile to make it permanent:

```bash
export CLAUDE_USE_SUB=1
```

## Supported flags

When `CLAUDE_USE_SUB=1`, only the following flags are forwarded to the interactive session:

| Flag | Description |
|------|-------------|
| `--model` / `-m` | Model to use (e.g. `claude-sonnet-4-5`) |
| `--verbose` / `-v` | Enable verbose output |

All other flags cause the shim to exit non-zero with a message naming the unsupported flag.

## Known limitations

The following flags and features are **not supported** in plan mode:

- `--output-format` (JSON, streaming JSON) — PTY output is plain text only
- `--resume` — session resume requires API session IDs not available in PTY mode
- `--json` — equivalent to `--output-format json`, not supported
- `--no-markdown` — not forwarded; output formatting follows interactive Claude defaults
- Piped stdin — the PTY session cannot receive stdin piped from a shell pipe
- Non-print invocations — only `-p`/`--print` routes through plan mode; all other invocations pass through to the real binary

## Timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_USE_SUB_TIMEOUT_MS` | `300000` (5 min) | Overall timeout for a plan-mode invocation |

If the session times out, the shim exits with code `124` and writes a diagnostic to stderr containing the elapsed time and the last 4 KB of raw PTY output.

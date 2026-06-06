# claude-sub

A PATH shim that routes `claude -p` calls through an interactive Claude session so they bill against your Claude subscription instead of API credits.

> **Disclaimer.** Using `claude-sub` may violate the [Anthropic terms of service](https://www.anthropic.com/legal/consumer-terms) governing your Claude subscription — review them and the [Claude Code documentation](https://docs.claude.com/en/docs/claude-code/overview) before relying on it.

`claude-sub` installs ahead of the real `claude` binary on your `PATH`. When enabled, it intercepts `-p` / `--print` invocations, spawns interactive Claude under a PTY, sends the prompt as keystrokes, waits for the reply, extracts the clean text, and writes it to stdout. Every other invocation passes straight through. Toggle it on or off with `csub on` / `csub off` — no environment variables required.

## Install

```bash
npx claude-sub setup
```

`setup` detects your shell (`zsh` / `bash` / `fish`), shows you the one-line `PATH` edit it plans to make, asks for confirmation, writes the line with a marker comment so `uninstall` can reverse it, and verifies that `which claude` resolves to the shim. The shim ships disabled — your existing `claude` calls keep working until you run `csub on`.

To remove it later:

```bash
npx claude-sub uninstall
```

This strips the marker line from your rc file and uninstalls the global package.

## Usage

```bash
csub on        # route `claude -p` through your subscription
csub off       # passthrough only; `claude -p` hits the API again
csub status    # show whether routing is on or off, and which `claude` PATH wins
```

Once `csub on` is set, just use `claude` as you normally would:

```bash
claude -p "reply with the single word OK"
# OK
```

Exit code is `0` on success, `124` if the PTY session times out.

## Supported flags

When routing is enabled, the following flags are forwarded to the interactive session:

| Flag | Description |
|------|-------------|
| `--model` / `-m` | Model to use (e.g. `claude-sonnet-4-5`) |
| `--verbose` / `-v` | Enable verbose output |
| `--append-system-prompt` | Append to the system prompt |
| `--system-prompt` | Override the system prompt |
| `--permission-mode` | Set permission mode (e.g. `acceptEdits`) |
| `--dangerously-skip-permissions` | Skip permission prompts |
| `--settings` | Path to a settings file |
| `--agent` / `--agents` | Agent configuration |
| `--strict-mcp-config` | Strict MCP config validation |
| `--bare` | Bare-mode output |
| `--add-dir` | Additional working directories (variadic) |
| `--mcp-config` | MCP config paths (variadic) |
| `--allowedTools` / `--allowed-tools` | Tool allowlist (variadic) |
| `--disallowedTools` / `--disallowed-tools` | Tool denylist (variadic) |
| `--tools` | Tool list (variadic) |
| `--plugin-dir` | Plugin directories (variadic) |
| `--output-format stream-json` | Emit a Claude-compatible NDJSON event stream — consumed by the shim, not forwarded (see [Streaming JSON output](#streaming-json-output)) |

Any other flag causes the shim to exit non-zero with a message naming the unsupported flag and listing what's accepted.

## Streaming JSON output

`claude -p --output-format stream-json` is **emulated**, not rejected. With `csub on` the call routes through your subscription like any other `-p` invocation — no "will bill against API" warning — and the shim emits a Claude-compatible NDJSON (newline-delimited JSON) event stream on stdout. The PTY session is still plain text internally; the streaming events are synthesized around it.

```bash
claude -p --output-format stream-json "reply with the single word OK"
# {"type":"heartbeat"}
# {"type":"assistant","message":{"content":[{"type":"text","text":"OK"}]}}
# {"type":"result","result":"OK"}
```

Events emitted:

- **`heartbeat`** — `{"type":"heartbeat"}`, written **during** the run at most once every ~10s, and only when the PTY produced new output since the previous interval. It is a genuine proof-of-life: when the interactive session stalls, the stream goes quiet, so a watcher can tell "still working" from "wedged." Nothing acts on the heartbeat automatically — it is purely observational.
- **`assistant`** — `{"type":"assistant","message":{"content":[{"type":"text","text":"…"}]}}`, written once at the end, carrying the full clean reply.
- **`result`** — `{"type":"result","result":"…"}`, the terminal event carrying the same clean, sentinel-stripped text the plain-text path produces.

These shapes satisfy the `jq` filters a stream-json consumer (e.g. `ralph.sh`) uses: `.type=="assistant" | .message.content[] | select(.type=="text").text` for live text and `.type=="result" | .result` for the outcome. This makes `claude-sub` a drop-in for tools that pipe `--output-format stream-json` through `jq`.

Only `stream-json` is supported. Other `--output-format` values (e.g. `json`) still exit non-zero with a message; on timeout/idle failure the shim writes a diagnostic to stderr and exits non-zero, as in plain mode.

## Known limitations

The following flags and features are **not supported** when routing is on:

- `--output-format json` — only `stream-json` is emulated (see [Streaming JSON output](#streaming-json-output)); the single-shot JSON format is not
- `--resume` — session resume requires API session IDs not available under a PTY
- `--json` — equivalent to `--output-format json`, not supported
- `--no-markdown` — not forwarded; output formatting follows interactive Claude defaults
- Piped stdin — the PTY session cannot receive stdin piped from a shell pipe
- Non-print invocations — only `-p` / `--print` routes through your subscription; everything else passes through to the real binary

## Timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_USE_SUB_TIMEOUT_MS` | `300000` (5 min) | Overall timeout for a routed invocation |

If the session times out, the shim exits with code `124` and writes a diagnostic to stderr containing the elapsed time and the last 4 KB of raw PTY output.

## Troubleshooting

Run `csub doctor` first — it reports whether the shim is in front of the real `claude` binary and prints a remediation hint if it isn't.

**`which claude` resolves to the real binary.** Your global npm bin directory isn't ahead of the real `claude` on your `PATH`. `npx claude-sub setup` adds the right line for your shell; if you ran it before installing `claude` itself, run it again, or open a fresh shell so the rc-file change takes effect.

**Manual install (without `setup`).** If you'd rather wire the `PATH` yourself:

```bash
npm install -g claude-sub
# then, in your shell profile:
export PATH="$(npm bin -g):$PATH"
```

After that, `which -a claude` should list the shim first and the real `claude` second.

**Install from a local tarball.**

```bash
pnpm pack  # produces claude-sub-<version>.tgz
npm install -g ./claude-sub-<version>.tgz
```

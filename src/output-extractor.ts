export const SENTINEL = "__PLAN_MODE_DONE_7a3b9f__";

export const SENTINEL_SYSTEM_PROMPT =
  `When you have finished your complete reply, output the following token ` +
  `on its own line with nothing else on that line: ${SENTINEL}`;

// Matches ANSI/VT escape sequences: CSI (full param/intermediate/final byte
// ranges — covers kitty-keyboard `\x1b[<u`/`\x1b[>1u`, colon SGR, bracketed
// paste `\x1b[200~`), OSC, charset designation, and two-char escapes
// (including DEC privates like ESC 7 / ESC 8).
const ANSI_RE =
  /\x1b(?:\[[0-9:;<=>?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[()][A-B0-9]|[A-Za-z0-9=<>~])/g;

export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface ExtractResult {
  found: boolean;
  reply: string;
}

/**
 * Return everything before the first line that is exactly the sentinel.
 * When the sentinel is absent, the whole text is returned with found:false.
 */
function sliceAtSentinel(clean: string): ExtractResult {
  const lines = clean.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === SENTINEL) {
      const reply = lines.slice(0, i).join("\n").replace(/\s+$/, "");
      return { found: true, reply };
    }
  }
  return { found: false, reply: clean.replace(/\s+$/, "") };
}

/**
 * Legacy raw-terminal-buffer extractor. The interactive TUI repaints via cursor
 * movement and renders markdown (which eats the sentinel's `__`), so this is no
 * longer the primary path — kept as a degraded fallback when the session
 * transcript is unavailable. See {@link extractReplyFromTranscript}.
 */
export function extractReply(raw: string): ExtractResult {
  return sliceAtSentinel(stripAnsi(raw));
}

/**
 * Extract the model's reply from a Claude Code session transcript (JSONL).
 *
 * Each line is a session event; assistant turns carry the model's text in
 * `message.content`. We take the last assistant turn whose text contains the
 * sentinel (the final reply, after any tool-use turns), and return everything
 * before the sentinel line. The transcript stores the raw model text, so the
 * sentinel survives intact here — unlike the markdown-rendered terminal buffer.
 *
 * Falls back to the last assistant turn's text (found:false) when no sentinel
 * is present, and to an empty result when there are no assistant turns yet.
 */
export function extractReplyFromTranscript(jsonl: string): ExtractResult {
  const lines = jsonl.split("\n");
  let lastWithSentinel: string | null = null;
  let lastAssistant: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      // Partial final line during streaming, or a non-JSON line — skip it.
      continue;
    }
    const text = assistantText(event);
    if (text === null) continue;
    lastAssistant = text;
    if (text.includes(SENTINEL)) lastWithSentinel = text;
  }

  if (lastWithSentinel !== null) return sliceAtSentinel(lastWithSentinel);
  if (lastAssistant !== null) return { found: false, reply: lastAssistant.replace(/\s+$/, "") };
  return { found: false, reply: "" };
}

/** Pull the concatenated text of an assistant event, or null if it isn't one. */
function assistantText(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; message?: unknown };
  if (e.type !== "assistant") return null;
  const message = e.message as { content?: unknown } | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content
    .filter(
      (c): c is { type: string; text: string } =>
        typeof c === "object" &&
        c !== null &&
        (c as { type?: unknown }).type === "text" &&
        typeof (c as { text?: unknown }).text === "string"
    )
    .map((c) => c.text)
    .join("");
}

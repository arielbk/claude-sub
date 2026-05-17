export const SENTINEL = "__PLAN_MODE_DONE_7a3b9f__";

export const SENTINEL_SYSTEM_PROMPT =
  `When you have finished your complete reply, output the following token ` +
  `on its own line with nothing else on that line: ${SENTINEL}`;

// Matches ANSI/VT escape sequences: CSI, OSC, and two-char escapes
const ANSI_RE =
  /\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*(?:\x07|\x1b\\)|[()][A-B0-9]|[A-Za-z])/g;

export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export interface ExtractResult {
  found: boolean;
  reply: string;
}

export function extractReply(raw: string): ExtractResult {
  const clean = stripAnsi(raw);
  const lines = clean.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === SENTINEL) {
      const reply = lines.slice(0, i).join("\n").replace(/\s+$/, "");
      return { found: true, reply };
    }
  }

  return { found: false, reply: clean.replace(/\s+$/, "") };
}

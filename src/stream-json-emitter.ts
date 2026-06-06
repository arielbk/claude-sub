export interface StreamJsonAssistantEvent {
  type: "assistant";
  message: {
    content: Array<{ type: "text"; text: string }>;
  };
}

export interface StreamJsonResultEvent {
  type: "result";
  result: string;
}

export interface StreamJsonHeartbeatEvent {
  type: "heartbeat";
}

export type StreamJsonEvent =
  | StreamJsonAssistantEvent
  | StreamJsonResultEvent
  | StreamJsonHeartbeatEvent;

export function emitStreamJsonHeartbeat(): string {
  return `${JSON.stringify({ type: "heartbeat" } satisfies StreamJsonHeartbeatEvent)}\n`;
}

export function emitStreamJsonResult(reply: string): string {
  const events: StreamJsonEvent[] = [
    {
      type: "assistant",
      message: {
        content: [{ type: "text", text: reply }],
      },
    },
    {
      type: "result",
      result: reply,
    },
  ];

  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

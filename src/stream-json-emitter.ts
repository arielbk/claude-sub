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

export type StreamJsonEvent = StreamJsonAssistantEvent | StreamJsonResultEvent;

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

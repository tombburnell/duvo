import { NextResponse, type NextRequest } from "next/server";

import {
  isValidAgentRunId,
  subscribeAgentTrace,
  type AgentTraceEvent,
} from "@/lib/agent/traceEvents";

export const runtime = "nodejs";

function encodeSseEvent(event: AgentTraceEvent): string {
  return `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: NextRequest): Promise<Response> {
  const runId = request.nextUrl.searchParams.get("runId")?.trim();

  if (!runId || !isValidAgentRunId(runId)) {
    return NextResponse.json({ error: "Run id is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      unsubscribe?.();
    },
    start(controller) {
      let isOpen = true;

      controller.enqueue(encoder.encode(": connected\n\n"));

      unsubscribe = subscribeAgentTrace(runId, {
        close: () => {
          if (!isOpen) {
            return;
          }

          isOpen = false;
          controller.close();
        },
        enqueue: (event) => {
          if (!isOpen) {
            return;
          }

          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        },
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

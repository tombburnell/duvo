import { describe, expect, it, vi } from "vitest";

import {
  closeAgentTrace,
  isValidAgentRunId,
  publishAgentTraceEvent,
  subscribeAgentTrace,
  type AgentTraceEvent,
} from "./traceEvents";

describe("isValidAgentRunId", () => {
  it("accepts compact client-generated run ids", () => {
    expect(isValidAgentRunId("run_123456")).toBe(true);
    expect(isValidAgentRunId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      true,
    );
  });

  it("rejects missing, short, or unsafe run ids", () => {
    expect(isValidAgentRunId("short")).toBe(false);
    expect(isValidAgentRunId("../unsafe-run-id")).toBe(false);
    expect(isValidAgentRunId("run id with spaces")).toBe(false);
  });
});

describe("agent trace events", () => {
  it("publishes ordered events to subscribers", () => {
    const runId = "run_ordered_123";
    const events: AgentTraceEvent[] = [];
    const close = vi.fn();

    const unsubscribe = subscribeAgentTrace(runId, {
      close,
      enqueue: (event) => events.push(event),
    });

    publishAgentTraceEvent(runId, {
      message: "Run started.",
      type: "lifecycle",
    });
    publishAgentTraceEvent(runId, {
      message: "write_document started.",
      payload: { phase: "started", toolName: "write_document" },
      type: "tool",
    });

    expect(events).toMatchObject([
      { message: "Run started.", seq: 1, type: "lifecycle" },
      {
        message: "write_document started.",
        payload: { phase: "started", toolName: "write_document" },
        seq: 2,
        type: "tool",
      },
    ]);

    unsubscribe();
    closeAgentTrace(runId);
  });

  it("closes subscribers and drops later events", () => {
    const runId = "run_close_123";
    const events: AgentTraceEvent[] = [];
    const close = vi.fn();

    subscribeAgentTrace(runId, {
      close,
      enqueue: (event) => events.push(event),
    });

    publishAgentTraceEvent(runId, {
      message: "Run completed.",
      payload: { phase: "completed" },
      type: "lifecycle",
    });
    closeAgentTrace(runId);
    publishAgentTraceEvent(runId, {
      message: "Late event.",
      type: "lifecycle",
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);

    closeAgentTrace(runId);
  });
});

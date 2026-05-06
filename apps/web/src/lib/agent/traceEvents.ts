export type AgentTraceEventType = "lifecycle" | "tool" | "reasoning" | "error";

export type AgentTracePayload = Record<string, string | number | boolean | null>;

export interface AgentTraceEvent {
  createdAt: string;
  message: string;
  payload?: AgentTracePayload;
  seq: number;
  type: AgentTraceEventType;
}

export interface AgentTraceEventInput {
  message: string;
  payload?: AgentTracePayload;
  type: AgentTraceEventType;
}

interface AgentTraceSubscriber {
  close: () => void;
  enqueue: (event: AgentTraceEvent) => void;
}

interface AgentTraceRun {
  closed: boolean;
  seq: number;
  subscribers: Set<AgentTraceSubscriber>;
}

const runs = new Map<string, AgentTraceRun>();
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function isValidAgentRunId(runId: string): boolean {
  return RUN_ID_PATTERN.test(runId);
}

function getRun(runId: string): AgentTraceRun {
  const existingRun = runs.get(runId);

  if (existingRun) {
    return existingRun;
  }

  const run = {
    closed: false,
    seq: 0,
    subscribers: new Set<AgentTraceSubscriber>(),
  };

  runs.set(runId, run);

  return run;
}

export function publishAgentTraceEvent(
  runId: string | undefined,
  input: AgentTraceEventInput,
): void {
  if (!runId || !isValidAgentRunId(runId)) {
    return;
  }

  const run = getRun(runId);

  if (run.closed) {
    return;
  }

  run.seq += 1;

  const event: AgentTraceEvent = {
    createdAt: new Date().toISOString(),
    message: input.message,
    payload: input.payload,
    seq: run.seq,
    type: input.type,
  };

  for (const subscriber of run.subscribers) {
    subscriber.enqueue(event);
  }
}

export function subscribeAgentTrace(
  runId: string,
  subscriber: AgentTraceSubscriber,
): () => void {
  const run = getRun(runId);

  if (run.closed) {
    subscriber.close();
    return () => undefined;
  }

  run.subscribers.add(subscriber);

  return () => {
    run.subscribers.delete(subscriber);
  };
}

export function closeAgentTrace(runId: string | undefined): void {
  if (!runId || !isValidAgentRunId(runId)) {
    return;
  }

  const run = runs.get(runId);

  if (!run || run.closed) {
    return;
  }

  run.closed = true;

  for (const subscriber of run.subscribers) {
    subscriber.close();
  }

  run.subscribers.clear();
  runs.delete(runId);
}

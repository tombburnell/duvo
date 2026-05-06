"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface AgentSuccessResponse {
  files: string[];
  messages: string;
}

interface AgentErrorResponse {
  error: string;
}

type AgentResponse = AgentSuccessResponse | AgentErrorResponse;
type AgentTraceEventType = "lifecycle" | "tool" | "reasoning" | "error";

interface AgentTraceEvent {
  createdAt: string;
  message: string;
  payload?: Record<string, string | number | boolean | null>;
  seq: number;
  type: AgentTraceEventType;
}

function isAgentSuccessResponse(
  response: AgentResponse,
): response is AgentSuccessResponse {
  return "messages" in response && "files" in response;
}

function getReasoningKey(event: AgentTraceEvent): string | null {
  const reasoningKey = event.payload?.reasoningKey;

  return typeof reasoningKey === "string" ? reasoningKey : null;
}

function appendTraceEvent(
  currentEvents: AgentTraceEvent[],
  nextEvent: AgentTraceEvent,
): AgentTraceEvent[] {
  if (nextEvent.type !== "reasoning") {
    return [...currentEvents, nextEvent];
  }

  const reasoningKey = getReasoningKey(nextEvent);

  if (!reasoningKey) {
    return [...currentEvents, nextEvent];
  }

  const existingEventIndex = currentEvents.findIndex(
    (event) =>
      event.type === "reasoning" && getReasoningKey(event) === reasoningKey,
  );

  if (existingEventIndex === -1) {
    return [...currentEvents, nextEvent];
  }

  return currentEvents.map((event, index) => {
    if (index !== existingEventIndex) {
      return event;
    }

    return {
      ...event,
      createdAt: nextEvent.createdAt,
      message: `${event.message}${nextEvent.message}`,
    };
  });
}

export default function Home() {
  const [enableDeepWikiMcp, setEnableDeepWikiMcp] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [messages, setMessages] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [traceEvents, setTraceEvents] = useState<AgentTraceEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  function closeTraceStream() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  function openTraceStream(runId: string) {
    closeTraceStream();

    const eventSource = new EventSource(
      `/api/agent/events?runId=${encodeURIComponent(runId)}`,
    );
    eventSourceRef.current = eventSource;

    function closeCurrentTraceStream() {
      if (eventSourceRef.current === eventSource) {
        closeTraceStream();
        return;
      }

      eventSource.close();
    }

    eventSource.onmessage = (messageEvent) => {
      let traceEvent: AgentTraceEvent;

      try {
        traceEvent = JSON.parse(messageEvent.data) as AgentTraceEvent;
      } catch (parseError) {
        console.error("Failed to parse trace event", { error: parseError });
        return;
      }

      setTraceEvents((currentEvents) =>
        appendTraceEvent(currentEvents, traceEvent),
      );

      if (
        (traceEvent.type === "lifecycle" || traceEvent.type === "error") &&
        traceEvent.payload?.scope === "run" &&
        (traceEvent.payload?.phase === "completed" ||
          traceEvent.payload?.phase === "failed")
      ) {
        closeCurrentTraceStream();
      }
    };

    eventSource.onerror = () => {
      closeCurrentTraceStream();
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessages("");
    setFiles([]);
    setError("");
    setTraceEvents([]);

    const trimmedInstructions = instructions.trim();

    if (!trimmedInstructions) {
      setError("Add instructions before submitting.");
      return;
    }

    setIsSubmitting(true);
    const runId = crypto.randomUUID();
    openTraceStream(runId);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enableDeepWikiMcp,
          instructions: trimmedInstructions,
          runId,
        }),
      });
      const data = (await response.json()) as AgentResponse;

      if (!response.ok || !isAgentSuccessResponse(data)) {
        setError(
          "error" in data ? data.error : "Unable to process instructions.",
        );
        closeTraceStream();
        return;
      }

      setMessages(data.messages);
      setFiles(data.files);
    } catch (submitError) {
      console.error("Failed to submit instructions", { error: submitError });
      setError("Unable to process instructions.");
      closeTraceStream();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleInstructionsKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Automation platform
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Send instructions to an agent
          </h1>
          <p className="max-w-2xl text-slate-600">
            Submit instructions and receive an agent response with optional
            downloadable text files.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
                <CardDescription>
                  Ask for a text response, or request a downloadable text file
                  such as Markdown or CSV.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <Textarea
                    aria-label="Agent instructions"
                    disabled={isSubmitting}
                    onKeyDown={handleInstructionsKeyDown}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Fetch the latest AI news headlines and write them to a downloadable Markdown file..."
                    value={instructions}
                  />
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
                    <input
                      checked={enableDeepWikiMcp}
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                      disabled={isSubmitting}
                      onChange={(event) =>
                        setEnableDeepWikiMcp(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      Allow the agent to use the DeepWiki public MCP server.
                    </span>
                  </label>
                  <Button disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Sending..." : "Send instructions"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {error ? (
              <Alert>
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {messages ? (
              <Card>
                <CardHeader>
                  <CardTitle>Agent response</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-sm leading-6 text-white">
                    {messages}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            {files.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Downloads</CardTitle>
                  <CardDescription>
                    Files written by the agent for this request.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {files.map((file) => (
                      <li key={file}>
                        <a
                          className="text-sm font-medium text-slate-950 underline underline-offset-4 hover:text-slate-700"
                          download
                          href={`/downloads/${encodeURIComponent(file)}`}
                        >
                          {file}
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Live trace of lifecycle, tool, and reasoning events.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {traceEvents.length > 0 ? (
                <ol className="space-y-3">
                  {traceEvents.map((traceEvent) => (
                    <li
                      className="rounded-lg border border-slate-200 bg-white p-3"
                      key={traceEvent.seq}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {traceEvent.type}
                        </span>
                        <span className="text-xs text-slate-400">
                          #{traceEvent.seq}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-700">
                        {traceEvent.message}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  Submit instructions to watch the automation unfold here.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

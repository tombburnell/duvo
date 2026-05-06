"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

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

function isAgentSuccessResponse(
  response: AgentResponse,
): response is AgentSuccessResponse {
  return "messages" in response && "files" in response;
}

export default function Home() {
  const [instructions, setInstructions] = useState("");
  const [messages, setMessages] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessages("");
    setFiles([]);
    setError("");

    const trimmedInstructions = instructions.trim();

    if (!trimmedInstructions) {
      setError("Add instructions before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ instructions: trimmedInstructions }),
      });
      const data = (await response.json()) as AgentResponse;

      if (!response.ok || !isAgentSuccessResponse(data)) {
        setError(
          "error" in data ? data.error : "Unable to process instructions.",
        );
        return;
      }

      setMessages(data.messages);
      setFiles(data.files);
    } catch (submitError) {
      console.error("Failed to submit instructions", { error: submitError });
      setError("Unable to process instructions.");
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
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
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

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
            <CardDescription>
              Ask for a text response, or request a downloadable text file such
              as Markdown or CSV.
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
      </section>
    </main>
  );
}

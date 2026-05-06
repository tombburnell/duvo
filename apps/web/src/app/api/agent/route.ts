import { NextResponse, type NextRequest } from "next/server";

import OpenAI from "openai";

import { evaluateAgentRun } from "@/lib/agent/evaluateAgentRun";
import { readDownloadFileContent } from "@/lib/agent/downloadFiles";
import { runInstructions } from "@/lib/agent/runInstructions";
import { isValidAgentRunId } from "@/lib/agent/traceEvents";

export const runtime = "nodejs";

interface AgentRequestBody {
  enableDeepWikiMcp?: boolean;
  instructions: string;
  runId?: string;
}

interface AgentSuccessResponse {
  evaluation?: {
    justification: string;
    score: number;
  };
  files: string[];
  messages: string;
}

interface AgentErrorResponse {
  error: string;
}

function isAgentRequestBody(value: unknown): value is AgentRequestBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<AgentRequestBody>;

  return (
    typeof candidate.instructions === "string" &&
    (candidate.enableDeepWikiMcp === undefined ||
      typeof candidate.enableDeepWikiMcp === "boolean") &&
    (candidate.runId === undefined || typeof candidate.runId === "string")
  );
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AgentSuccessResponse | AgentErrorResponse>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse agent request body", { error });

    return NextResponse.json(
      { error: "Instructions are required." },
      { status: 400 },
    );
  }

  if (!isAgentRequestBody(body)) {
    return NextResponse.json(
      { error: "Instructions are required." },
      { status: 400 },
    );
  }

  const instructions = body.instructions.trim();
  const runId = body.runId?.trim();

  if (!instructions) {
    return NextResponse.json(
      { error: "Instructions are required." },
      { status: 400 },
    );
  }

  if (runId && !isValidAgentRunId(runId)) {
    return NextResponse.json({ error: "Run id is invalid." }, { status: 400 });
  }

  try {
    const result = await runInstructions(instructions, {
      enableDeepWikiMcp: body.enableDeepWikiMcp === true,
      runId,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;

    let evaluation: AgentSuccessResponse["evaluation"];

    if (apiKey && model) {
      try {
        const writtenFiles = await Promise.all(
          result.files.map(async (filename) => ({
            content: await readDownloadFileContent(filename),
            filename,
          })),
        );

        evaluation = await evaluateAgentRun(new OpenAI({ apiKey }), {
          finalAnswer: result.messages,
          model,
          question: instructions,
          writtenFiles,
        });
      } catch (evaluationError) {
        console.error("Agent answer evaluation failed", {
          error: evaluationError,
        });
      }
    }

    return NextResponse.json({
      ...result,
      ...(evaluation ? { evaluation } : {}),
    });
  } catch (error) {
    console.error("Failed to process agent request", { error });

    return NextResponse.json(
      { error: "Unable to process instructions." },
      { status: 502 },
    );
  }
}

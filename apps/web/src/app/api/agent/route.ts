import { NextResponse, type NextRequest } from "next/server";

import { runInstructions } from "@/lib/agent/runInstructions";

export const runtime = "nodejs";

interface AgentRequestBody {
  instructions: string;
}

interface AgentSuccessResponse {
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

  return typeof (value as Partial<AgentRequestBody>).instructions === "string";
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

  if (!instructions) {
    return NextResponse.json(
      { error: "Instructions are required." },
      { status: 400 },
    );
  }

  try {
    const result = await runInstructions(instructions);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to process agent request", { error });

    return NextResponse.json(
      { error: "Unable to process instructions." },
      { status: 502 },
    );
  }
}

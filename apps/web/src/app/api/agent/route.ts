import { NextResponse, type NextRequest } from "next/server";

interface AgentRequestBody {
  instructions: string;
}

interface AgentSuccessResponse {
  reply: string;
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
  try {
    const body: unknown = await request.json();

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

    return NextResponse.json({
      reply: `Phase 1 stub response received your instructions:\n\n${instructions}`,
    });
  } catch (error) {
    console.error("Failed to process agent request", { error });

    return NextResponse.json(
      { error: "Unable to process instructions." },
      { status: 400 },
    );
  }
}

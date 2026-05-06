import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";

import { writeDownloadFile } from "@/lib/agent/downloadFiles";

export interface AgentRunResult {
  files: string[];
  messages: string;
}

interface FunctionCall {
  arguments: string;
  callId: string;
  name: string;
}

interface WriteDocumentArguments {
  content: string;
  filename: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFunctionCalls(response: unknown): FunctionCall[] {
  if (!isRecord(response) || !Array.isArray(response.output)) {
    return [];
  }

  return response.output.flatMap((item): FunctionCall[] => {
    if (
      !isRecord(item) ||
      item.type !== "function_call" ||
      typeof item.name !== "string" ||
      typeof item.call_id !== "string" ||
      typeof item.arguments !== "string"
    ) {
      return [];
    }

    return [
      {
        arguments: item.arguments,
        callId: item.call_id,
        name: item.name,
      },
    ];
  });
}

function parseWriteDocumentArguments(value: string): WriteDocumentArguments {
  const parsed: unknown = JSON.parse(value);

  if (
    !isRecord(parsed) ||
    typeof parsed.filename !== "string" ||
    typeof parsed.content !== "string"
  ) {
    throw new Error("write_document arguments are invalid.");
  }

  return {
    content: parsed.content,
    filename: parsed.filename,
  };
}

async function handleFunctionCall(
  functionCall: FunctionCall,
): Promise<{ output: string; writtenFilename: string | null }> {
  if (functionCall.name !== "write_document") {
    return {
      output: JSON.stringify({ error: "Unknown tool." }),
      writtenFilename: null,
    };
  }

  try {
    const writeArguments = parseWriteDocumentArguments(functionCall.arguments);
    const result = await writeDownloadFile(writeArguments);

    return {
      output: JSON.stringify(result),
      writtenFilename: result.filename,
    };
  } catch (error) {
    console.error("Failed to write document tool output", { error });

    return {
      output: JSON.stringify({ error: "Unable to write document." }),
      writtenFilename: null,
    };
  }
}

export async function runInstructions(
  instructions: string,
): Promise<AgentRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!model) {
    throw new Error("OPENAI_MODEL is not configured.");
  }

  console.info("OpenAI SDK configuration loaded", { model });

  const openai = new OpenAI({ apiKey });
  const files = new Set<string>();
  const tools: Tool[] = [
    {
      type: "web_search_preview",
    },
    {
      type: "function",
      name: "write_document",
      description:
        "Write a UTF-8 text document to public downloads and return the canonical filename.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: {
            type: "string",
            description: "The complete UTF-8 text content to write.",
          },
          filename: {
            type: "string",
            description:
              "User-friendly filename with a text extension such as .txt, .md, or .csv.",
          },
        },
        required: ["filename", "content"],
      },
      strict: true,
    },
  ];

  let response = await openai.responses.create({
    instructions:
      "When the user asks for a downloadable document, use write_document with a clear user-friendly filename and appropriate text extension. For current AI news requests, use the built-in web search tool to find recent headlines before writing the document. Finish with a concise user-facing message that mentions any files created.",
    input: instructions,
    model,
    tools,
  });

  for (let toolRound = 0; toolRound < 4; toolRound += 1) {
    const functionCalls = getFunctionCalls(response);

    if (functionCalls.length === 0) {
      break;
    }

    const toolOutputs = await Promise.all(
      functionCalls.map(async (functionCall) => {
        const result = await handleFunctionCall(functionCall);

        if (result.writtenFilename) {
          files.add(result.writtenFilename);
        }

        return {
          type: "function_call_output" as const,
          call_id: functionCall.callId,
          output: result.output,
        };
      }),
    );

    response = await openai.responses.create({
      input: toolOutputs,
      model,
      previous_response_id: response.id,
      tools,
    });
  }

  if (!response.output_text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    files: [...files],
    messages: response.output_text,
  };
}

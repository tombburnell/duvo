import { randomUUID } from "node:crypto";
import { inspect } from "node:util";

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsBase,
  ResponseStreamEvent,
  Tool,
} from "openai/resources/responses/responses";

import { writeDownloadFile } from "@/lib/agent/downloadFiles";
import {
  closeAgentTrace,
  publishAgentTraceEvent,
} from "@/lib/agent/traceEvents";

export interface AgentRunResult {
  files: string[];
  messages: string;
}

export interface AgentRunOptions {
  enableDeepWikiMcp?: boolean;
  runId?: string;
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

interface OpenAIStreamTraceState {
  reasoningKeys: Map<string, string>;
}

interface RemoteMcpTool {
  require_approval: "never";
  server_label: string;
  server_url: string;
  type: "mcp";
}

const AGENT_INSTRUCTIONS =
  "Always produce a final user-facing answer in the assistant final message/output_text. Do not leave the answer only in reasoning, tool calls, or tool results. For simple questions, answer directly in that final message. When the user asks for a downloadable document, use write_document with a clear user-friendly filename and appropriate text extension, then still include a concise final user-facing message that mentions any files created. For current AI news requests, use the built-in web search tool to find recent headlines before writing or answering.";
const DEEPWIKI_MCP_SERVER_LABEL = "deepwiki";
const DEEPWIKI_MCP_SERVER_URL = "https://mcp.deepwiki.com/mcp";

interface ResponseOutputItemLog {
  contentTypes?: string[];
  id?: string;
  name?: string;
  status?: string;
  textLength?: number;
  type: string;
}

interface ResponseLogSummary {
  hasHostedToolActivity: boolean;
  outputItemCount: number;
  outputItems: ResponseOutputItemLog[];
  outputTextLength: number;
  responseId: string;
  status?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function debugPayload(label: string, payload: unknown): void {
  console.debug(
    label,
    inspect(payload, {
      breakLength: 120,
      colors: false,
      depth: null,
      maxArrayLength: null,
      maxStringLength: null,
    }),
  );
}

function getStringProperty(
  value: Record<string, unknown>,
  propertyName: string,
): string | undefined {
  const propertyValue = value[propertyName];

  return typeof propertyValue === "string" ? propertyValue : undefined;
}

function getResponseOutputText(response: Response): string {
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text;
  }

  return response.output
    .flatMap((item): string[] => {
      if (!isRecord(item) || item.type !== "message") {
        return [];
      }

      const content = Array.isArray(item.content) ? item.content : [];

      return content.flatMap((contentItem): string[] => {
        if (
          !isRecord(contentItem) ||
          contentItem.type !== "output_text" ||
          typeof contentItem.text !== "string"
        ) {
          return [];
        }

        return [contentItem.text];
      });
    })
    .join("");
}

function summarizeResponseOutputItem(item: unknown): ResponseOutputItemLog {
  if (!isRecord(item)) {
    return {
      type: "unknown",
    };
  }

  const content = Array.isArray(item.content) ? item.content : [];
  const contentTypes: string[] = [];
  let textLength = 0;

  for (const contentItem of content) {
    if (!isRecord(contentItem)) {
      continue;
    }

    const contentType = getStringProperty(contentItem, "type");

    if (contentType) {
      contentTypes.push(contentType);
    }

    const text = getStringProperty(contentItem, "text");

    if (text) {
      textLength += text.length;
    }
  }

  return {
    contentTypes: contentTypes.length > 0 ? contentTypes : undefined,
    id: getStringProperty(item, "id"),
    name: getStringProperty(item, "name"),
    status: getStringProperty(item, "status"),
    textLength: textLength > 0 ? textLength : undefined,
    type: getStringProperty(item, "type") ?? "unknown",
  };
}

function summarizeResponseForLog(response: Response): ResponseLogSummary {
  const usage = isRecord(response.usage)
    ? {
        inputTokens:
          typeof response.usage.input_tokens === "number"
            ? response.usage.input_tokens
            : undefined,
        outputTokens:
          typeof response.usage.output_tokens === "number"
            ? response.usage.output_tokens
            : undefined,
        reasoningTokens:
          isRecord(response.usage.output_tokens_details) &&
          typeof response.usage.output_tokens_details.reasoning_tokens ===
            "number"
            ? response.usage.output_tokens_details.reasoning_tokens
            : undefined,
        totalTokens:
          typeof response.usage.total_tokens === "number"
            ? response.usage.total_tokens
            : undefined,
      }
    : undefined;

  return {
    hasHostedToolActivity: hasHostedToolActivity(response),
    outputItemCount: response.output.length,
    outputItems: response.output.map(summarizeResponseOutputItem),
    outputTextLength: getResponseOutputText(response).length,
    responseId: response.id,
    status: response.status,
    usage,
  };
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
  options: AgentRunOptions,
): Promise<{ output: string; writtenFilename: string | null }> {
    debugPayload("Agent function call debug payload", {
    arguments: functionCall.arguments,
    callId: functionCall.callId,
    runId: options.runId,
    toolName: functionCall.name,
  });

  if (functionCall.name !== "write_document") {
    publishAgentTraceEvent(options.runId, {
      message: `Unknown tool requested: ${functionCall.name}.`,
      payload: {
        callId: functionCall.callId,
        phase: "failed",
        toolName: functionCall.name,
      },
      type: "tool",
    });

    return {
      output: JSON.stringify({ error: "Unknown tool." }),
      writtenFilename: null,
    };
  }

  try {
    publishAgentTraceEvent(options.runId, {
      message: "write_document started.",
      payload: {
        callId: functionCall.callId,
        phase: "started",
        toolName: functionCall.name,
      },
      type: "tool",
    });

    const writeArguments = parseWriteDocumentArguments(functionCall.arguments);
    debugPayload("write_document debug payload", {
      content: writeArguments.content,
      filename: writeArguments.filename,
      runId: options.runId,
    });

    publishAgentTraceEvent(options.runId, {
      message: `Writing ${writeArguments.filename}.`,
      payload: {
        callId: functionCall.callId,
        filename: writeArguments.filename,
        phase: "writing",
        toolName: functionCall.name,
      },
      type: "tool",
    });

    const result = await writeDownloadFile(writeArguments);

    publishAgentTraceEvent(options.runId, {
      message: `Created ${result.filename}.`,
      payload: {
        callId: functionCall.callId,
        filename: result.filename,
        phase: "completed",
        toolName: functionCall.name,
      },
      type: "tool",
    });

    return {
      output: JSON.stringify(result),
      writtenFilename: result.filename,
    };
  } catch (error) {
    console.error("Failed to write document tool output", { error });
    publishAgentTraceEvent(options.runId, {
      message: "write_document failed.",
      payload: {
        callId: functionCall.callId,
        phase: "failed",
        toolName: functionCall.name,
      },
      type: "tool",
    });

    return {
      output: JSON.stringify({ error: "Unable to write document." }),
      writtenFilename: null,
    };
  }
}

function supportsReasoning(model: string): boolean {
  return /^(gpt-5|o[134]|computer-use-preview)/.test(model);
}

function getReasoningConfig(model: string): ResponseCreateParamsBase["reasoning"] {
  if (!supportsReasoning(model)) {
    return undefined;
  }

  return {
    effort: "low",
    summary: "auto",
  };
}

function getReasoningDeltaMessage(value: string): string {
  if (value.length <= 240) {
    return value;
  }

  return `${value.slice(0, 237)}...`;
}

function getReasoningSourceKey(
  event: Extract<
    ResponseStreamEvent,
    {
      type:
        | "response.reasoning_text.delta"
        | "response.reasoning_summary_text.delta";
    }
  >,
  round: number,
): string {
  if (event.type === "response.reasoning_summary_text.delta") {
    return `${round}:summary:${event.output_index}:${event.summary_index}`;
  }

  return `${round}:reasoning:${event.output_index}:${event.content_index}`;
}

function getReasoningKey(
  state: OpenAIStreamTraceState,
  sourceKey: string,
): string {
  const existingKey = state.reasoningKeys.get(sourceKey);

  if (existingKey) {
    return existingKey;
  }

  const reasoningKey = randomUUID();
  state.reasoningKeys.set(sourceKey, reasoningKey);

  return reasoningKey;
}

function hasHostedToolActivity(response: Response): boolean {
  return response.output.some((item) => {
    if (!isRecord(item) || typeof item.type !== "string") {
      return false;
    }

    return [
      "mcp_call",
      "mcp_list_tools",
      "web_search_call",
      "file_search_call",
      "code_interpreter_call",
    ].includes(item.type);
  });
}

function publishDeepWikiMcpCallEvents(
  response: Response,
  options: AgentRunOptions & { round: number },
): void {
  for (const item of response.output) {
    if (
      !isRecord(item) ||
      item.type !== "mcp_call" ||
      getStringProperty(item, "server_label") !== DEEPWIKI_MCP_SERVER_LABEL
    ) {
      continue;
    }

    const toolName = getStringProperty(item, "name") ?? "unknown_tool";
    const status = getStringProperty(item, "status");
    const hasError = typeof item.error === "string" && item.error.length > 0;
    const failed = hasError || status === "failed";

    publishAgentTraceEvent(options.runId, {
      message: `DeepWiki MCP started: ${toolName}.`,
      payload: {
        phase: "started",
        round: options.round,
        serverLabel: DEEPWIKI_MCP_SERVER_LABEL,
        toolName,
      },
      type: "tool",
    });
    publishAgentTraceEvent(options.runId, {
      message: `DeepWiki MCP ${failed ? "failed" : "completed"}: ${toolName}.`,
      payload: {
        phase: failed ? "failed" : "completed",
        round: options.round,
        serverLabel: DEEPWIKI_MCP_SERVER_LABEL,
        toolName,
      },
      type: failed ? "error" : "tool",
    });
  }
}

function getResponseId(response: Response): string {
  return response.id;
}

function publishOpenAIStreamEvent(
  event: ResponseStreamEvent,
  options: AgentRunOptions & { round: number },
  state: OpenAIStreamTraceState,
): void {
  switch (event.type) {
    case "response.created":
      publishAgentTraceEvent(options.runId, {
        message: `Model round ${options.round} created.`,
        payload: {
          phase: "created",
          responseId: getResponseId(event.response),
          round: options.round,
          scope: "model_round",
        },
        type: "lifecycle",
      });
      return;

    case "response.completed":
      publishAgentTraceEvent(options.runId, {
        message: `Model round ${options.round} completed.`,
        payload: {
          phase: "completed",
          responseId: getResponseId(event.response),
          round: options.round,
          scope: "model_round",
        },
        type: "lifecycle",
      });
      return;

    case "response.failed":
      publishAgentTraceEvent(options.runId, {
        message: `Model round ${options.round} failed.`,
        payload: {
          phase: "failed",
          responseId: getResponseId(event.response),
          round: options.round,
          scope: "model_round",
        },
        type: "error",
      });
      return;

    case "response.incomplete":
      publishAgentTraceEvent(options.runId, {
        message: `Model round ${options.round} stopped incomplete.`,
        payload: {
          phase: "incomplete",
          responseId: getResponseId(event.response),
          round: options.round,
          scope: "model_round",
        },
        type: "error",
      });
      return;

    case "response.function_call_arguments.done": {
      const toolName = typeof event.name === "string" ? event.name : "";

      if (!toolName) {
        return;
      }

      publishAgentTraceEvent(options.runId, {
        message: `Tool requested: ${toolName}.`,
        payload: {
          phase: "requested",
          round: options.round,
          toolName,
        },
        type: "tool",
      });
      return;
    }

    case "response.web_search_call.in_progress":
      publishAgentTraceEvent(options.runId, {
        message: "Web search started.",
        payload: {
          phase: "started",
          round: options.round,
          toolName: "web_search_preview",
        },
        type: "tool",
      });
      return;

    case "response.web_search_call.searching":
      publishAgentTraceEvent(options.runId, {
        message: "Web search is searching.",
        payload: {
          phase: "searching",
          round: options.round,
          toolName: "web_search_preview",
        },
        type: "tool",
      });
      return;

    case "response.web_search_call.completed":
      publishAgentTraceEvent(options.runId, {
        message: "Web search completed.",
        payload: {
          phase: "completed",
          round: options.round,
          toolName: "web_search_preview",
        },
        type: "tool",
      });
      return;

    case "response.reasoning_text.delta":
    case "response.reasoning_summary_text.delta": {
      const message = getReasoningDeltaMessage(event.delta);

      if (!message) {
        return;
      }

      debugPayload("OpenAI reasoning debug payload", {
        delta: event.delta,
        event,
        round: options.round,
        runId: options.runId,
      });

      const reasoningKey = getReasoningKey(
        state,
        getReasoningSourceKey(event, options.round),
      );

      publishAgentTraceEvent(options.runId, {
        message,
        payload: {
          phase: "delta",
          reasoningKey,
          round: options.round,
        },
        type: "reasoning",
      });
      return;
    }

    case "error":
      publishAgentTraceEvent(options.runId, {
        message: "OpenAI stream error.",
        payload: {
          code: event.code,
          phase: "failed",
          round: options.round,
        },
        type: "error",
      });
      return;

    default:
      return;
  }
}

async function createResponseWithTrace(
  openai: OpenAI,
  params: Omit<ResponseCreateParamsBase, "stream">,
  options: AgentRunOptions & { round: number },
): Promise<Response> {
  publishAgentTraceEvent(options.runId, {
    message: `Model round ${options.round} started.`,
    payload: {
      phase: "started",
      round: options.round,
      scope: "model_round",
    },
    type: "lifecycle",
  });

  debugPayload("OpenAI request debug payload", {
    params,
    round: options.round,
    runId: options.runId,
  });

  const stream = openai.responses.stream({
    ...params,
    stream: true,
  });
  const state: OpenAIStreamTraceState = {
    reasoningKeys: new Map<string, string>(),
  };

  try {
    for await (const event of stream) {
      publishOpenAIStreamEvent(event, options, state);
    }
  } catch (error) {
    console.error("OpenAI response stream failed", {
      error,
      round: options.round,
      runId: options.runId,
    });
    throw error;
  }

  const response = await stream.finalResponse();
  publishDeepWikiMcpCallEvents(response, options);

  debugPayload("OpenAI response debug payload", {
    response,
    round: options.round,
    runId: options.runId,
  });

  console.info("OpenAI response completed", {
    response: summarizeResponseForLog(response),
    round: options.round,
    runId: options.runId,
  });

  return response;
}

function getAgentTools(enableDeepWikiMcp: boolean): Tool[] {
  const tools: Tool[] = [
    {
      type: "web_search_preview",
    },
  ];

  if (enableDeepWikiMcp) {
    const deepWikiMcpTool: RemoteMcpTool = {
      require_approval: "never",
      server_label: DEEPWIKI_MCP_SERVER_LABEL,
      server_url: DEEPWIKI_MCP_SERVER_URL,
      type: "mcp",
    };

    tools.push(deepWikiMcpTool as Tool);
  }

  tools.push({
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
  });

  return tools;
}

export async function runInstructions(
  instructions: string,
  options: AgentRunOptions = {},
): Promise<AgentRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey) {
    publishAgentTraceEvent(options.runId, {
      message: "Run failed: OPENAI_API_KEY is not configured.",
      payload: {
        phase: "failed",
        scope: "run",
      },
      type: "error",
    });
    closeAgentTrace(options.runId);
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!model) {
    publishAgentTraceEvent(options.runId, {
      message: "Run failed: OPENAI_MODEL is not configured.",
      payload: {
        phase: "failed",
        scope: "run",
      },
      type: "error",
    });
    closeAgentTrace(options.runId);
    throw new Error("OPENAI_MODEL is not configured.");
  }

  console.info("OpenAI SDK configuration loaded", { model });
  publishAgentTraceEvent(options.runId, {
    message: "Run started.",
    payload: {
      phase: "started",
      scope: "run",
    },
    type: "lifecycle",
  });
  publishAgentTraceEvent(options.runId, {
    message: `Using model ${model}.`,
    payload: {
      model,
      phase: "configured",
      scope: "run",
    },
    type: "lifecycle",
  });

  const openai = new OpenAI({ apiKey });
  const files = new Set<string>();
  const reasoning = getReasoningConfig(model);
  const tools = getAgentTools(options.enableDeepWikiMcp === true);

  try {
    let response = await createResponseWithTrace(
      openai,
      {
        instructions: AGENT_INSTRUCTIONS,
        input: instructions,
        model,
        reasoning,
        tools,
      },
      {
        ...options,
        round: 1,
      },
    );

    let requestedHostedToolFinalization = false;

    for (let toolRound = 0; toolRound < 4; toolRound += 1) {
      const functionCalls = getFunctionCalls(response);
      const responseSummary = summarizeResponseForLog(response);

      console.info("Agent response loop decision", {
        functionCallCount: functionCalls.length,
        requestedHostedToolFinalization,
        response: responseSummary,
        runId: options.runId,
        toolRound,
      });

      if (functionCalls.length === 0) {
        if (
          !getResponseOutputText(response) &&
          hasHostedToolActivity(response) &&
          !requestedHostedToolFinalization
        ) {
          requestedHostedToolFinalization = true;
          publishAgentTraceEvent(options.runId, {
            message: "Asking model to summarize completed tool results.",
            payload: {
              phase: "finalizing",
              scope: "run",
            },
            type: "lifecycle",
          });

          response = await createResponseWithTrace(
            openai,
            {
              input:
                "Use the previous response context to provide the final user-facing answer now. Put the answer in the assistant final message/output_text. Do not leave the answer only in reasoning, tool calls, or tool results. If a downloadable document is appropriate, call write_document before the final answer.",
              model,
              previous_response_id: response.id,
              reasoning,
              tools,
            },
            {
              ...options,
              round: toolRound + 2,
            },
          );
          continue;
        }

        break;
      }

      publishAgentTraceEvent(options.runId, {
        message: `Executing ${functionCalls.length} tool call${functionCalls.length === 1 ? "" : "s"}.`,
        payload: {
          count: functionCalls.length,
          phase: "started",
        },
        type: "lifecycle",
      });

      const toolOutputs = await Promise.all(
        functionCalls.map(async (functionCall) => {
          const result = await handleFunctionCall(functionCall, options);

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

      response = await createResponseWithTrace(
        openai,
        {
          input: toolOutputs,
          model,
          previous_response_id: response.id,
          reasoning,
          tools,
        },
        {
          ...options,
          round: toolRound + 2,
        },
      );
    }

    const outputText = getResponseOutputText(response);

    if (!outputText) {
      console.warn("OpenAI response was empty after agent loop", {
        response: summarizeResponseForLog(response),
        runId: options.runId,
      });
      throw new Error("OpenAI returned an empty response.");
    }

    publishAgentTraceEvent(options.runId, {
      message: "Run completed.",
      payload: {
        phase: "completed",
        scope: "run",
      },
      type: "lifecycle",
    });

    return {
      files: [...files],
      messages: outputText,
    };
  } catch (error) {
    publishAgentTraceEvent(options.runId, {
      message: "Run failed.",
      payload: {
        phase: "failed",
        scope: "run",
      },
      type: "error",
    });
    throw error;
  } finally {
    closeAgentTrace(options.runId);
  }
}

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsBase,
} from "openai/resources/responses/responses";

export interface WrittenFileForEvaluation {
  content: string;
  filename: string;
}

export interface AgentRunEvaluation {
  justification: string;
  score: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function supportsReasoning(model: string): boolean {
  return /^(gpt-5|o[134]|computer-use-preview)/.test(model);
}

function getReasoningConfig(
  model: string,
): ResponseCreateParamsBase["reasoning"] {
  if (!supportsReasoning(model)) {
    return undefined;
  }

  return {
    effort: "low",
    summary: "auto",
  };
}

const JUDGE_INSTRUCTIONS =
  "You assess how well an assistant run addressed the user's request. Consider the user's question, the assistant's final message, and the full contents of any write_document files listed (these are user-facing downloads). Output ONLY via the required JSON schema. score is your confidence (0 to 1) that the combination of the final answer and file contents provides a useful, relevant response to the question.";

const evaluationJsonSchema = {
  additionalProperties: false,
  properties: {
    justification: {
      description:
        "One or two short sentences explaining the score; plain language.",
      type: "string",
    },
    score: {
      description:
        "Confidence from 0 (not useful / irrelevant) to 1 (fully addresses the request).",
      maximum: 1,
      minimum: 0,
      type: "number",
    },
  },
  required: ["score", "justification"],
  type: "object",
} as const;

function buildJudgeUserInput(input: {
  finalAnswer: string;
  question: string;
  writtenFiles: WrittenFileForEvaluation[];
}): string {
  const filesBlock =
    input.writtenFiles.length === 0
      ? "No write_document files were created for this run."
      : input.writtenFiles
          .map(
            (file, index) =>
              `--- File ${index + 1}: ${file.filename} ---\n${file.content}`,
          )
          .join("\n\n");

  return `User question:\n${input.question}\n\nAssistant final answer:\n${input.finalAnswer}\n\nWritten file contents (write_document tool, if any):\n${filesBlock}`;
}

function parseEvaluationJson(text: string): AgentRunEvaluation {
  const parsed: unknown = JSON.parse(text);

  if (
    !isRecord(parsed) ||
    typeof parsed.score !== "number" ||
    typeof parsed.justification !== "string" ||
    Number.isNaN(parsed.score) ||
    parsed.score < 0 ||
    parsed.score > 1
  ) {
    throw new Error(
      "Judge response did not match the expected evaluation shape.",
    );
  }

  return {
    justification: parsed.justification.trim(),
    score: parsed.score,
  };
}

export async function evaluateAgentRun(
  openai: OpenAI,
  input: {
    finalAnswer: string;
    model: string;
    question: string;
    writtenFiles: WrittenFileForEvaluation[];
  },
): Promise<AgentRunEvaluation> {
  const response = await openai.responses.create({
    input: buildJudgeUserInput(input),
    instructions: JUDGE_INSTRUCTIONS,
    model: input.model,
    reasoning: getReasoningConfig(input.model),
    stream: false,
    text: {
      format: {
        name: "agent_run_evaluation",
        schema: evaluationJsonSchema,
        strict: true,
        type: "json_schema",
      },
      verbosity: "low",
    },
  });

  const outputText = getResponseOutputText(response);

  if (!outputText.trim()) {
    throw new Error("Judge model returned an empty response.");
  }

  return parseEvaluationJson(outputText);
}

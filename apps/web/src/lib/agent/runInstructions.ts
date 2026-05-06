import OpenAI from "openai";

export async function runInstructions(instructions: string): Promise<string> {
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

  const response = await openai.responses.create({
    input: instructions,
    model,
  });

  if (!response.output_text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return response.output_text;
}

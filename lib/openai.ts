import OpenAI from "openai";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  return new OpenAI({ apiKey });
}

/** Two bounded AI stages must fit inside the route's 60-second server budget. */
export const OPENAI_REQUEST_TIMEOUT_MS = 28_000;
const MAX_JSON_OUTPUT_TOKENS = 4_000;

function stripFences(value: string): string {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function parseAIJson<T = any>(value: unknown): T {
  if (typeof value !== "string" || !value.trim()) throw new Error("AI returned an empty response.");
  const cleaned = stripFences(value);
  try { return JSON.parse(cleaned) as T; } catch {
    throw new Error("AI returned incomplete or malformed JSON.");
  }
}

export const openai = {
  get responses() {
    const client = getClient();
    return {
      ...client.responses,
      create: async (params: any, options?: any) => {
        const nextParams = {
          ...params,
          model: params?.model || "gpt-5-mini",
          max_output_tokens: params?.max_output_tokens ?? MAX_JSON_OUTPUT_TOKENS,
          text: { ...(params?.text || {}), format: { type: "json_object" } },
        };
        const signal = options?.signal || AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS);
        return client.responses.create(nextParams, { ...(options || {}), signal });
      },
    };
  },
} as unknown as OpenAI;

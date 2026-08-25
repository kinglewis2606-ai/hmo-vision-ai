import OpenAI from "openai";

/**
 * Keep the client lazy. Next.js evaluates route modules during `next build`,
 * so constructing OpenAI at module scope makes CI fail when the secret is not
 * available.
 *
 * Vision calls are deliberately bounded. A hung upstream request must become a
 * normal application error/fallback, not a dead HTTP connection that makes the
 * browser report "Failed to fetch" after several minutes.
 */
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  return new OpenAI({ apiKey });
}

const OPENAI_REQUEST_TIMEOUT_MS = 110_000;
const MAX_JSON_OUTPUT_TOKENS = 12_000;

function looksLikeCompleteJson(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    JSON.parse(value.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));
    return true;
  } catch {
    return false;
  }
}

function addJsonRepairInstruction(input: any): any {
  const repair = {
    role: "user",
    content: [{
      type: "input_text",
      text: "Return the complete answer again as one valid JSON object. Do not use markdown fences. Do not truncate any array or object. Ensure every string is correctly escaped and every array/object is closed before returning.",
    }],
  };
  if (Array.isArray(input)) return [...input, repair];
  if (typeof input === "string") return [repair, { role: "user", content: [{ type: "input_text", text: input }] }];
  return input;
}

function requestOptions(options?: any) {
  return {
    ...(options || {}),
    signal: options?.signal || AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
  };
}

export const openai = {
  get responses() {
    const client = getClient();
    return {
      ...client.responses,
      create: async (params: any, options?: any) => {
        const nextParams = params?.model === "gpt-5"
          ? {
              ...params,
              model: "gpt-5-mini",
              max_output_tokens: params.max_output_tokens ?? MAX_JSON_OUTPUT_TOKENS,
            }
          : {
              ...params,
              max_output_tokens: params?.max_output_tokens ?? MAX_JSON_OUTPUT_TOKENS,
            };

        // All current floor-plan Responses calls consume response.output_text
        // as JSON. Enforce JSON at the API boundary instead of relying on the
        // prompt's "Return JSON only" instruction. The larger output budget
        // prevents a large room list/report from being cut off mid-array.
        const structuredParams = {
          ...nextParams,
          text: {
            ...(nextParams?.text || {}),
            format: {
              type: "json_object",
            },
          },
        };

        const first = await client.responses.create(structuredParams, requestOptions(options));
        if (looksLikeCompleteJson(first.output_text)) return first;

        // A response can still be incomplete (for example because generation
        // was interrupted). Retry once with an explicit completion instruction
        // and a fresh timeout signal.
        const retryParams = {
          ...structuredParams,
          input: addJsonRepairInstruction(structuredParams.input),
          max_output_tokens: Math.max(Number(structuredParams.max_output_tokens) || 0, MAX_JSON_OUTPUT_TOKENS),
        };
        return client.responses.create(retryParams, requestOptions(options));
      },
    };
  },
} as unknown as OpenAI;

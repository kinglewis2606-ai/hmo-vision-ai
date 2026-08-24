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

export const openai = {
  get responses() {
    const client = getClient();
    return {
      ...client.responses,
      create: (params: any, options?: any) => {
        const nextParams = params?.model === "gpt-5"
          ? {
              ...params,
              model: "gpt-5-mini",
              max_output_tokens: params.max_output_tokens ?? 3500,
            }
          : params;

        // All current floor-plan Responses calls consume response.output_text
        // as JSON. Enforce JSON at the API boundary instead of relying on the
        // prompt's "Return JSON only" instruction, which can still produce
        // malformed JSON and crash JSON.parse in the analysis route.
        const structuredParams = {
          ...nextParams,
          text: {
            ...(nextParams?.text || {}),
            format: {
              type: "json_object",
            },
          },
        };

        const requestOptions = {
          ...(options || {}),
          signal: options?.signal || AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS),
        };
        return client.responses.create(structuredParams, requestOptions);
      },
    };
  },
} as unknown as OpenAI;
